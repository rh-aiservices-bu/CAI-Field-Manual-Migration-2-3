---
title: Post-upgrade
description: Phase 8 — clear upgrade gates, get the Data Science Gateway programmed, restore inferenceservice-config, migrate workbenches and RayClusters, patch Guardrails, and verify every component on 3.5.
weight: 80
icon: fa-solid fa-list-check
---

**Outcome:** the DSC is `Ready`, the Data Science Gateway is `Programmed=True`, `inferenceservice-config` is managed again with no unwanted redeploys, every workbench is on `kube-rbac-proxy`, RayClusters run under KubeRay without the oauth-proxy sidecar, Guardrails and TrustyAI are migrated with no data loss, and every component is verified. **Phase 8 of 10 · After upgrade.** Next: [Re-test]({{< relref "rhoai-2-25-to-3-5/re-test" >}}).

The operator is on 3.5, but the migration isn't finished. Several `rhai-cli migrate` actions still have to bring components across. **Work through this page in order.** 8.2 (Gateway) blocks 8.5 (Ray), and 8.3 must run before you judge model health.

## Prerequisites

- [Upgrade]({{< relref "rhoai-2-25-to-3-5/upgrade" >}}) complete: the 3.5 CSV is `Succeeded`.
- The `rhai-cli-0` pod and its PVC are still present. In a new pod shell, re-run `export KUBECONFIG=/tmp/.kubeconfig; export PATH="/opt/rhai-cli/bin:$PATH"` and log in again.
- In-pod actions may print `phase pre-upgrade but effective phase is post-upgrade`. That warning is harmless.

> [!NOTE]
> **The 3.5 operator does these on startup. Don't do them by hand:**
> - **HardwareProfile migration**: AcceleratorProfiles become HardwareProfiles, and Notebooks/ISVCs are annotated (create-only, so your customizations are kept).
> - **GatewayConfig `ingressMode`**: a LoadBalancer ingress mode is carried forward.
> - **Kueue ValidatingAdmissionPolicyBinding cleanup**: deprecated pre-v2.29 resources are removed.
> - **DSC v1 → v2 conversion**: `datasciencepipelines` becomes `aipipelines`, and `modelmeshserving` and `codeflare` are dropped.

## Procedure

### 8.1 Confirm platform health {#platform-health}

```sh
oc get csv -n redhat-ods-operator --no-headers | grep rhods-operator | awk '{print $1, $NF}'
oc get dsc  -o jsonpath='{.items[0].status.phase}{"\n"}'
oc get dsci -o jsonpath='{.items[0].status.phase}{"\n"}'
oc get pods -n redhat-ods-operator --no-headers | awk '{print $3}' | sort -u
oc get pods -n redhat-ods-applications --no-headers | awk '{print $3}' | sort -u
```

Expected output:

```text
rhods-operator.3.5.0 Succeeded
Ready
Ready
Running
Running
```

If the second line isn't `Ready`, read the conditions before anything else:

```sh
oc get dsc -o json | jq -r '.items[0].status.conditions[] | select(.status!="True") | "\(.type) \(.reason) \(.message)"'
```

{{< variant kueue removed >}}
**Kueue Removed:** a `KueueReady False Removed` line is healthy.
{{< /variant >}}

{{< variant kueue unmanaged >}}
**Kueue Unmanaged:** `KueueReady` should be `True`. If it reports `Managed is not supported`, the pre-upgrade RHBOK migration wasn't finished: complete it now. If it's `False` with JobSet missing, see [Upgrade 7.5]({{< relref "rhoai-2-25-to-3-5/upgrade#jobset" >}}).
{{< /variant >}}

#### Known issue: DSC held at `AdminAckRequired` (upgrade gates) {#ki-admin-ack}

**Symptom.** The DSC is `Not Ready` with:

```text
Ready=False  [AdminAckRequired]  Waiting for upgrade gates to be acknowledged
```

**Diagnosis.** The operator is healthy and is *deliberately* refusing to reconcile because pre-migration work is outstanding. Nothing has been migrated and nothing is broken: the platform is held in its pre-upgrade state. The gates live in the **`odh-upgrade-acks`** ConfigMap (21 keys in 3.5.1):

