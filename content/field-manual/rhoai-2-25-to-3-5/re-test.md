---
title: Re-test
description: Phase 9 — re-run the baseline probes against the 3.5 cluster, diff before against after, and know exactly what should and should not have changed.
weight: 90
icon: fa-solid fa-vial
---

**Outcome:** a saved `after` record that matches the [Baseline]({{< relref "/field-manual/rhoai-2-25-to-3-5/baseline" >}}) everywhere except the differences this page tells you to expect. That before/after pair is your evidence that the migration broke nothing. **Phase 9 of 10 · After upgrade.** Next: [Clean up]({{< relref "/field-manual/rhoai-2-25-to-3-5/clean-up" >}}).

[Post-upgrade]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade" >}}) proved the *platform* is healthy. This page proves the *workloads* still serve their users. These are smoke tests: does each thing still answer a request?

## Prerequisites

- [Post-upgrade]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade" >}}) verification passed.
- Your `$BASELINE` directory from Phase 2, and a directory for the after record:

```sh
export AFTER=./after-$(date -u +%Y%m%dT%H%MZ) && mkdir -p "$AFTER" && ls -d "$BASELINE" "$AFTER"
```

Expected output (shape; both directories exist):

```text
./after-20261112T0900Z
./baseline-20261111T1500Z
```

## Procedure

### 9.1 Inference-test each model

Re-run the same probe as the baseline:

```sh
for isvc in $(oc get isvc -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"\n"}{end}'); do
  NS="${isvc%/*}"; NAME="${isvc##*/}"
  URL=$(oc get isvc "$NAME" -n "$NS" -o jsonpath='{.status.url}')
  POD_STATE=$(oc get pods -n "$NS" -l serving.kserve.io/inferenceservice="$NAME" -o jsonpath='{.items[0].status.phase}' 2>/dev/null)
  echo "--- $isvc ---"
  echo "  URL:           $URL"
  echo "  Predictor pod: ${POD_STATE:-no pod}"
  [[ "$URL" != https://* ]] && { echo "  HTTP test:     skipped (cluster-internal only)"; continue; }
  MODEL_ID=$(curl -sk --max-time 10 "${URL}/v1/models" 2>/dev/null | jq -r '.data[0].id // empty')
  if [ -n "$MODEL_ID" ]; then
    REPLY=$(curl -sk --max-time 30 "${URL}/v1/completions" -H 'Content-Type: application/json' \
      -d "{\"model\":\"$MODEL_ID\",\"prompt\":\"The capital of France is\",\"max_tokens\":8,\"temperature\":0}" \
      | jq -r '.choices[0].text // "(error)"')
    echo "  vLLM model id: $MODEL_ID"
    echo "  Completion:    $REPLY"
  fi
done | tee "$AFTER/inference.txt"
diff "$BASELINE/inference.txt" "$AFTER/inference.txt"
```

Expected output of the `diff`: differences **only** for models you converted in Phase 4. Serverless models get a new URL. ModelMesh models change from a `grpc://modelmesh-serving…` URL to a single-model URL, and may gain an HTTP test they skipped before. Every line for a model that was already RawDeployment is identical, including the completions (`temperature: 0`):

```text
2c2
<   URL:           https://my-serverless-isvc-ml-project-a.apps.…   (Knative URL)
---
>   URL:           https://my-serverless-isvc-ml-project-a.apps.…   (new Route)
```

A changed completion, or an ISVC that has gone missing, is a regression. Investigate it in [Post-upgrade 8.9]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade#model-serving" >}}). If a runtime image was intentionally updated (a predictor restarted onto a newer vLLM), small wording differences can be legitimate.

Confirm every ISVC is Ready:

```sh
oc get isvc -A -o json | jq -r '[.items[] | select(.status.conditions[]? | select(.type=="Ready" and .status!="True"))] | length'
```

Expected output:

```text
0
```

### 9.2 What changes for a Standard model {#what-changes-for-a-standard-model}

The honest answer is narrower than "3.x changes routing and auth". Measured on a real 2.25.10 → 3.5.1 migration of an externally exposed, auth-enabled vLLM ISVC that was **already RawDeployment** before the upgrade:

| Property | Before (2.25.10) | After (3.5.1) |
|----------|------------------|---------------|
| `deploymentMode` | `RawDeployment` | `Standard` *(display rename only)* |
| ISVC `.status.url` | `https://<name>-<ns>.apps.<cluster>` | **identical** |
| Route name / host | `<name>` / same host | **identical** |
| Route target port | `https` | **identical** |
| Route TLS termination / policy | `reencrypt` / `Redirect` | **identical** |
| HTTPRoutes created for the ISVC | 0 | **0** |
| Unauthenticated request | `HTTP 302` | **identical** |
| Authenticated request and inference | served | **identical, same output** |

