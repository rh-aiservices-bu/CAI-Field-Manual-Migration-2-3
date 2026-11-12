---
title: Remediate the platform
description: Phase 5 — back up Ray, TrustyAI, and AI Pipelines state, delete Llama Stack, then disable Kueue, CodeFlare, ModelMesh, Serverless, and Service Mesh in dependency order.
weight: 50
icon: fa-solid fa-screwdriver-wrench
---

**Outcome:** every stateful component is backed up to the `rhai-cli` PVC and copied to your workstation. Kueue is `Removed` or `Unmanaged`. CodeFlare, ModelMesh, and KServe Serverless are `Removed`. Service Mesh 2, Serverless, and standalone Authorino are uninstalled. The full lint shows **zero critical findings**. **Phase 5 of 10 · Before upgrade.** Next: [Workbench images]({{< relref "/field-manual/rhoai-2-25-to-3-5/workbench-images" >}}).

The rule for this whole phase: **back up before you flip, and flip in dependency order.** Some flips destroy state, and some backup actions only work while the component that owns the data is still installed.

| Order | Step | Why here |
|------:|------|----------|
| 1 | [Ray](#ray-backup), [TrustyAI](#trustyai), [AI Pipelines](#ai-pipelines) backups | While the components that own the backup logic still run |
| 2 | [Delete LlamaStackDistributions](#delete-llamastack) | Delete-and-replace; there is no upgrade path |
| 3 | [Inventory the non-migrating components](#non-migrating) | Something to compare against after the upgrade |
| 4 | [`inferenceservice-config` ignorelist](#isvc-config) | After every ISVC is RawDeployment, before the disables |
| 5 | [Disable removed components](#disable) and [Service Mesh](#service-mesh) | Nothing depends on them any more |
| 6 | [Uninstall 2.x serving operators](#uninstall-operators), [final lint](#final-readiness) | Clean assessment |

## Prerequisites

- [Convert model serving]({{< relref "/field-manual/rhoai-2-25-to-3-5/convert-model-serving" >}}) complete: the non-RawDeployment ISVC count is `0`.
- A shell in `rhai-cli-0` (**inside the pod**) and a workstation shell.
- **You are ready to upgrade soon.** The CodeFlare flip in 5.1 leaves user-created RayClusters without CodeFlare's security config until the upgrade lands. Don't open a long gap between this phase and [Upgrade]({{< relref "/field-manual/rhoai-2-25-to-3-5/upgrade" >}}).

{{< variant deploy gitops >}}
**GitOps:** the DSC, DSCI, and operator Subscriptions you change here are usually in Git. With the reconciler paused (see [Pre-flight]({{< relref "/field-manual/rhoai-2-25-to-3-5/pre-flight#stop-gitops" >}})), patch them directly as shown, and record each change for the Git update in [Clean up]({{< relref "/field-manual/rhoai-2-25-to-3-5/clean-up#re-enable-gitops" >}}).
{{< /variant >}}

> [!NOTE]
> **The DSC and DSCI patches here use v1 field names** (`modelmeshserving`, `serviceMesh`) on purpose: you are still on 2.25. The operator converts the DSC and DSCI to v2 after the upgrade.

## Procedure

### 5.1 Set CodeFlare to Removed and back up the RayClusters {#ray-backup}

In 3.5, **KubeRay** replaces CodeFlare for RayCluster management. KubeRay is provisioned by the **`ray`** DSC component, which **stays `Managed`**. Only `codeflare` is disabled. Existing RayCluster CRs survive the swap, but back them up in case reconciliation drops fields.

Disabling CodeFlare is a hard 3.5 prerequisite, even if you have no RayClusters. The backup action **fails if CodeFlare is still `Managed`**, so flip it first:

```sh
oc patch $(oc get dsc -o name | head -n1) --type=merge \
  -p '{"spec":{"components":{"codeflare":{"managementState":"Removed"}}}}'
oc get dsc -o jsonpath='{.items[0].spec.components.codeflare.managementState}{"\n"}'
```

Expected output (last line):

```text
Removed
```

**Inside the pod**, back up every RayCluster (this is read-only):

```sh
mkdir -p /tmp/rhoai-upgrade-backup/ray_cluster
rhai-cli migrate run --migration raycluster.backup --target-version 3.5.0 \
  --raycluster-output-dir /tmp/rhoai-upgrade-backup/ray_cluster
ls /tmp/rhoai-upgrade-backup/ray_cluster
```

Expected output (the last command):

```text
rhoai-2.x
rhoai-3.x
```

- `rhoai-2.x/raycluster-<name>-<ns>.yaml`: the CR as it is today.
- `rhoai-3.x/raycluster-<name>-<ns>.yaml`: the converted 3.x shape. It's noticeably smaller because the oauth-proxy sidecar, ServiceAccount, and volumes are stripped out. That trimmed shape is what a correctly migrated cluster should end up running. [Post-upgrade]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade#ray" >}})'s `--raycluster-from-backup` needs the right one.

Copy the backup off the pod (workstation) and confirm the clusters are still `ready`:

```sh
oc cp rhai-migration/rhai-cli-0:/tmp/rhoai-upgrade-backup/ray_cluster ./ray-backup
oc get rayclusters -A -o custom-columns='NAME:.metadata.name,STATUS:.status.state'
```

Expected output, per cluster (shape):

```text
NAME           STATUS
raycluster-a   ready
```

The backup covers CR *configuration*, not Ray runtime state. Warn users about downtime.

### 5.2 Back up TrustyAI metrics, data, and Guardrails config {#trustyai}

TrustyAI's storage schema changed between 2.x and 3.x. Without a snapshot, historical bias metrics and training data can become unreadable. **Skip this section** if this check returns anything other than `Managed`, or if no TrustyAIService exists:

```sh
oc get dsc -A -o jsonpath='{.items[0].spec.components.trustyai.managementState}{"\n"}'
oc get trustyaiservice -A
```

Expected output (the first line, if TrustyAI applies to you):

```text
Managed
```

**Inside the pod.** Both actions run **cluster-wide**. `--output-dir` is **required**: the container root filesystem is read-only.

```sh
rhai-cli migrate prepare --migration trustyai.metrics --target-version 3.5.0 \
  --output-dir /tmp/rhoai-upgrade-backup/trustyai
rhai-cli migrate prepare --migration trustyai.data --target-version 3.5.0 \
  --output-dir /tmp/rhoai-upgrade-backup/trustyai
```

The `phase pre-upgrade but effective phase is post-upgrade` warning is harmless. Ignore it.

Verify the metrics backup is valid JSON. The container doesn't ship `jq`, so read it from your workstation:

```sh
oc exec -n rhai-migration rhai-cli-0 -- ls /tmp/rhoai-upgrade-backup/trustyai
oc exec -n rhai-migration rhai-cli-0 -- cat /tmp/rhoai-upgrade-backup/trustyai/<metrics-file>.json | jq empty && echo valid
```

Expected output (the last line):

```text
valid
```

#### Known issue: PVC-backed TrustyAI data backup prints "read/write on closed pipe" {#ki-trustyai-pipe}

**Symptom.** The `trustyai.data` action prints an unhandled client error but exits 0:

```text
E0831 ... "Unhandled Error" err="io: read/write on closed pipe" logger="UnhandledError"
    ✓ Backed up 0 file(s) to .../trustyai-data-<ns>-<timestamp>
```

**Diagnosis.** This is expected for an *empty* PVC. DATABASE-backed services dump normally (for example, `Dumped 844 lines`).

**Workaround.** Not a failure, but **confirm that the file count matches what the PVC actually holds** rather than trusting the `✓`.

**Tracker.** None filed. Observed in a field run.

#### Known issue: TrustyAI backup fails with `permission denied` {#ki-trustyai-perm}

**Symptom.** `trustyai.metrics` or `trustyai.data` fails with `permission denied`.

**Diagnosis.** No `--output-dir` was given, so it tried to write to the read-only container root.

**Workaround.** Pass `--output-dir /tmp/rhoai-upgrade-backup/trustyai`.

**Tracker.** None. The CLI's behavior.

**Guardrails otelExporter.** If any `GuardrailsOrchestrator` exports traces or metrics, save `spec.otelExporter` from your workstation (there's no action for this):

```sh
oc get guardrailsorchestrator -A -o json \
  | jq -r '.items[] | select(.spec.otelExporter != null) | {ns: .metadata.namespace, name: .metadata.name, otelExporter: .spec.otelExporter}' \
  > ./guardrails-otel-backup-$(date +%Y%m%d%H%M).json
oc cp rhai-migration/rhai-cli-0:/tmp/rhoai-upgrade-backup/trustyai ./trustyai-backup && ls ./trustyai-backup | head
```

Expected output: the metrics and data backup files, listed locally (shape):

```text
trustyai-data-ml-project-e-20261111150000
trustyai-metrics-ml-project-e-20261111150000.json
```

### 5.3 AI Pipelines pre-upgrade check {#ai-pipelines}

DSPA pipelines keep running across the upgrade, but the schema changed. **Inside the pod**, scan for deprecated APIs and custom RBAC:

```sh
rhai-cli migrate run --migration ai-pipelines.pre-upgrade-check --target-version 3.5.0
```

On a clean cluster this passes with nothing to fix. It may report:

- **Deprecated `instructLab` field**: safe to ignore. It's tolerated during the upgrade.
- **Deprecated `v1alpha1` DSPA**: run `rhai-cli migrate run --migration ai-pipelines.update-dsp-role --target-version 3.5.0`, or update each CR to `v1`.
- **Custom RBAC roles that need updates**: check with the AI Pipelines teams, then run `ai-pipelines.update-dsp-role`. If the roles are managed through GitOps, the report is advisory only: update the source.

Re-run until it reports no remaining issues. Then **capture the baseline snapshot** that the post-upgrade check diffs against:

```sh
rhai-cli migrate prepare --migration ai-pipelines.pre-upgrade-check --target-version 3.5.0
ls /tmp/rhoai-upgrade-backup/ai_pipelines/dspa_pre_upgrade_pods.json
```

Expected output (the last line):

```text
/tmp/rhoai-upgrade-backup/ai_pipelines/dspa_pre_upgrade_pods.json
```

> [!CAUTION]
> **This file must survive the upgrade.** Don't delete the PVC or the `rhai-cli` StatefulSet before [Post-upgrade]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade#non-core" >}}) runs the post-upgrade check.

### 5.4 Delete the LlamaStackDistributions {#delete-llamastack}

The Llama Stack 2 → 3 transition is **delete-and-replace**. In 3.5 it becomes **OGX (Open GenAI Stack)**, and `LlamaStackDistribution` is replaced by **`OGXServer` (v1beta1)**. The storage moves from SQLite to PostgreSQL, the VectorDB API is removed, and Inference becomes OpenAI-compatible. **There is no in-place data migration.**

{{< variant env disconnected >}}
**Disconnected: skip this section.** Llama Stack disconnected support starts in OpenShift AI 3.0.
{{< /variant >}}

> [!WARNING]
> Deleting an LSD **permanently loses all of its data**: agent state, vector DB metadata and embeddings, telemetry, file metadata, and everything in SQLite.

**Cluster admin:** identify every LSD and its owners, and tell the owners to archive anything they care about:

```sh
oc get llamastackdistribution -A -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,PHASE:.status.phase,CREATED:.metadata.creationTimestamp
oc get rolebindings -n <namespace> -o wide   # identify owners
```

**LSD owner (optional archive, for reference only):** the SQLite data can't be imported into 3.5. **Inside the pod**, add `--dry-run` first to preview:

```sh
rhai-cli migrate prepare --migration llamastack.backup --target-version 3.5.0 \
  --output-dir /tmp/rhoai-upgrade-backup/llamastack
```

**Delete every LSD.** This also clears the `llamastack / config` critical finding:

```sh
oc get llamastackdistribution -A -o json \
  | jq -r '.items[]? | "\(.metadata.namespace) \(.metadata.name)"' \
  | while read NS NAME; do oc delete llamastackdistribution "$NAME" -n "$NS"; done
oc get llamastackdistribution -A --no-headers 2>/dev/null | wc -l
```

Expected output (the last line):

```text
0
```

Owners recreate them as `OGXServer` CRs in [Post-upgrade]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade#non-core" >}}) and port their client code: `VectorDB` → `Vector_IO`, Completions → OpenAI-compatible format, embeddings → an external embedding-model endpoint, and a review of agent code. See [Working with OGX (3.5)](https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/working_with_ogx/index).

### 5.5 Inventory the components you aren't migrating {#non-migrating}

These carry across with no spec changes. Confirm they're healthy and record their state now.

```sh
oc get pods -n rhoai-model-registries --no-headers | awk '{print $3}' | sort | uniq -c
oc get featurestores -A
oc get pytorchjobs -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name --no-headers | tee ./pytorchjobs-pre-upgrade.txt
```

Expected output, first command (shape; every pod `Running`):

```text
      3 Running
```

- **Model registry and catalog:** registries should show **Available** under **Settings → Model registry settings**. During the upgrade they may be briefly unreachable while their pods restart.
- **Feature Store** (Tech Preview in 2.25, GA since 3.3): every instance `Ready`. Optionally trigger a job: `oc create job test --from=cronjob/<cronjob-name> -n <ns>`.
- **Kubeflow Training Operator:** PyTorchJobs keep running through the upgrade. KFTO v1 is deprecated as of 2.25.10 and is planned for removal in favor of Trainer v2. A later **OpenShift** upgrade drains nodes and can interrupt jobs, so make sure running jobs checkpoint.

### 5.6 Back up and update the inferenceservice-config ConfigMap {#isvc-config}

This must happen **after** every ISVC is RawDeployment and **before** the disables, so that the upgrade reconciler honors the new ignorelist. Back up from your **workstation** (the pod's `/tmp/rhoai-upgrade-backup` path doesn't exist locally):

```sh
oc get configmap inferenceservice-config -n redhat-ods-applications -o yaml > ./inferenceservice-config-backup.yaml && test -s ./inferenceservice-config-backup.yaml && echo saved
```

Expected output:

```text
saved
```

**Inside the pod.** The action adds `opendatahub.io/hardware-profile-name` and `opendatahub.io/hardware-profile-namespace` to the disallowed list, and marks the ConfigMap `opendatahub.io/managed=false` so the upgrade doesn't redeploy your ISVCs:

```sh
rhai-cli migrate run --migration modelserving.hardwareprofiles-ignorelist --target-version 3.5.0
```

Verify (workstation):

```sh
oc get configmap inferenceservice-config -n redhat-ods-applications -o jsonpath='{.metadata.annotations.opendatahub\.io/managed}{"\n"}'
oc get configmap inferenceservice-config -n redhat-ods-applications -o yaml | grep -c hardware-profile
```

Expected output: `false`, followed by a count of at least 2:

```text
false
2
```

> [!NOTE]
> **Side effect of `managed=false`:** the upgrade will **not** redeploy model-serving pods, so they keep their current runtime image. If you want a newer runtime (for example, a newer vLLM build), restart each predictor after the upgrade, once the platform is healthy.

### 5.7 Disable the removed components {#disable}

Every workload is now off these components, so removing them doesn't affect anything running.

#### Kueue {#kueue}

**This is the highest-risk removal.** In 3.5, `Managed` Kueue is **accepted by OLM but rejected at runtime**. If left `Managed`, its admission webhook also intercepts Job creation across the whole cluster and can fall out of sync during the upgrade, rejecting Job submissions for *any* workload. Pick your end state.

{{< variant kueue removed >}}
**Removed:** disable Kueue entirely.

```sh
oc patch $(oc get dsc -o name | head -n1) --type=merge -p '{
  "spec": { "components": { "kueue": { "managementState": "Removed" } } }
}'
oc get dsc -o jsonpath='{.items[0].spec.components.kueue.managementState}{"\n"}'
```

Expected output (last line):

```text
Removed
```

The `KueueReady` condition goes to `False / reason=Removed`. That's expected, and it stays `False` after the upgrade.
{{< /variant >}}

{{< variant kueue unmanaged >}}
**Unmanaged (external RHBOK):** keep Kueue features through the Red Hat build of Kueue. RHBOK must be installed and working **first** (the `rhai-cli` `kueue` RHBOK migration action can automate the move).

If you were on embedded `Managed` Kueue, migrate using the [2.25 Kueue migration guide](https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/2.25/html/managing_openshift_ai/managing-workloads-with-kueue#migrating-to-the-rhbok-operator_kueue). Before you start, preserve your enabled frameworks:

```sh
oc annotate configmap kueue-manager-config -n redhat-ods-applications opendatahub.io/managed=false
```

**Rename any `LocalQueue` named `default`** (for example, to `rhoai-kueue-default`). RHBOK reserves that name, and admission breaks otherwise:

```sh
oc get localqueue -A --field-selector metadata.name=default
```

Expected output (before you set Unmanaged):

```text
No resources found
```

**Label each Kueue-managed project** `kueue.openshift.io/managed=true`. In a labeled namespace, these kinds **must** carry the `kueue.x-k8s.io/queue-name` annotation, or admission is rejected: pytorchjob, notebook, rayjob, raycluster, inferenceservice, llminferenceservice.

Then set the component:

```sh
oc patch $(oc get dsc -o name | head -n1) --type=merge -p '{
  "spec": { "components": { "kueue": {
    "managementState": "Unmanaged",
    "defaultClusterQueueName": "default",
    "defaultLocalQueueName": "default"
  } } }
}'
oc get dsc -o jsonpath='{.items[0].spec.components.kueue.managementState}{"\n"}'
```

Expected output (last line):

```text
Unmanaged
```

`KueueReady` reaches `True` only after the upgrade, once the JobSet operator is installed ([Upgrade]({{< relref "/field-manual/rhoai-2-25-to-3-5/upgrade#jobset" >}})).
{{< /variant >}}

#### CodeFlare (confirm)

The lint reports this under `ray/removal`, but **`ray` and `codeflare` are separate DSC components**. You set `codeflare` to `Removed` in 5.1. Confirm it:

```sh
oc get dsc -o jsonpath='codeflare={.items[0].spec.components.codeflare.managementState} ray={.items[0].spec.components.ray.managementState}{"\n"}'
```

Expected output:

```text
codeflare=Removed ray=Managed
```

#### Known issue: `ray: Removed` silently leaves RayClusters unmanaged {#ki-ray-removed}

**Symptom.** After the upgrade, `raycluster.migrate` reports `Migrated: N, Failed: 0` and `oc get raycluster -A` shows `STATUS=ready`, but the head pod still runs the old 2.x spec, oauth-proxy sidecar included. Deleting the head pod doesn't bring it back, yet the status still reads `ready`.

**Diagnosis.** `ray` isn't a removed component. In 3.5 it provisions the **KubeRay** operator. With `ray: Removed` there's no KubeRay, so nothing reconciles the rewritten CRs, and nothing updates their status either: it goes stale rather than red.

```sh
oc get dsc -o jsonpath='{.items[0].spec.components.ray.managementState}{"\n"}'
oc get pods -A | grep -i kuberay
```

**Workaround.** Leave `ray: Managed`, unless you are deliberately dropping Ray and have no RayClusters to keep. If it's already `Removed`, set it back to `Managed` and continue at [Post-upgrade 8.5]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade#ray" >}}).

**Tracker.** None filed. Observed in a field run.

#### ModelMesh Serving

```sh
oc patch $(oc get dsc -o name | head -n1) --type=merge -p '{
  "spec": { "components": { "modelmeshserving": { "managementState": "Removed" } } }
}'
oc get dsc -o jsonpath='{.items[0].spec.components.modelmeshserving.managementState}{"\n"}'
```

Expected output (last line):

```text
Removed
```

#### KServe Serverless mode

Set `serving` to `Removed` **and** the default mode to `RawDeployment` in one patch:

```sh
oc patch $(oc get dsc -o name | head -n1) --type=merge -p '{
  "spec": { "components": { "kserve": {
    "serving": { "managementState": "Removed" },
    "defaultDeploymentMode": "RawDeployment"
  } } }
}'
```

The Knative stack takes several minutes (5–10) to tear down. Poll until it's gone:

```sh
oc get knativeserving -A
```

Expected output (eventually):

```text
No resources found
```

Then confirm every model still serves. RawDeployment doesn't depend on Knative:

```sh
oc get isvc -A -o custom-columns='NAME:.metadata.name,READY:.status.conditions[?(@.type=="Ready")].status' --no-headers | awk '{print $2}' | sort -u
```

Expected output:

```text
True
```

#### Known issue: Serverless teardown seems stuck {#ki-knative-stuck}

**Symptom.** `oc get knativeserving -A` still lists resources after 10 minutes.

**Diagnosis.**

```sh
oc get pods -n knative-serving
oc logs -n redhat-ods-applications -l app=kserve-controller-manager --tail=50
```

**Workaround.** Wait for the Knative pods to reach zero. If a converted model goes `READY=False` during the teardown, check its predictor (`oc get pods -n <ns> -l serving.kserve.io/inferenceservice=<name>`). RawDeployment models don't depend on Knative. Pod restarts later in the upgrade are expected.

**Tracker.** None.

### 5.8 Remove the Service Mesh dependency {#service-mesh}

OpenShift 4.19+ handles service mesh itself, so 3.x no longer needs the embedded one. Remove it from the DSCI, wait for the SMCP to drain, then delete the ServiceMeshMemberRoll **while the Service Mesh 2 operator is still installed**:

```sh
oc patch $(oc get dsci -o name | head -n1) --type=merge -p '{
  "spec": { "serviceMesh": { "managementState": "Removed" } }
}'
until [ -z "$(oc get smcp -A --no-headers 2>/dev/null)" ]; do echo "Waiting for SMCP to drain..."; sleep 5; done
oc delete smmr default -n istio-system --ignore-not-found
oc get smcp,smmr -A
```

Expected output (the last command):

```text
No resources found
```

#### Known issue: `oc delete smmr` hangs {#ki-smmr-hang}

**Symptom.** The SMMR delete never returns.

**Diagnosis.** The SMMR carries a `maistra.io/istio-operator` finalizer, and only the still-installed Service Mesh 2 operator can clear it:

```sh
oc get smmr default -n istio-system -o jsonpath='{.metadata.finalizers}{"\n"}'
```

**Workaround.** Always do 5.8 before 5.9. If you've already uninstalled the operator, reinstall it briefly so the finalizer can run, then delete the SMMR.

**Tracker.** None. A consequence of the order.

### 5.9 Uninstall the 2.x serving operators {#uninstall-operators}

OpenShift Serverless, Service Mesh 2, and standalone Authorino were dependencies of the 2.x Serverless stack.

> [!CAUTION]
> **Don't remove `servicemeshoperator3` (OSSM v3).** The Cluster Ingress Operator installs it to back the 3.x **Gateway API**. It's part of the new platform. Only `servicemeshoperator` (v2) is a leftover.

```sh
# Standalone Authorino — only if Red Hat Connectivity Link is NOT installed
oc -n openshift-operators delete subscription authorino-operator --ignore-not-found
oc -n openshift-serverless delete subscription serverless-operator --ignore-not-found
# Service Mesh 2 — safe now that the SMCP and SMMR are gone
oc -n openshift-operators delete subscription servicemeshoperator --ignore-not-found

# Delete each operator's SOURCE CSV only — OLM garbage-collects the per-namespace copies
oc get csv -A -o json | jq -r '.items[]
  | select(.metadata.labels."olm.copiedFrom" == null)
  | select(.metadata.name | test("^(authorino-operator|serverless-operator|servicemeshoperator)\\."))
  | "\(.metadata.namespace) \(.metadata.name)"' \
  | while read -r ns name; do echo "Deleting $ns/$name"; oc -n "$ns" delete csv "$name"; done
```

> [!NOTE]
> **Delete only the source CSV.** These operators install with an all-namespaces OperatorGroup, so OLM mirrors each CSV into *every* namespace. On a 109-project cluster that's 108 copies per operator, and a naive `oc get csv -A | … | xargs oc delete csv` sweep fires about 324 deletes against objects OLM owns. Deleting the single source CSV (the one without `olm.copiedFrom`) removes them all: in the field run, 324 rows went to 0.

Verify none remain. The trailing `\.` keeps OSSM v3 out of the match:

```sh
oc get csv -A | grep -E 'authorino-operator\.|serverless-operator\.|servicemeshoperator\.' | grep -v rhods
```

Expected output:

```text
(no output)
```

> [!IMPORTANT]
> **The Service Mesh 2 CRDs stay behind, and that's deliberate for now.** OLM never removes CRDs, so the Maistra `*.istio.io` CRDs survive. After the upgrade they **block the 3.5 Data Science Gateway**. Don't delete them now. They're removed, with a zero-CR safety check, in [Post-upgrade 8.2]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade#ki-stale-istio-crds" >}}).

### 5.10 Final pre-upgrade readiness {#final-readiness}

1. **Set the OpenShift AI Subscription's update approval to `Manual`** so the channel change in Phase 7 can't upgrade automatically:

```sh
oc -n redhat-ods-operator patch subscription rhods-operator --type=merge -p '{"spec":{"installPlanApproval":"Manual"}}'
```

```sh
oc -n redhat-ods-operator get subscription rhods-operator -o jsonpath='{.spec.installPlanApproval}{"\n"}'
```

Expected output:

```text
Manual
```

2. Confirm that the CSV, DSC, and DSCI are healthy:

```sh
oc get csv -n redhat-ods-operator --no-headers | grep rhods-operator | awk '{print $NF}'
oc get dsc  -o jsonpath='{.items[0].status.phase}{"\n"}'
oc get dsci -o jsonpath='{.items[0].status.phase}{"\n"}'
```

Expected output:

```text
Succeeded
Ready
Ready
```

Reconciliation can take a while. Don't continue while the DSC or DSCI shows errors.

3. **Re-run the full assessment** (inside the pod):

```sh
rhai-cli lint --target-version 3.5 | grep -E 'Total:|FAIL|PASS|WARNING|PROHIBITED'
```

Expected output: a summary with zero failures (warnings are acceptable):

```text
Failed: 0
```

## Verification

Platform remediation is done when:

- `rhai-cli lint` shows **no critical or prohibited** findings (exit code `0` or `2`).
- The DSC and DSCI are `Ready`, and the `rhods-operator` 2.25 CSV is `Succeeded`.
- `codeflare`, `modelmeshserving`, and `kserve.serving` are `Removed`, `ray` is `Managed`, and Kueue is `Removed` or `Unmanaged`.
- No Serverless, Service Mesh 2, or standalone Authorino CSVs remain. OSSM v3, if present, is untouched.
- `./ray-backup`, `./trustyai-backup`, `./inferenceservice-config-backup.yaml`, and the PVC's `ai_pipelines/dspa_pre_upgrade_pods.json` all exist.

## Rollback

You are still on 2.25, so most flips can be reversed. The deletions can't.

- **Component flips:** set the component back to `Managed` with the same `oc patch` (for example, `codeflare`, `modelmeshserving`, `kserve.serving`, DSCI `serviceMesh`). For Serverless and Service Mesh, the operators must be reinstalled first if you've already done 5.9.
- **`inferenceservice-config`:** `oc apply -f ./inferenceservice-config-backup.yaml`.
- **Not reversible:** deleted LlamaStackDistributions and their data, and any CSVs or operands you uninstalled (those need a reinstall). For anything beyond a component flip, restore from the [Pre-flight backup]({{< relref "/field-manual/rhoai-2-25-to-3-5/pre-flight#backup" >}}).
- **Don't leave CodeFlare `Removed` for long without upgrading.** Users could create RayClusters without its security configuration.