```sh
# Confirm it's the gate
oc get dsc default-dsc \
  -o jsonpath='{range .status.conditions[?(@.reason=="AdminAckRequired")]}{.type}={.status}  {.message}{"\n"}{end}'

# List only the gates still blocking (a satisfied gate reads "true")
oc get cm odh-upgrade-acks -n redhat-ods-operator \
  -o go-template='{{range $k,$v := .data}}{{if ne $v "true"}}{{$k}}{{"\n    "}}{{$v}}{{"\n\n"}}{{end}}{{end}}'

# Progress counter
oc get cm odh-upgrade-acks -n redhat-ods-operator -o json \
  | jq -r '.data | "satisfied: \([.[]|select(.=="true")]|length)/\(length)"'
```

| Gate | Example message | Fix in |
|------|-----------------|--------|
| `ack-3.5-kserve` | `kserve blocking workloads found: 2 Serverless InferenceServices, 1 ModelMesh InferenceServices, 1 multi-model ServingRuntimes` | [Convert model serving]({{< relref "rhoai-2-25-to-3-5/convert-model-serving" >}}) |
| `ack-3.5-dependencies-kueue-operator` | `Kueue managementState Managed is not supported` | [5.7 Kueue]({{< relref "rhoai-2-25-to-3-5/remediate-platform#kueue" >}}) |
| `ack-3.5-removed-codeflare` | `CodeFlare internal CR present` | [5.1]({{< relref "rhoai-2-25-to-3-5/remediate-platform#ray-backup" >}}) / [5.7]({{< relref "rhoai-2-25-to-3-5/remediate-platform#disable" >}}) |
| `ack-3.5-removed-modelmeshserving` | `ModelMeshServing internal CR present` | [5.7]({{< relref "rhoai-2-25-to-3-5/remediate-platform#disable" >}}) |
| `ack-3.5-dependencies-servicemeshoperatorv2` | `Service Mesh Operator v2 subscription … is still installed` | [5.8]({{< relref "rhoai-2-25-to-3-5/remediate-platform#service-mesh" >}}) / [5.9]({{< relref "rhoai-2-25-to-3-5/remediate-platform#uninstall-operators" >}}) |
| `ack-3.5-ray` | `2 CodeFlare-managed RayClusters still require pre-upgrade backup acknowledgement` | [5.1]({{< relref "rhoai-2-25-to-3-5/remediate-platform#ray-backup" >}}) |
| `ack-3.5-trustyai` | `1 TrustyAIService instances using PVC storage require pre-upgrade backup` | [5.2]({{< relref "rhoai-2-25-to-3-5/remediate-platform#trustyai" >}}) |

**Workaround.** **Clear each gate by doing the work it names**, then let the operator re-evaluate. These are the same conditions `rhai-cli lint` reports before the upgrade, so a cluster that passed a clean assessment arrives with every gate already `true`.

> [!CAUTION]
> **Gates are acknowledgements, not verifications.** You can write one directly:
>
> ```sh
> oc patch cm odh-upgrade-acks -n redhat-ods-operator --type=merge -p '{"data":{"ack-3.5-ray":"true"}}'
> ```
>
> **The operator accepts that and never re-checks it.** In a test, a forced `true` survived repeated reconciles and moved the count from 14/21 to 15/21, while the RayClusters were never backed up. An admin can release the DSC this way **without having done any of the migration**, and the DSC then reconciles exactly the state the gates exist to prevent. Only acknowledge a gate when the work is genuinely done.

**Tracker.** None filed. Observed in a field run (2.25.10 → 2.25.11 → 3.5.1, with all pre-migration steps deliberately skipped).

### 8.2 Confirm the Data Science Gateway {#gateway}

The dashboard, workbenches, and ModelRegistry all resolve through the **Data Science Gateway**. It must be `Programmed=True` before you verify anything else.

```sh
oc get gatewayconfigs -A -o wide
oc get gateway data-science-gateway -n openshift-ingress -o jsonpath='{.status.conditions[?(@.type=="Programmed")].status}{"\n"}'
```

Expected output: `default-gateway` shows `READY` `True`, and the last line is:

```text
True
```

Then open the **Red Hat OpenShift AI** link in the OpenShift console and confirm the dashboard loads.

