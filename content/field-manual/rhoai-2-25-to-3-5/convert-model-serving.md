---
title: Convert model serving
description: Phase 4 — move every Serverless and ModelMesh InferenceService to RawDeployment before the serving modes are removed, and prepare any LLMInferenceService.
weight: 40
icon: fa-solid fa-right-left
---

**Outcome:** every InferenceService on the cluster is `RawDeployment` and `Ready=True`, no multi-model ServingRuntime is left, and the KServe lint shows no critical workload findings. That makes it safe to disable Serverless and ModelMesh in Phase 5. **Phase 4 of 10 · Before upgrade.** Next: [Remediate the platform]({{< relref "/field-manual/rhoai-2-25-to-3-5/remediate-platform" >}}).

This is the core of the migration. 3.5 removes **Serverless** and **ModelMesh**, and RawDeployment (displayed as **`Standard`** after the upgrade) is the only serving mode left. **Convert first; disable later.** If you disable a serving mode while a model still depends on it, the model stops serving.

> [!TIP]
> **Already RawDeployment-only?** If your [Baseline]({{< relref "/field-manual/rhoai-2-25-to-3-5/baseline" >}}) inventory shows no `Serverless` or `ModelMesh` rows and you run no `LLMInferenceService`, run the check in [4.1](#enumerate) to confirm, then skip to [Remediate the platform]({{< relref "/field-manual/rhoai-2-25-to-3-5/remediate-platform" >}}).

**If you don't convert:** after the operator upgrade, every Serverless and ModelMesh ISVC returns **HTTP 503**, and `LLMInferenceService` workloads fail without the new authentication config.

## Prerequisites

- [Assess]({{< relref "/field-manual/rhoai-2-25-to-3-5/assess" >}}) complete. You have a shell in `rhai-cli-0` (in-pod commands are marked **inside the pod**) and a workstation shell.
- Project access to every namespace that holds an `InferenceService` or `LLMInferenceService`.
- **You have audited the cluster for other consumers of OpenShift Service Mesh v2** and confirmed they can be migrated or removed.

> [!IMPORTANT]
> **Service Mesh conflict.** If something else on the cluster depends on Service Mesh v2, upgrade those applications to [Service Mesh v3](https://docs.redhat.com/en/documentation/red_hat_openshift_service_mesh/3.1/html/migrating_from_service_mesh_2_to_service_mesh_3/) **before** you upgrade OpenShift AI. If an OSSM v2 subscription is still present when the Gateway API `GatewayClass` is created, the Cluster Ingress Operator can't install the OSSM v3 components it needs. Gateway API resources then have no effect and nothing routes traffic.

Before converting anything, save every ISVC and ServingRuntime spec. This is your per-object rollback source:

```sh
oc get isvc,servingruntime -A -o yaml > ./serving-pre-convert-$(date -u +%Y%m%dT%H%MZ).yaml && ls -l ./serving-pre-convert-*.yaml
```

Expected output: one non-empty file (shape):

```text
-rw-r--r--  1 you  staff  48211 Nov 11 15:10 ./serving-pre-convert-20261111T1510Z.yaml
```

## Procedure

### 4.1 Enumerate what needs converting {#enumerate}

**Inside the pod**, run the serving-focused lint:

```sh
rhai-cli lint --target-version 3.5 --verbose --checks "*kserve*" --checks "*modelmesh*"
```

How to read the rows: **workload / kserve** rows are ISVCs that need conversion (this phase). **component / kserve or modelmeshserving** rows are cluster configuration changes (Phase 5). **dependency** rows are operator installs or removals (Phase 5).

From your workstation, list every ISVC that is *not* already RawDeployment:

```sh
oc get isvc -A -o json | jq -r '.items[]
  | select((.metadata.annotations."serving.kserve.io/deploymentMode" // "") != "RawDeployment")
  | "\(.metadata.namespace)\t\(.metadata.name)\t\(.metadata.annotations."serving.kserve.io/deploymentMode")"'
```

Expected output: one row per ISVC to convert, or nothing if you have none (shape):

```text
ml-project-a	my-serverless-isvc	Serverless
ml-project-c	my-modelmesh-isvc	ModelMesh
```

> [!NOTE]
> **Why a migrate action instead of `oc patch`.** The KServe admission webhook **rejects in-place edits of `deploymentMode`**. Conversion is *backup, delete, recreate*. The `rhai-cli migrate` actions do this for you. The manual fallback is KB [7134025](https://access.redhat.com/articles/7134025).

### 4.2 Convert Serverless InferenceServices {#serverless}

`modelserving.serverless-to-raw` works **across the whole cluster** in one run. It keeps each ISVC's name and handles the ServiceAccount, Role, and RoleBinding auth resources for you. It asks a single `Proceed with conversion? [y/N]` question. Answer `y` (see [Known issue: a declined prompt reports success]({{< relref "/field-manual/rhoai-2-25-to-3-5/assess#ki-declined-prompt" >}})).

**Inside the pod**, in a `tmux`/`screen` session:

```sh
# 1. Identify
rhai-cli lint --target-version 3.5 --verbose --checks "*kserve*" --isvc-deployment-mode serverless
# 2. Preview
rhai-cli migrate run --migration modelserving.serverless-to-raw --target-version 3.5.0 --dry-run
# 3. Apply (answer y)
rhai-cli migrate run --migration modelserving.serverless-to-raw --target-version 3.5.0
```

Read the closing lines of step 3. If they say **`completed with skipped steps`**, nothing was converted: re-run and answer `y`. The action removes the Serverless ISVCs, their ServingRuntimes, and the related auth and Istio resources, then creates the RawDeployment replacements.

Verify that no Serverless ISVC is left anywhere:

```sh
oc get isvc -A -o json | jq -r '.items[]
  | select((.metadata.annotations."serving.kserve.io/deploymentMode" // "") == "Serverless"
        or (.status.deploymentMode // "") == "Serverless")
  | "\(.metadata.namespace)/\(.metadata.name)"'
```

Expected output:

```text
(no output)
```

Verify that each converted ISVC is RawDeployment and Ready:

```sh
oc get isvc -n <namespace> -o json | jq -r '["NAME","DEPLOYMENT_MODE","READY"], (.items[] | [.metadata.name, .status.deploymentMode, (.status.conditions[] | select(.type=="Ready") | .status)]) | @tsv' | column -t
```

Expected output (shape):

```text
NAME                DEPLOYMENT_MODE  READY
my-serverless-isvc  RawDeployment    True
```

> [!NOTE]
> **Converted Serverless models get a new endpoint.** Re-run the [baseline inference probe]({{< relref "/field-manual/rhoai-2-25-to-3-5/baseline#inference-probe" >}}) and record each new `.status.url`. These are the only model URLs you'll need to publish to consumers. Models that were already RawDeployment keep theirs.

#### Known issue: recreated ISVC sits `READY=False` for minutes {#ki-slow-ready}

**Symptom.** Right after conversion, the ISVC reports `READY=False`.

**Diagnosis.** RawDeployment pulls and loads the model from scratch, and a CPU model can take a few minutes. Watch the predictor:

```sh
oc get pods -n <ns> -l serving.kserve.io/inferenceservice=<name>
```

**Workaround.** Wait. If the pod never becomes Ready, check its logs (`oc logs -n <ns> <pod> -c kserve-container`).

**Tracker.** None. Expected behavior.

### 4.3 Convert ModelMesh InferenceServices {#modelmesh}

ModelMesh is *multi-model serving*: one ServingRuntime hosts many models. 3.x has no ModelMesh, so each model is redeployed as a *single-model* RawDeployment ISVC that points `storageUri` at the same data. For natively supported formats (ONNX, OpenVINO IR) this is a true re-host, with no model conversion and no data movement.

`modelserving.modelmesh-to-raw` works **in place, one namespace at a time**. It keeps each ISVC's name, picks the single-model `kserve-ovms` runtime for ONNX and OpenVINO IR, and asks one `[y/N]` question.

**Inside the pod:**

```sh
# 1. Identify — note each namespace
rhai-cli lint --target-version 3.5 --verbose --checks "*kserve*" --isvc-deployment-mode modelmesh
# 2. Convert (answer y)
rhai-cli migrate run --migration modelserving.modelmesh-to-raw --target-version 3.5.0
```

Verify each ISVC:

```sh
oc get isvc <name> -n <namespace> -o jsonpath='mode={.status.deploymentMode} ready={.status.conditions[?(@.type=="Ready")].status}{"\n"}'
```

Expected output:

```text
mode=RawDeployment ready=True
```

If you get `ready=False` and the model is **PVC-backed OVMS**, you have hit the next known issue.

#### Known issue: PVC-backed OVMS model crash-loops after `modelmesh-to-raw` {#ki-ovms-pvc}

**Symptom.** The action reports `Migration completed successfully!`, but the predictor never becomes Ready. The failures show up in this order:

1. The webhook rejects the pod: `storage type must be one of [s3, hdfs, webhdfs]. storage type [pvc] is not supported`.
2. OVMS crash-loops: `Configuration file is invalid /models/model_config_list.json`. It kept the multi-model launch args.
3. The pod runs but stays `0/1`. No container port is declared, so the readiness probe defaults to `tcpSocket:8080`, while OVMS serves REST on 8888.

**Diagnosis.** The action moved the ISVC and runtime *metadata* across (`multiModel=false`, container renamed to `kserve-container`, `modelmesh-enabled` label dropped), but didn't rewrite storage, args, or the probe. Find the real PVC and model path. The `storage-config` secret key (for example `pvc-models`) is an alias, **not** the PVC name:

```sh
oc get pvc -n <ns>
oc get isvc <name> -n <ns> -o jsonpath='{.spec.predictor.model.storage.path}{"\n"}'
```

**Workaround.** Apply all three fixes. Example: ISVC `my-modelmesh-isvc` in `ml-project-c`, runtime `ovms-mm`, PVC `model-store`, path `mobilenet`. Substitute your own values.

```sh
# 1. PVC storage → storageUri
oc patch isvc my-modelmesh-isvc -n ml-project-c --type=merge \
  -p '{"spec":{"predictor":{"model":{"storageUri":"pvc://model-store/mobilenet","storage":null}}}}'

# 2. OVMS multi-model args → single-model (serve one model from /mnt/models)
oc patch servingruntime ovms-mm -n ml-project-c --type=json -p '[{"op":"replace","path":"/spec/containers/0/args","value":[
  "--model_name=my-modelmesh-isvc","--model_path=/mnt/models","--port=8001","--rest_port=8888",
  "--file_system_poll_wait_seconds=0","--grpc_bind_address=0.0.0.0","--rest_bind_address=0.0.0.0"]}]'

# 3. Declare the container port + a readiness probe on the OVMS REST port
oc patch servingruntime ovms-mm -n ml-project-c --type=json -p '[
  {"op":"add","path":"/spec/containers/0/ports","value":[{"containerPort":8888,"protocol":"TCP"}]},
  {"op":"add","path":"/spec/containers/0/readinessProbe","value":{"tcpSocket":{"port":8888},"periodSeconds":10,"failureThreshold":3,"timeoutSeconds":5}}]'

oc rollout restart deployment my-modelmesh-isvc-predictor -n ml-project-c
```

`pvc://<pvc>/<path>` points at the model root, and OVMS finds the version subdirectory itself. Verify:

```sh
oc get isvc my-modelmesh-isvc -n ml-project-c -o jsonpath='mode={.status.deploymentMode} ready={.status.conditions[?(@.type=="Ready")].status}{"\n"}'
```

Expected output:

```text
mode=RawDeployment ready=True
```

**Tracker.** None filed. Observed in a field run. Manual workflow: KB [7134025](https://access.redhat.com/articles/7134025).

### 4.4 Sweep leftover ModelMesh objects {#sweep}

Delete any leftover ModelMesh ISVCs and multi-model ServingRuntimes, but only after the new RawDeployment services work. With the in-place conversion, this usually finds nothing.

> [!CAUTION]
> **Confirm `multiModel: false` first.** `modelmesh-to-raw` converts the runtime **in place**, so the runtime it flipped is the *same object* your new ISVC depends on. The sweep below deletes runtimes where `.spec.multiModel == true`. If the flip didn't take effect, the sweep deletes the runtime your working model needs.

```sh
oc get servingruntime <name> -n <ns> -o jsonpath='{.spec.multiModel}{"\n"}'
```

Expected output:

```text
false
```

If it still says `true` while the ISVC is Ready on RawDeployment, **don't sweep**. Re-apply the conversion's own changes instead:

```sh
oc patch servingruntime <name> -n <ns> --type=merge -p '{"spec":{"multiModel":false}}'
oc patch servingruntime <name> -n <ns> --type=json \
  -p '[{"op":"replace","path":"/spec/containers/0/name","value":"kserve-container"}]'
```

Also cross-check that no runtime you're about to delete is referenced by a live ISVC (`.spec.predictor.model.runtime`). Then sweep:

```sh
# Leftover ModelMesh ISVCs
oc get isvc -n <namespace> -o json | jq -r '.items[]
  | select(.status.deploymentMode == "ModelMesh" or .metadata.annotations["serving.kserve.io/deploymentMode"] == "ModelMesh")
  | .metadata.name' | while read -r name; do echo "Deleting ModelMesh ISVC: $name"; oc delete isvc "$name" -n <namespace>; done

# Multi-model ServingRuntimes
oc get servingruntimes.serving.kserve.io -n <namespace> -o json | jq -r '.items[]
  | select(.spec.multiModel==true) | .metadata.name' \
  | while read -r name; do echo "Deleting ServingRuntime: $name"; oc delete servingruntime "$name" -n <namespace>; done
```

Expected output: usually nothing. Otherwise, one `Deleting …` line per leftover:

```text
(no output)
```

#### Known issue: multi-model ServingRuntime won't delete, "still in use" {#ki-runtime-in-use}

**Symptom.** `oc delete servingruntime` is refused because the runtime is still in use.

**Diagnosis.** A ModelMesh ISVC still references it:

```sh
oc get isvc -n <ns> -o jsonpath='{range .items[*]}{.metadata.name} {.spec.predictor.model.runtime}{"\n"}{end}'
```

**Workaround.** Delete the ModelMesh ISVC that references it first, then the runtime.

**Tracker.** None. Expected behavior.

### 4.5 Confirm every model is RawDeployment {#confirm}

```sh
oc get isvc -A -o json | jq -r '[.items[] | select((.metadata.annotations."serving.kserve.io/deploymentMode" // "") != "RawDeployment")] | length'
```

Expected output:

```text
0
```

**Inside the pod:**

```sh
rhai-cli lint --target-version 3.5 --checks "*kserve*" --checks "*modelmesh*"
```

Pass it through `grep` to count the critical workload rows:

```sh
rhai-cli lint --target-version 3.5 --checks "*kserve*" --checks "*modelmesh*" | grep '✗' | grep -c workload
```

Expected output:

```text
0
```

Critical rows in the `component` and `dependency` groups are cleared in Phase 5.

#### Known issue: leftover Serverless ISVC stuck in `Terminating` {#ki-terminating-isvc}

**Symptom.** `oc delete isvc` on a Serverless ISVC hangs in `Terminating` indefinitely.

**Diagnosis.** A finalizer deadlock. The Serverless ISVC's finalizer cleans up its Knative `Service` and Istio `VirtualService`. If Serverless or Service Mesh is already gone, the finalizer can't reach their APIs and never clears. This is why you convert and delete every Serverless ISVC **before** Phase 5 removes them.

```sh
oc get isvc <name> -n <ns> -o jsonpath='{.metadata.finalizers}{"\n"}'
oc get knativeserving -A
```

**Workaround.** If the operators are still installed, re-enable Serverless/Service Mesh, let the delete finish, then remove them in the right order. If they are already uninstalled, force-clear the finalizer and recreate the model as RawDeployment:

```sh
oc patch isvc <name> -n <ns> --type=merge -p '{"metadata":{"finalizers":null}}'
```

Then look for orphaned `ksvc` and `virtualservice` objects.

**Tracker.** None. A consequence of doing things in the wrong order.

#### Known issue: recreated ISVC rejected by a `deploymentMode` webhook error {#ki-webhook-mode}

**Symptom.** `oc apply` of a hand-recreated ISVC fails with a `deploymentMode` admission error.

**Diagnosis.** The webhook blocks *changing* the mode on an existing object. It doesn't block creating a new one. The `migrate` actions always create fresh objects, so this only happens on the manual fallback.

**Workaround.** Flip the annotation in your saved YAML, **delete** the old ISVC, then apply.

**Tracker.** KB [7134025](https://access.redhat.com/articles/7134025).

### 4.6 Prepare distributed inference (LLMInferenceService) {#llmisvc}

**Skip this section if you don't run `llm-d` / `LLMInferenceService`.** It needs a cluster admin (operators, Red Hat Connectivity Link) and the model owners (auth, freezing their resources).

**Install Red Hat Connectivity Link (RHCL).** In 3.x, RHCL replaces the standalone Authorino Operator for `LLMInferenceService` auth.

```sh
oc new-project kuadrant-system
```

Install **Red Hat Connectivity Link** into `kuadrant-system` through OLM (an OperatorGroup and Subscription in that namespace), the same pattern as cert-manager in [Pre-flight]({{< relref "/field-manual/rhoai-2-25-to-3-5/pre-flight" >}}). Look up the package and channel with `oc get packagemanifest -n openshift-marketplace | grep -i rhcl`. See [Installing Connectivity Link on OpenShift](https://docs.redhat.com/en/documentation/red_hat_connectivity_link/1.0/html/installing_connectivity_link_on_openshift/index).

Create the Kuadrant and Authorino resources:

```sh
oc apply -f - <<EOF
apiVersion: kuadrant.io/v1beta1
kind: Kuadrant
metadata:
  name: kuadrant
  namespace: kuadrant-system
EOF

oc wait Kuadrant -n kuadrant-system kuadrant --for=condition=Ready --timeout=10m

oc annotate svc/authorino-authorino-authorization \
  service.beta.openshift.io/serving-cert-secret-name=authorino-server-cert -n kuadrant-system

oc apply -f - <<EOF
apiVersion: operator.authorino.kuadrant.io/v1beta1
kind: Authorino
metadata:
  name: authorino
  namespace: kuadrant-system
spec:
  replicas: 1
  clusterWide: true
  listener:
    tls:
      enabled: true
      certSecretRef:
        name: authorino-server-cert
  oidcServer:
    tls:
      enabled: false
EOF

oc wait --for=condition=ready pod -l authorino-resource=authorino -n kuadrant-system --timeout=150s
```

Verify:

```sh
oc get csv -n kuadrant-system --no-headers | grep rhcl | awk '{print $NF}'
oc get pods -n kuadrant-system -l authorino-resource=authorino --no-headers | awk '{print $2, $3}'
```

Expected output:

```text
Succeeded
1/1 Running
```

{{< variant env disconnected >}}
**Disconnected RHCL.** Find the `wasm-shim` image SHA on the [wasm-shim-rhel9 catalog page](https://catalog.redhat.com/en/software/containers/rhcl-1/wasm-shim-rhel9/672a1e565d865456f8f2835f), then:

1. Create `wasm-plugin-pull-secret` in `openshift-ingress` from the cluster pull secret:

   ```sh
   oc get secret pull-secret -n openshift-config -o json | \
     jq 'del(.metadata.namespace, .metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp, .metadata.ownerReferences)' | \
     jq '.metadata.name="wasm-plugin-pull-secret"' | \
     oc apply -n openshift-ingress -f -
   ```

2. Patch the `rhcl-operator` Subscription with the mirrored WASM image (`RELATED_IMAGE_WASMSHIM`, `PROTECTED_REGISTRY`), using your mirror registry and the wasm-shim SHA.
3. Inject `WASM_INSECURE_REGISTRIES` into the Gateway pod through a `<gateway>-config` ConfigMap in `openshift-ingress`, and reference it from the Gateway's `infrastructure.parametersRef`.

The full command forms are in the official reference guide, §2.8.10.2.
{{< /variant >}}

**Configure authentication.** In 3.5, distributed inference is **secure by default**: unauthenticated clients get **HTTP 403**. Choose one:

- **Disable auth (dev/test only):**

  ```sh
  oc annotate llminferenceservice <name> -n <namespace> security.opendatahub.io/enable-auth=false
  ```

- **RBAC (recommended):** create a `ServiceAccount`, a `Role` that grants `get` on the named `llminferenceservices` resource, and a `RoleBinding`. Clients then send `Authorization: Bearer $(oc create token <sa> -n <namespace>)`.

**Freeze the LLMInferenceService config** to the 2.25 templates, so scheduler pods don't fail during the upgrade:

```sh
oc patch llmisvc <name> -n <namespace> --subresource=status --type=merge \
  -p '{"status":{"annotations":{"serving.kserve.io/config-llm-template":"kserve-config-llm-template","serving.kserve.io/config-llm-decode-template":"kserve-config-llm-decode-template","serving.kserve.io/config-llm-worker-data-parallel":"kserve-config-llm-worker-data-parallel","serving.kserve.io/config-llm-decode-worker-data-parallel":"kserve-config-llm-decode-worker-data-parallel","serving.kserve.io/config-llm-prefill-template":"kserve-config-llm-prefill-template","serving.kserve.io/config-llm-prefill-worker-data-parallel":"kserve-config-llm-prefill-worker-data-parallel","serving.kserve.io/config-llm-scheduler":"kserve-config-llm-scheduler","serving.kserve.io/config-llm-router-route":"kserve-config-llm-router-route"}}}'
```

Verify that every `LLMInferenceService` is Ready:

```sh
oc get llminferenceservices -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name} {.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}'
```

Expected output, per resource:

```text
ml-project-f/my-llm True
```

> [!IMPORTANT]
> **Scheduler argument changes in 3.5.** If you override `LLMInferenceService` scheduler arguments: arguments change from `camelCase` to `kebab-case` (`--certPath` → `--cert-path`), the default TLS cert path moves from `/etc/ssl/certs` to `/var/run/kserve/tls`, signed TLS via the OpenShift service signer is now mandatory, and you must include `--cert-path` and an `SSL_CERT_DIR` environment variable.

## Verification

**Inside the pod:**

```sh
rhai-cli lint --target-version 3.5 --checks "*kserve*" --checks "*modelmesh*"
```

The phase is done when:

- The non-RawDeployment count from [4.5](#confirm) is `0`.
- Every ISVC is `Ready=True`.
- No `workload`-group critical finding remains for KServe or ModelMesh.
- Every converted model answers the baseline probe, and you have recorded the new URLs of converted Serverless models.

**Don't go to Phase 5 while any critical *workload* finding remains.**

## Rollback

The cluster is still on 2.25, Serverless and ModelMesh are still installed, and you saved every spec before you started.

- **One ISVC misbehaves after conversion:** delete it and re-apply its original object from `./serving-pre-convert-*.yaml`. Strip `status`, `resourceVersion`, `uid`, and `creationTimestamp` first. The webhook allows this because it creates a new object rather than changing the mode of an existing one.
- **A runtime was deleted by mistake:** re-apply it from the same file.
- **Everything:** restore from the [Pre-flight backup]({{< relref "/field-manual/rhoai-2-25-to-3-5/pre-flight#backup" >}}).
