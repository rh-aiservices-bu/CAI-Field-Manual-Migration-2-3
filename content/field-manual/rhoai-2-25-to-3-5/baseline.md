---
title: Baseline
description: Phase 2 — capture a working before-snapshot of every model, workbench, pipeline server, Ray cluster, and guardrails orchestrator, to diff against after the upgrade.
weight: 20
icon: fa-solid fa-camera
---

**Outcome:** a saved, timestamped record of what works *today*: every InferenceService's mode and response, every workbench's HTTP status, every DSPA's health, every Ray cluster's state, and every guardrails orchestrator's backend health. [Re-test]({{< relref "/field-manual/rhoai-2-25-to-3-5/re-test" >}}) re-runs the same probes and diffs against this record. **Phase 2 of 10 · Before upgrade.** Next: [Assess]({{< relref "/field-manual/rhoai-2-25-to-3-5/assess" >}}).

A migration without a baseline is just hope. Without one, you cannot tell whether something failed because of the migration or was already broken. This phase has no equivalent in the component-organized reference guide, and it is the cheapest insurance in the whole manual.

## Prerequisites

- [Pre-flight]({{< relref "/field-manual/rhoai-2-25-to-3-5/pre-flight" >}}) complete. You are logged in as a `cluster-admin` user in `bash`.
- A local directory to hold the record:

```sh
export BASELINE=./baseline-$(date -u +%Y%m%dT%H%MZ) && mkdir -p "$BASELINE" && echo "$BASELINE"
```

Expected output (your timestamp):

```text
./baseline-20261111T1500Z
```

Every probe below writes its output into `$BASELINE` with `tee`.

## Procedure

### 2.1 Inventory the workloads

```sh
{
echo "--- ISVCs ---"
oc get isvc -A -o custom-columns='NS:.metadata.namespace,NAME:.metadata.name,MODE:.metadata.annotations.serving\.kserve\.io/deploymentMode,URL:.status.url,READY:.status.conditions[?(@.type=="Ready")].status'
echo "--- Workbenches ---"
oc get notebook -A -o custom-columns='NS:.metadata.namespace,NAME:.metadata.name'
echo "--- DSPAs ---"
oc get dspa -A
echo "--- Ray clusters ---"
oc get raycluster -A
} | tee "$BASELINE/inventory.txt"
```

Expected output (shape; your names will differ). Each section header is followed by a table or `No resources found`:

```text
--- ISVCs ---
NS             NAME                MODE            URL                                   READY
ml-project-a   my-serverless-isvc  Serverless      https://my-serverless-isvc-...        True
ml-project-b   my-raw-isvc         RawDeployment   https://my-raw-isvc-ml-project-b...   True
ml-project-c   my-modelmesh-isvc   ModelMesh       grpc://modelmesh-serving.ml-proj...   True
--- Workbenches ---
...
```

**Record the deployment mode of every ISVC.** The `Serverless` and `ModelMesh` rows are the workloads you convert in [Convert model serving]({{< relref "/field-manual/rhoai-2-25-to-3-5/convert-model-serving" >}}). If anything is already missing or broken, write it down *now*, so the migration doesn't get blamed for it later.

### 2.2 Inference-test each model {#inference-probe}

The probe finds each model's ID (`/v1/models` for vLLM) and sends a fixed, deterministic request (`temperature: 0`) to every externally reachable ISVC. ISVCs that only have a `svc.cluster.local` URL skip the HTTP probe; their predictor pod state is the smoke test.

```sh
for isvc in $(oc get isvc -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"\n"}{end}'); do
  NS="${isvc%/*}"; NAME="${isvc##*/}"
  URL=$(oc get isvc "$NAME" -n "$NS" -o jsonpath='{.status.url}')
  POD_STATE=$(oc get pods -n "$NS" -l serving.kserve.io/inferenceservice="$NAME" \
    -o jsonpath='{.items[0].status.phase}' 2>/dev/null)
  # ModelMesh pods don't carry the inferenceservice label — fall back to the ModelMesh selector
  [ -z "$POD_STATE" ] && POD_STATE=$(oc get pods -n "$NS" -l modelmesh-service=modelmesh-serving \
    -o jsonpath='{.items[0].status.phase}' 2>/dev/null)
  echo "--- $isvc ---"
  echo "  URL:           $URL"
  echo "  Predictor pod: ${POD_STATE:-no pod}"
  [[ "$URL" != https://* ]] && { echo "  HTTP test:     skipped (cluster-internal only)"; continue; }
  MODEL_ID=$(curl -sk --max-time 10 "${URL}/v1/models" 2>/dev/null | jq -r '.data[0].id // empty')
  if [ -n "$MODEL_ID" ]; then
    REPLY=$(curl -sk --max-time 30 "${URL}/v1/completions" \
      -H 'Content-Type: application/json' \
      -d "{\"model\":\"$MODEL_ID\",\"prompt\":\"The capital of France is\",\"max_tokens\":8,\"temperature\":0}" \
      | jq -r '.choices[0].text // "(error)"')
    echo "  vLLM model id: $MODEL_ID"
    echo "  Completion:    $REPLY"
  fi
done | tee "$BASELINE/inference.txt"
```