#### Known issue: Data Science Gateway won't program, blocked by stale Service Mesh 2 Istio CRDs {#ki-stale-istio-crds}

**This is the most common reason a 3.5 upgrade lands with the DSC Not Ready.**

**Symptom.** A chain of failures that reinforce each other:

- The DSC is stuck `Not Ready`: `ProvisioningFailed: modelregistry`.
- `GatewayConfig/default-gateway`: `failed to lookup … DestinationRule in version "networking.istio.io/v1"`.
- `Gateway/data-science-gateway`: `Programmed=False`, listener `Bad TLS configuration`.
- The `istiod-openshift-gateway` pod is stuck at **0/1**. Its log says `failed to list *v1.VirtualService: the server could not find the requested resource`.
- ModelRegistry: `failed to compute gateway domain: gateway domain is missing`.
- The ingress-operator log says **`Istio CRDs are managed by an unknown party`**. That's the giveaway.

**Diagnosis.** When you uninstalled the Service Mesh 2 (Maistra 2.6.x) operator in [5.9]({{< relref "rhoai-2-25-to-3-5/remediate-platform#uninstall-operators" >}}), OLM left its `*.istio.io` CRDs behind, serving only `v1beta1`/`v1alpha3`. On OCP 4.20.31+, 4.21.22+, and 4.22+, the OCP built-in Gateway API ("sail" Istio) provides the control plane, and it **refuses to install its own `v1` CRDs while foreign Istio CRDs exist**.

```sh
oc logs -n openshift-ingress-operator deploy/ingress-operator -c ingress-operator --tail=200 | grep -c "managed by an unknown party"
oc get crd -l maistra-version -o custom-columns=NAME:.metadata.name,VER:.metadata.labels.maistra-version
```

**Workaround.** First confirm there are **zero Istio custom resources** on the cluster, so deleting the CRDs loses no data. Run this in **bash**: under zsh the loop iterates once and the check is meaningless.

```sh
for crd in $(oc get crd -o name | grep '\.istio\.io$' | sed 's|.*/||'); do
  n=$(oc get "$crd" -A --no-headers 2>/dev/null | wc -l); echo "$crd $n"
done | awk '$2 != 0'
```

Expected output:

```text
(no output)
```

If anything is listed, **stop**: something still uses those CRs, so migrate or remove it first. Otherwise, delete the 14 stale CRDs and restart the ingress operator so sail reinstalls them at `v1`:

```sh
oc delete crd destinationrules.networking.istio.io virtualservices.networking.istio.io \
  gateways.networking.istio.io serviceentries.networking.istio.io sidecars.networking.istio.io \
  envoyfilters.networking.istio.io workloadentries.networking.istio.io workloadgroups.networking.istio.io \
  proxyconfigs.networking.istio.io authorizationpolicies.security.istio.io \
  peerauthentications.security.istio.io requestauthentications.security.istio.io \
  telemetries.telemetry.istio.io wasmplugins.extensions.istio.io
oc rollout restart deploy/ingress-operator -n openshift-ingress-operator
```

The recovery then fixes itself in sequence: `DestinationRule` comes back serving `v1` → `istiod-openshift-gateway` reaches **1/1** → the Gateway is **Programmed=True** → GatewayConfig is **Ready** (domain assigned) → ModelRegistry is **Ready** → the DSC is **Ready**. Verify:

```sh
oc get crd destinationrules.networking.istio.io -o jsonpath='{.spec.versions[*].name}{"\n"}'
oc get gateway data-science-gateway -n openshift-ingress -o jsonpath='{.status.conditions[?(@.type=="Programmed")].status}{"\n"}'
oc get dsc -o jsonpath='{.items[0].status.phase}{"\n"}'
```

Expected output (the first line must include `v1`; the order and the other versions may differ):

```text
v1alpha3 v1beta1 v1
True
Ready
```

The `*.maistra.io` CRDs hold no CRs and don't block sail. You can optionally remove them in [Clean up]({{< relref "rhoai-2-25-to-3-5/clean-up" >}}).

**Tracker.** None filed. Observed in a field run.

#### Known issue: Gateway dashboard URL doesn't resolve (NetworkPolicy rejected) {#ki-gateway-netpol}