**Why it survives.** For Standard/Raw, the operator creates the Route with an `ownerReference` to the ISVC and names it after it. Nothing in the upgrade moves that Route onto the Gateway. The Gateway move that *does* change URLs affects the **dashboard and workbenches**. **Serverless** endpoints move because their Knative ingress is gone.

> [!NOTE]
> A Standard ISVC is only reachable from outside the cluster if it carries the label **`networking.kserve.io/visibility: exposed`**. That label makes the operator create the Route and set `.status.url` to the external host. The Knative label `networking.knative.dev/visibility: cluster-local` has no effect on Raw. Also, `security.opendatahub.io/enable-auth=true` switches the Route from `edge`/`http1` to `reencrypt`/`https`.

Check on your own cluster rather than assuming:

```sh
NS=<namespace>; N=<isvc-name>
oc get isvc "$N" -n "$NS" -o jsonpath='url={.status.url}{"\n"}mode={.status.deploymentMode}{"\n"}'
oc get route "$N" -n "$NS" -o jsonpath='host={.spec.host}{"\n"}port={.spec.port.targetPort}{"\n"}tls={.spec.tls.termination}{"\n"}'
oc get httproute -n "$NS"
```

Expected output, for an auth-enabled model that was already Raw (shape):

```text
url=https://my-raw-isvc-ml-project-b.apps.<cluster-domain>
mode=Standard
host=my-raw-isvc-ml-project-b.apps.<cluster-domain>
port=https
tls=reencrypt
No resources found in ml-project-b namespace.
```

#### Known issue: auth-enabled model still runs `oauth-proxy` after the upgrade {#ki-isvc-oauth-proxy}

**Symptom.** A customer reports *"the URL didn't change, but auth is still oauth-proxy"*:

```sh
oc get pod -n <ns> -l serving.kserve.io/inferenceservice=<name> \
  -o jsonpath='{range .items[*]}{.metadata.name}: {range .spec.containers[*]}{.name} {end}{"\n"}{end}'
```

```text
my-raw-isvc-predictor-…: kserve-container oauth-proxy modelcar
```

**Diagnosis.** This is **expected behavior on both counts**, not a missed step. The `oauth-proxy` → `kube-rbac-proxy` change applies to **workbenches only**. On 3.5.1, the KServe controller keeps model serving on `oauth-proxy`.

**Workaround.** None needed. **Don't try to force the change.** `oc rollout restart` reports success, but the controller scales the new ReplicaSet back to `0` and keeps the original pod, because the ISVC-owned Deployment template still specifies `ose-oauth-proxy-rhel9`. There's no `modelserving` auth-model action (`workbenches.patch-auth-model` is for workbenches only).

**Tracker.** None. Working as designed in 3.5.1.

### 9.3 Reach each workbench through the Gateway

3.x workbenches live at `https://<gateway-host>/notebook/<ns>/<name>/`. Start them (Phase 6 stopped them all):

```sh
for row in $(oc get notebooks -A --no-headers | awk '{print $1"/"$2}'); do
  ns="${row%/*}"; name="${row##*/}"
  oc -n "$ns" annotate notebook "$name" kubeflow-resource-stopped- --overwrite
done
```

Confirm each pod came back with the **`kube-rbac-proxy`** sidecar. This proves [8.4]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade#workbench-auth" >}}) took effect:

```sh
oc get pods -n <ns> -o jsonpath='{range .items[*]}{.metadata.name}: {range .spec.containers[*]}{.name} {end}{"\n"}{end}'
```

Expected output (per workbench pod; no `oauth-proxy`):

```text
my-workbench-0: my-workbench kube-rbac-proxy
```

Then probe each workbench through the Gateway:

```sh
GATEWAY_HOST=$(oc get gatewayconfig default-gateway -o jsonpath='{.status.domain}')
echo "gateway: ${GATEWAY_HOST:?empty — see known issue below}"
for nb in $(oc get notebook -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"\n"}{end}'); do
  NS="${nb%/*}"; NAME="${nb##*/}"
  CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "https://${GATEWAY_HOST}/notebook/${NS}/${NAME}/")
  echo "$nb -> HTTP $CODE"
done | tee "$AFTER/workbenches.txt"
```

Expected output, per workbench (any 2xx or 3xx):