Expected output, per ISVC (shape):

```text
--- ml-project-a/my-serverless-isvc ---
  URL:           https://my-serverless-isvc-ml-project-a.apps.<cluster-domain>
  Predictor pod: Running
  vLLM model id: my-serverless-isvc
  Completion:     Paris. The capital of Germany
```

Every predictor pod should be `Running`, and every reachable model should return a sensible completion. If an auth-enabled ISVC returns `(error)` or nothing, add `-H "Authorization: Bearer $(oc whoami -t)"` to both `curl` calls and record that it needs auth.

### 2.3 Confirm workbenches respond

2.x workbenches are exposed through OpenShift Routes. A `200`, `302`, or `303` means the pod and Route are healthy.

```sh
for nb in $(oc get notebook -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"\n"}{end}'); do
  NS="${nb%/*}"; NAME="${nb##*/}"
  HOST=$(oc get route "$NAME" -n "$NS" -o jsonpath='{.spec.host}' 2>/dev/null)
  if [ -z "$HOST" ]; then echo "$nb: no Route (workbench may be stopped)"; continue; fi
  CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "https://${HOST}/")
  echo "$nb https://${HOST}/ -> HTTP $CODE"
done | tee "$BASELINE/workbenches.txt"
```

Expected output, per workbench (shape):

```text
ml-project-a/my-workbench https://my-workbench-ml-project-a.apps.<cluster-domain>/ -> HTTP 302
```

### 2.4 Confirm the DSPAs and Ray clusters respond

```sh
TOKEN=$(oc whoami -t)
for dspa in $(oc get dspa -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"\n"}{end}'); do
  NS="${dspa%/*}"; DSPA_NAME="${dspa##*/}"
  # The API server route is ds-pipeline-<dspa-name>; ds-pipeline-md-<dspa-name> is the metadata endpoint, not the API.
  DSPA_HOST=$(oc get route "ds-pipeline-${DSPA_NAME}" -n "$NS" -o jsonpath='{.spec.host}' 2>/dev/null)
  echo "--- DSPA $dspa https://${DSPA_HOST} ---"
  [ -z "$DSPA_HOST" ] && { echo "  no route found"; continue; }
  curl -sk -H "Authorization: Bearer $TOKEN" "https://${DSPA_HOST}/apis/v2beta1/healthz" | jq -c .
done | tee "$BASELINE/dspa.txt"

oc get raycluster -A -o custom-columns='NS:.metadata.namespace,NAME:.metadata.name,DESIRED:.spec.workerGroupSpecs[0].replicas,AVAILABLE:.status.availableWorkerReplicas,STATUS:.status.state' \
  | tee "$BASELINE/ray.txt"
```

Expected output: each DSPA returns a healthz JSON body, and each Ray cluster shows `STATUS=ready` with `AVAILABLE` equal to `DESIRED` (shape):

```text
NS             NAME          DESIRED   AVAILABLE   STATUS
ml-project-d   raycluster-a  2         2           ready
```

### 2.5 Baseline TrustyAI and Guardrails

[Post-upgrade]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade#guardrails" >}}) checks that each `GuardrailsOrchestrator` reports its services `HEALTHY`. Capture that state now. An orchestrator pointing at a backend that never existed reports `UNKNOWN` both before and after, and without a baseline you cannot tell that apart from a migration regression.

```sh
{
oc get trustyaiservice -A
oc get guardrailsorchestrator -A
for g in $(oc get guardrailsorchestrator -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"\n"}{end}'); do
  NS="${g%/*}"; NAME="${g##*/}"
  HOST=$(oc get route "${NAME}-health" -n "$NS" -o jsonpath='{.spec.host}' 2>/dev/null)
  echo "--- $g ---"
  [ -z "$HOST" ] && { echo "  no health route"; continue; }
  curl -sSk "https://${HOST}/info" -H "Authorization: Bearer $(oc whoami -t)" | jq -c .
done
} | tee "$BASELINE/trustyai.txt"
```

Expected output, per orchestrator (shape):

```text
--- ml-project-e/my-gorch ---
{"services":{"openai":{"status":"HEALTHY"},"regex":{"status":"HEALTHY"}}}
```

## Verification

Confirm the record files exist and are non-empty:

```sh
for f in inventory inference workbenches dspa ray trustyai; do test -s "$BASELINE/$f.txt" && echo "$f ok" || echo "$f EMPTY"; done
```

Expected output:

```text
inventory ok
inference ok
workbenches ok
dspa ok
ray ok
trustyai ok
```

`EMPTY` is correct for a workload type your inventory shows you don't run (for example, no Ray clusters means `ray EMPTY`). `EMPTY` for `inventory` is not: re-run 2.1. Keep the whole `$BASELINE` directory. It is your evidence in [Re-test]({{< relref "/field-manual/rhoai-2-25-to-3-5/re-test" >}}).

## Rollback

Read-only phase. Nothing to roll back.