**Symptom.** The Gateway exists, but the dashboard URL doesn't resolve. Clusters with an SRE-managed admission webhook that restricts NetworkPolicy in `openshift-*` namespaces are the ones affected.

**Diagnosis.** The GatewayConfig reconciler's NetworkPolicy POST is rejected:

```sh
oc get gatewayconfig default-gateway -o jsonpath='{.status.conditions}' | jq
```

**Workaround.**

```sh
oc patch gatewayconfig default-gateway --type=merge -p '{"spec":{"networkPolicy":{"ingress":{"enabled":false}}}}'
```

**Tracker.** None.

{{< variant env disconnected >}}
**Disconnected:** if `servicemeshoperator3` failed to subscribe, the DSCI isn't `Ready`, or `data-science-gateway` shows `Unknown`, see KB [7141146](https://access.redhat.com/solutions/7141146) and re-check the [OSSM v3 mirror]({{< relref "rhoai-2-25-to-3-5/upgrade#mirror-ossm" >}}).
{{< /variant >}}

### 8.3 Restore the inferenceservice-config ConfigMap {#restore-isvc-config}

You set it to `managed=false` in [5.6]({{< relref "rhoai-2-25-to-3-5/remediate-platform#isvc-config" >}}). Now hand control back. The action restores the annotation, restarts the KServe controller, and checks that no ISVC was redeployed. **Inside the pod:**

```sh
rhai-cli migrate run --migration modelserving.managed-isvc-config --target-version 3.5.0
```

If you were managing a customized `inferenceservice-config` by hand before the upgrade, skip the action and only run the verification below.

Verify (workstation):

```sh
oc get configmap inferenceservice-config -n redhat-ods-applications -o jsonpath='managed={.metadata.annotations.opendatahub\.io/managed}{"\n"}'
```

Expected output:

```text
managed=true
```

Each ISVC should have **one** active ReplicaSet. An extra ReplicaSet scaled to 0 next to the active one means it was redeployed when it shouldn't have been. ReplicaSets live in each ISVC's **own** namespace:

```sh
for ns in $(oc get isvc -A -o jsonpath='{range .items[*]}{.metadata.namespace}{"\n"}{end}' | sort -u); do
  echo "--- $ns ---"
  oc get replicasets -n "$ns" -o custom-columns='NAME:.metadata.name,CREATED:.metadata.creationTimestamp,REPLICAS:.status.replicas'
done
```

Expected output, per namespace (shape; one predictor ReplicaSet per ISVC):

```text
--- ml-project-b ---
NAME                                CREATED                REPLICAS
my-raw-isvc-predictor-6d9f7c8b5d    2026-10-01T09:12:44Z   1
```

### 8.4 Move the workbenches to the new auth model {#workbench-auth}

Workbenches still carry 2.x oauth-proxy config. Without this step they hit redirect loops on first start. Confirm the controllers are up:

```sh
oc get deployment -n redhat-ods-applications odh-notebook-controller-manager notebook-controller-deployment --no-headers | awk '{print $1, $2}'
```

Expected output (READY equals the desired count; shape):

```text
odh-notebook-controller-manager 1/1
notebook-controller-deployment 1/1
```

**Inside the pod**, patch every stopped workbench in place. It **prompts twice**: once before patching, once before the OAuth cleanup. Answer `y` both times.

```sh
rhai-cli migrate run --migration workbenches.patch-auth-model --target-version 3.5.0 --only-stopped --with-cleanup
rhai-cli migrate run --migration workbenches.verify-migration --target-version 3.5.0
```

Expected output (from `verify-migration`):

```text
Legacy (2.x): 0
All workbenches have been migrated
```

Tell users they can restart their workbenches. Their URLs are new: get them from the dashboard.

> [!NOTE]
> **Custom images with oauth-proxy built in** can't be fixed by this patch. They need the [rebuild]({{< relref "rhoai-2-25-to-3-5/workbench-images#triage" >}}). The action flags them.
>
> **Deferred image migration.** If some workbenches couldn't be stopped before the upgrade, migrate them now. Bump the tags (Jupyter `2025.2` recommended, code-server `2025.2` required, RStudio `latest` plus a rebuild). Then either edit and save the workbench in the dashboard (it patches automatically), or delete and recreate it **using the same PVC** so no data is lost.