```text
ml-project-a/my-workbench -> HTTP 302
```

#### Known issue: every workbench probe returns `HTTP 000` {#ki-gateway-host-empty}

**Symptom.** Every line reads `HTTP 000`.

**Diagnosis.** `GATEWAY_HOST` is empty. The gateway domain lives on GatewayConfig **`.status.domain`**. There is no `.spec.hostname`.

```sh
oc get gatewayconfig default-gateway -o jsonpath='{.status.domain}{"\n"}'
```

**Workaround.** Use the jsonpath above. If `.status.domain` itself is empty, the Gateway isn't programmed: see [Known issue: stale Istio CRDs]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade#ki-stale-istio-crds" >}}).

**Tracker.** None.

#### Known issue: a workbench URL returns 404 {#ki-wb-404}

**Symptom.** `HTTP 404` for one workbench.

**Diagnosis.** The Gateway HTTPRoute hasn't propagated yet, or the Notebook wasn't patched:

```sh
oc get httproute -n <ns>
```

**Workaround.** Wait about 2 minutes. If it persists, confirm that [8.4]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade#workbench-auth" >}}) patched this Notebook.

**Tracker.** None.

### 9.4 Confirm the DSPAs serve the pipelines API

```sh
TOKEN=$(oc whoami -t)
for dspa in $(oc get dspa -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"\n"}{end}'); do
  NS="${dspa%/*}"; DSPA_NAME="${dspa##*/}"
  DSPA_HOST=$(oc get route "ds-pipeline-${DSPA_NAME}" -n "$NS" -o jsonpath='{.spec.host}' 2>/dev/null)
  echo "--- DSPA $dspa https://${DSPA_HOST} ---"
  [ -z "$DSPA_HOST" ] && { echo "  no route found"; continue; }
  curl -sk -H "Authorization: Bearer $TOKEN" "https://${DSPA_HOST}/apis/v2beta1/healthz" | jq -c .
done | tee "$AFTER/dspa.txt"
oc get dspa -A -o json | jq -r '[.items[] | select(.status.conditions[]? | select(.type=="Ready" and .status!="True"))] | length'
```

Expected output: the healthz bodies match `$BASELINE/dspa.txt`, and the last line is:

```text
0
```

#### Known issue: DSPA endpoint returns 404 {#ki-dspa-404}

**Symptom.** The healthz probe returns 404, or `no route found`.

**Diagnosis.** The pipeline route path can vary after the upgrade:

```sh
oc get httproute -A -l app.kubernetes.io/instance=<dspa-name> -o yaml
```

**Workaround.** Probe the path that the HTTPRoute exposes.

**Tracker.** None.

### 9.5 Confirm Ray clusters accept work

```sh
oc get raycluster -A -o custom-columns='NS:.metadata.namespace,NAME:.metadata.name,DESIRED:.spec.workerGroupSpecs[0].replicas,AVAILABLE:.status.availableWorkerReplicas,STATUS:.status.state' \
  | tee "$AFTER/ray.txt"
diff "$BASELINE/ray.txt" "$AFTER/ray.txt" && echo "ray unchanged"
```

Expected output:

```text
ray unchanged
```

If a cluster isn't `ready`, re-run the migration scoped to it (inside the pod): `rhai-cli migrate run --migration raycluster.migrate --target-version 3.5.0 --raycluster-namespace <ns>`. Then apply the pod check from [8.5]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade#ray" >}}).

#### Known issue: LLM inference returns 502/503 right after the upgrade {#ki-llm-502}

**Symptom.** A model that passed 8.9 returns 502 or 503 during 9.1.

**Diagnosis.** The 3.x controller may still be rolling the predictor onto a newer runtime image:

```sh
oc get pods -n <ns> -l serving.kserve.io/inferenceservice=<name>
```

**Workaround.** Wait 60 seconds and re-run the probe.

**Tracker.** None.

## Verification

Archive both directories together. They are your migration evidence:

```sh
tar czf migration-evidence-$(date -u +%Y%m%d).tgz "$BASELINE" "$AFTER" && ls migration-evidence-*.tgz
```

Expected output (shape):

```text
migration-evidence-20261112.tgz
```

Re-test passes when:

- The inference diff shows only the expected Serverless URL changes.
- Every workbench answers 2xx/3xx through the Gateway, with `kube-rbac-proxy`.
- Every DSPA is Ready and healthz matches the baseline.
- `ray unchanged`.

## Rollback

Read-only phase. Nothing to roll back. A failed probe is a lead for [Post-upgrade]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade" >}}), not a reason to roll back.