#### Known issue: `workbenches.verify-migration` reports `Failed: N` {#ki-wb-verify-failed}

**Symptom.** The verify action reports failures.

**Diagnosis.**

```sh
oc describe notebook <name> -n <ns>
```

**Workaround.** The usual cause is a custom image that still has oauth-proxy built in. [Rebuild it]({{< relref "rhoai-2-25-to-3-5/workbench-images#triage" >}}) and re-import it.

**Tracker.** None.

### 8.5 Migrate the RayClusters to KubeRay {#ray}

**Prerequisites:** the Gateway is `Programmed=True` (8.2), the workbench migration is done (8.4), and **KubeRay is actually running**:

```sh
oc get dsc -o jsonpath='{.items[0].spec.components.ray.managementState}{"\n"}'
oc get pods -A --no-headers | grep -i kuberay | awk '{print $4}'
```

Expected output:

```text
Managed
Running
```

If KubeRay is missing, see [Known issue: `ray: Removed` silently leaves RayClusters unmanaged]({{< relref "rhoai-2-25-to-3-5/remediate-platform#ki-ray-removed" >}}). Set `ray` back to `Managed` and wait for the operator before you continue:

```sh
oc patch $(oc get dsc -o name | head -n1) --type=merge -p '{"spec":{"components":{"ray":{"managementState":"Managed"}}}}'
```

**Inside the pod:**

```sh
rhai-cli migrate run --migration raycluster.migrate --target-version 3.5.0 --dry-run
rhai-cli migrate run --migration raycluster.migrate --target-version 3.5.0
```

The dry run prints `=== DRY RUN MODE ===` and `Summary: N to migrate, M already migrated`. To target a single cluster, use `--raycluster-cluster`, `--raycluster-namespace`, or `--raycluster-from-backup <path to rhoai-3.x copy>`. Each migrated cluster restarts its head and worker pods, so expect brief downtime.

**`STATUS=ready` alone is not enough proof.** The action rewrites the CR; KubeRay recreates the pods. Confirm the head pod was recreated and now has a **single `ray-head` container with no `oauth-proxy`**:

```sh
oc get pod -n <ns> -l ray.io/node-type=head \
  -o jsonpath='{range .items[*]}{.metadata.name}: {range .spec.containers[*]}{.name} {end}{"\n"}{end}'
```

Expected output (per head pod):

```text
raycluster-a-head-xxxxx: ray-head
```

#### Known issue: RayCluster reports `ready` but the pods are still the 2.x spec {#ki-ray-stale}

**Symptom.** The head pod still lists `oauth-proxy`, or its age is older than the migration, while `oc get raycluster` says `ready`.

**Diagnosis.** KubeRay hasn't adopted the rewritten spec. Check the pod age:

```sh
oc get pods -n <ns> -l ray.io/cluster=<cluster-name> -o wide
```

**Workaround.** The CR is already correct, so it's safe to delete the stale pods and let KubeRay recreate them:

```sh
oc delete pod -n <ns> -l ray.io/cluster=<cluster-name>
```

Then re-check: `STATUS=ready`, `AVAILABLE` equal to `DESIRED`, and every pod `1/1`. If this keeps happening, confirm that KubeRay is running (above).

**Tracker.** None filed. Observed in a field run.

The migration leaves the old `ray-dashboard-<cluster>` Routes and `<cluster>-oauth-<hash>` Services behind. They now return **HTTP 403** because their ServiceAccount is gone. They're harmless, and you remove them in [Clean up]({{< relref "rhoai-2-25-to-3-5/clean-up" >}}).

### 8.6 Patch the GuardrailsOrchestrators {#guardrails}

Both actions run cluster-wide. `trustyai.patch-guardrails` adds the missing ReadinessProbe. `trustyai.migrate-gorch-otel-exporter` rewrites `spec.otelExporter` to the 3.x schema. **Inside the pod:**

```sh
rhai-cli migrate run --migration trustyai.patch-guardrails --target-version 3.5.0 --dry-run
rhai-cli migrate run --migration trustyai.patch-guardrails --target-version 3.5.0
rhai-cli migrate run --migration trustyai.migrate-gorch-otel-exporter --target-version 3.5.0
```

Verify the readinessProbe patch by checking that **each orchestrator pod reaches `1/1`**:

```sh
oc get pods -n <namespace> --no-headers | grep '^<gorch-name>' | awk '{print $1, $2}'
```

Expected output (per orchestrator; shape):

```text
my-gorch-7c9d8f6b4-abcde 1/1
```

Then compare each `/info` with your [Baseline]({{< relref "rhoai-2-25-to-3-5/baseline" >}}). Every service that was `HEALTHY` before should still be `HEALTHY`:

```sh
GORCH_ROUTE_HEALTH=$(oc get routes -n <namespace> "<gorch-name>-health" -o jsonpath='{.spec.host}')
curl -sSk "https://${GORCH_ROUTE_HEALTH}/info" -H "Authorization: Bearer $(oc whoami -t)" | jq -c .
```

Expected output: the same statuses as the baseline (shape):

```text
{"services":{"openai":{"status":"HEALTHY"},"regex":{"status":"HEALTHY"}}}
```

#### Known issue: Guardrails `/info` reports `UNKNOWN` {#ki-gorch-unknown}

**Symptom.**

```json
{"services":{"openai":{"status":"UNKNOWN","code":500,"reason":"client error (Connect)"}}}
```

**Diagnosis.** `/info` reports the health of the *backends* (the generator and each detector), not the orchestrator itself. Check what it's configured to reach:

```sh
oc get configmap <orchestratorConfig-name> -n <ns> -o jsonpath='{.data.config\.yaml}'
```

**Workaround.** If the baseline showed `UNKNOWN` too, the backend never existed. This isn't a regression. If the baseline showed `HEALTHY`, check that the backend's ISVC is Ready (8.9).

**Tracker.** None.

### 8.7 Verify TrustyAI and restore data if needed {#trustyai}

```sh
oc wait --for=condition=Available deployment/trustyai-service-operator-controller-manager -n redhat-ods-applications --timeout=120s
```

Expected output:

```text
deployment.apps/trustyai-service-operator-controller-manager condition met
```

Compare the current metric count with your backup, per namespace. Run this on your **workstation**, against the copy you made in [5.2]({{< relref "rhoai-2-25-to-3-5/remediate-platform#trustyai" >}}). The pod image doesn't ship `jq`.

```sh
export BACKUP_DIR=./trustyai-backup
export NS=<namespace>
export TAS_NAME=$(oc get trustyaiservice -n "$NS" -o jsonpath='{.items[0].metadata.name}')
export SVC_PORT=$(oc get svc -n "$NS" "$TAS_NAME" -o jsonpath='{.spec.ports[?(@.name=="http")].port}')
oc port-forward -n "$NS" "svc/$TAS_NAME" 8080:${SVC_PORT} & PF_PID=$!
CURRENT=$(curl -sk -H "Authorization: Bearer $(oc whoami -t)" http://localhost:8080/metrics/all/requests | jq '.requests | length')
BACKUP=$(jq '.requests | length' "$(ls -t ${BACKUP_DIR}/trustyai-metrics-${NS}-*.json | head -1)")
kill $PF_PID 2>/dev/null
[ "$CURRENT" -ge "$BACKUP" ] && echo "OK: no data loss" || echo "DATA LOSS: restore needed"
```

Expected output:

```text
OK: no data loss
```

**If you see `DATA LOSS`**, restore from the backup on the PVC. Confirm the route label with `oc get route -n "$NS" --show-labels`. Then, **inside the pod**, do a dry run and restore:

```sh
export NS=<namespace>
export BACKUP_FILE=$(ls -t /tmp/rhoai-upgrade-backup/trustyai/trustyai-metrics-${NS}-*.json | head -1)
export ROUTE_LABEL='trustyai-service-name=<tas-name>'
rhai-cli migrate run --migration trustyai.metrics --target-version 3.5.0 --namespace "$NS" --file "$BACKUP_FILE" --route-label "$ROUTE_LABEL" --dry-run
rhai-cli migrate run --migration trustyai.metrics --target-version 3.5.0 --namespace "$NS" --file "$BACKUP_FILE" --route-label "$ROUTE_LABEL" --skip-existing
```

Expected output: each metric reports `Successfully scheduled`, and the summary is:

```text
Failed: 0
```

Restored metrics get new UUIDs. The original IDs aren't preserved.

#### Known issue: GPU ISVC stays `Pending` next to a TrustyAI service {#ki-gpu-deadlock}

**Symptom.** On a GPU cluster, a new GPU-based predictor pod in a namespace with a running TrustyAI service stays `Pending` indefinitely while the old pod keeps running.

**Diagnosis.**

```sh
oc get pods -A | grep predictor        # look for a 0/N Pending predictor
```

**Workaround.** Inside the pod:

```sh
rhai-cli migrate run --migration trustyai.break-gpu-deadlock --target-version 3.5.0 --namespace <ns> --dry-run
rhai-cli migrate run --migration trustyai.break-gpu-deadlock --target-version 3.5.0 --namespace <ns>
```

**Tracker.** None. The CLI ships a dedicated action for it.

### 8.8 Verify the non-core components {#non-core}

**Model registry and catalog.** The catalog now runs **two** pods, `model-catalog` and `model-catalog-postgres`:

```sh
oc get pods -n rhoai-model-registries --no-headers | awk '{print $3}' | sort -u
```

Expected output:

```text
Running
```

Registries should show **Available** in the dashboard. **The navigation was renamed:** registry admin is now **Settings → … → Model registry settings**, and the catalog moved from **AI hub → Catalog** to **AI hub → Models**. Tell your users.

**Feature Store** (GA):

```sh
oc get pods -n redhat-ods-applications --no-headers | grep feast-operator | awk '{print $3}'
oc get featurestores -A
oc create job postupgradetest --from=cronjob/<cronjob-name> -n <namespace> && oc get jobs -n <namespace>
```

Expected output (first line):

```text
Running
```

Then check the dashboard under **Develop & train → Feature Store**, which has a new Gateway URL.

**AI Pipelines.** **Inside the pod**, diff against the [5.3 snapshot]({{< relref "rhoai-2-25-to-3-5/remediate-platform#ai-pipelines" >}}):

```sh
rhai-cli migrate run --migration ai-pipelines.post-upgrade-check --target-version 3.5.0
```

Then have pipeline users import and run a pipeline, and confirm that scheduled runs are still enabled.

**Llama Stack → OGX.** Recreate fresh `OGXServer` (v1beta1) CRs. Use the [5.4 archive]({{< relref "rhoai-2-25-to-3-5/remediate-platform#delete-llamastack" >}}) only as *reference*, because the SQLite data can't be imported. 3.5 needs PostgreSQL 14+, an explicitly enabled embedding provider, the `Vector_IO` API, `llama-stack-client` 0.4.x, and `config.yaml` (formerly `run.yaml`). See [Deploying an OGX server](https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/working_with_ogx/deploying-ogx-server_rag).

**Kubeflow Training Operator.** Compare with your pre-upgrade list, then run the read-only enumeration (it creates nothing and pulls nothing):

```sh
oc get pytorchjobs -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name --no-headers | diff ./pytorchjobs-pre-upgrade.txt - && echo "same jobs"
```

Expected output (jobs that finished and were cleaned up in the meantime show as diff lines; explain each one):

```text
same jobs
```

**Inside the pod:**

```sh
rhai-cli migrate run --migration training.verify-workloads --target-version 3.5.0
```

Expected output (when no KFTO v1 job is running, the summary contains one of these):

```text
nothing to migrate
safe to proceed
```

Any workload still `Running`/`Created` is reported as `[BLOCKER]` instead.

#### Known issue: `training.verify-workloads` "completed with failures, please report a bug" {#ki-training-blocker}

**Symptom.** With a PyTorchJob still running, the action exits non-zero and ends with:

```text
Migration training.verify-workloads completed with failures
Suggestion: Unexpected error, please report a bug
```

**Diagnosis.** A running KFTO v1 job carried across the upgrade is the **expected, healthy** outcome. The `[BLOCKER]` refers to the *future* Trainer v2 migration, not this one.

**Workaround.** None needed, and no support case is needed either. Confirm that the job list matches your pre-upgrade inventory. A PyTorchJob in a *failed* state usually means the job itself failed: `oc describe pytorchjob <name> -n <ns>`.

**Tracker.** None filed. A misleading message, observed in a field run.

### 8.9 Verify model serving {#model-serving}

Every ISVC should be `Ready=True` with `DEPLOYMENT_MODE` **`Standard`** (the 3.5 display name for RawDeployment):

```sh
oc get pods -n redhat-ods-applications -l control-plane=kserve-controller-manager --no-headers | awk '{print $3}'
oc get pods -n redhat-ods-applications -l control-plane=odh-model-controller --no-headers | awk '{print $3}'
oc get isvc -A -o json | jq -r '["NAMESPACE","NAME","DEPLOYMENT_MODE","READY"], (.items[] | [.metadata.namespace, .metadata.name, .status.deploymentMode, (.status.conditions[] | select(.type=="Ready") | .status)]) | @tsv' | column -t
oc get llminferenceservices -A
```

Expected output (shape):

```text
Running
Running
NAMESPACE     NAME                DEPLOYMENT_MODE  READY
ml-project-a  my-serverless-isvc  Standard         True
ml-project-b  my-raw-isvc         Standard         True
ml-project-c  my-modelmesh-isvc   Standard         True
```

#### Known issues: model-serving symptom matrix {#ki-serving-matrix}

| Symptom | Cause | Fix |
|---------|-------|-----|
| `READY: True` but every call returns **HTTP 503** | A Serverless ISVC wasn't converted before the upgrade | Convert to `Standard` after the upgrade per KB [7134025](https://access.redhat.com/articles/7134025) |
| Healthy ISVC, but requests return 503 "Application Not Available" | A ModelMesh ISVC wasn't converted | Convert per KB [7134025](https://access.redhat.com/articles/7134025) |
| `Ready=False` after the upgrade | 8.3 hasn't run yet, or the predictor is failing | Run 8.3 first, then check the predictor pod's events and logs |
| `KnativeServing` still `Ready`, idle pods in `knative-serving` | Serverless Operator wasn't removed | No functional impact. Uninstall it, then `oc delete namespace knative-serving` |
| Standalone Authorino still `Ready` | Authorino wasn't removed | No impact on ISVCs (they use the per-pod `oauth-proxy`). **Breaks LLMInferenceService**: uninstall it and use RHCL |
| Gateway API resources don't work | OSSM v2 wasn't removed, or stale SM2 `*.istio.io` CRDs remain | [Known issue: stale Istio CRDs](#ki-stale-istio-crds) |
| Dashboard shows runtimes **Outdated** | The runtime templates moved on | Redeploy on the latest global serving runtime templates |

### 8.10 Final assessment

`rhai-cli lint` only works *before* the upgrade. On 3.5 it does nothing:

```sh
rhai-cli lint --target-version 3.5
```

Expected output:

```text
Current and target versions are the same (3.5), no checks will be executed.
```

Your post-upgrade confidence comes from 8.1–8.9 and the [Re-test]({{< relref "rhoai-2-25-to-3-5/re-test" >}}) diff, not from the lint.

## Verification

- The DSC and DSCI are `Ready`, the Gateway is `Programmed=True`, and the dashboard loads.
- `inferenceservice-config` is `managed=true`, with one active ReplicaSet per ISVC.
- `workbenches.verify-migration` reports `Legacy (2.x): 0`.
- Ray head pods run `ray-head` only, are newly created, and `AVAILABLE` equals `DESIRED`.
- Guardrails pods are `1/1`, and `/info` matches the baseline. TrustyAI reports `OK: no data loss`.
- Model registry, Feature Store, AI Pipelines, and KFTO match the pre-upgrade inventory.
- Every ISVC is `Standard` / `Ready=True`.

## Rollback

**None supported** after the upgrade. Individual steps can be undone in a limited way:

- **inferenceservice-config:** `oc apply -f ./inferenceservice-config-backup.yaml` (from 5.6) restores the pre-upgrade content.
- **A RayCluster:** recreate it from `./ray-backup/rhoai-3.x/` with `--raycluster-from-backup`.
- **Deleted stale Istio CRDs:** sail reinstalls them at `v1`. The Maistra v1beta1 versions are deliberately not restored.

For anything else, go forward with Red Hat Support on your proactive case, or restore the [Pre-flight backup]({{< relref "rhoai-2-25-to-3-5/pre-flight#backup" >}}).
