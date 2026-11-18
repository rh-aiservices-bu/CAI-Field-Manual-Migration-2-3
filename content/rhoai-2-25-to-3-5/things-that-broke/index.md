---
title: Things that broke
description: Symptom index — every known break in the 2.25 → 3.5 migration, what it looks like, and a link to the fix on the page where you hit it.
weight: 110
icon: fa-solid fa-triangle-exclamation
---

**Outcome:** you match what you're seeing to a known issue in one scan, and jump to its full write-up (symptom, diagnosis command, workaround, tracker) on the page where it happens.

Each known issue lives **inline**, on the page where you hit it. This page is only an index into them. Rows are in migration order. If a symptom matches more than one row, take the earliest phase first: later failures are often caused by a skipped earlier step.

## Before the upgrade

| You see | Likely cause | Fix |
|---------|--------------|-----|
| A converted runtime or DSC component goes back to its old state minutes later | GitOps sync still in flight | [Pre-flight]({{< relref "rhoai-2-25-to-3-5/pre-flight#ki-gitops-revert" >}}) |
| A loop runs once with the whole list as one item | Running under `zsh`, not `bash` | [Pre-flight]({{< relref "rhoai-2-25-to-3-5/pre-flight" >}}) |
| `rhai-cli-0` never becomes Ready | PVC `Pending`, no default StorageClass | [Assess]({{< relref "rhoai-2-25-to-3-5/assess#ki-pvc-pending" >}}) |
| `migrate run` says "completed with skipped steps", exit 0, nothing changed | Confirmation prompt wasn't answered `y` | [Assess]({{< relref "rhoai-2-25-to-3-5/assess#ki-declined-prompt" >}}) |
| `lint --output yaml` prints `LINT_BLOCKED`, exit 1 | Expected while blockers remain | [Assess]({{< relref "rhoai-2-25-to-3-5/assess#ki-lint-blocked" >}}) |
| Converted ISVC `READY=False` for minutes | RawDeployment reloading the model | [Convert model serving]({{< relref "rhoai-2-25-to-3-5/convert-model-serving#ki-slow-ready" >}}) |
| `storage type [pvc] is not supported`, then OVMS `model_config_list.json` invalid, then `0/1` | PVC-backed OVMS not fully converted | [Convert model serving]({{< relref "rhoai-2-25-to-3-5/convert-model-serving#ki-ovms-pvc" >}}) |
| Working RawDeployment model loses its runtime after the sweep | `multiModel` still `true` on the flipped runtime | [Convert model serving]({{< relref "rhoai-2-25-to-3-5/convert-model-serving#sweep" >}}) |
| ServingRuntime delete refused, "still in use" | A ModelMesh ISVC still references it | [Convert model serving]({{< relref "rhoai-2-25-to-3-5/convert-model-serving#ki-runtime-in-use" >}}) |
| Serverless ISVC stuck in `Terminating` | Finalizer deadlock: Knative/Istio already removed | [Convert model serving]({{< relref "rhoai-2-25-to-3-5/convert-model-serving#ki-terminating-isvc" >}}) |
| `deploymentMode` webhook error on a hand-recreated ISVC | Changing the mode of an existing object | [Convert model serving]({{< relref "rhoai-2-25-to-3-5/convert-model-serving#ki-webhook-mode" >}}) |
| `raycluster.backup` fails | CodeFlare still `Managed` | [Remediate the platform]({{< relref "rhoai-2-25-to-3-5/remediate-platform#ray-backup" >}}) |
| TrustyAI backup `permission denied` | Missing `--output-dir` (read-only root) | [Remediate the platform]({{< relref "rhoai-2-25-to-3-5/remediate-platform#ki-trustyai-perm" >}}) |
| `io: read/write on closed pipe`, "Backed up 0 file(s)" | Empty PVC-backed TrustyAI service (harmless) | [Remediate the platform]({{< relref "rhoai-2-25-to-3-5/remediate-platform#ki-trustyai-pipe" >}}) |
| Knative teardown takes 10+ minutes | Normal drain, or a stuck controller | [Remediate the platform]({{< relref "rhoai-2-25-to-3-5/remediate-platform#ki-knative-stuck" >}}) |
| `oc delete smmr` hangs | Service Mesh 2 operator already uninstalled | [Remediate the platform]({{< relref "rhoai-2-25-to-3-5/remediate-platform#ki-smmr-hang" >}}) |
| Hundreds of CSV deletes from an uninstall sweep | Deleting OLM copies instead of the source CSV | [Remediate the platform]({{< relref "rhoai-2-25-to-3-5/remediate-platform#uninstall-operators" >}}) |
| `oc tag` import error for a custom image | Wrong URL or missing pull secret | [Workbench images]({{< relref "rhoai-2-25-to-3-5/workbench-images#ki-oc-tag" >}}) |
| Workbench pod keeps coming back after stop | Stop annotation not applied | [Workbench images]({{< relref "rhoai-2-25-to-3-5/workbench-images#ki-wb-wont-stop" >}}) |

## During the upgrade

| You see | Likely cause | Fix |
|---------|--------------|-----|
| No InstallPlan; `ResolutionFailed` / `ConstraintsNotSatisfiable` | Stale OLM resolver | [Upgrade]({{< relref "rhoai-2-25-to-3-5/upgrade#ki-olm-stale" >}}) |
| Approval loop times out before `Succeeded` | A removed component left `Managed` | [Upgrade]({{< relref "rhoai-2-25-to-3-5/upgrade#ki-approval-timeout" >}}) |
| `no matches for kind "JobSetOperator"` | Wrong API group | [Upgrade]({{< relref "rhoai-2-25-to-3-5/upgrade#ki-jobset-api" >}}) |
| DSC `Not Ready`, `KueueReady=False` (Unmanaged path) | JobSet operator not installed | [Upgrade]({{< relref "rhoai-2-25-to-3-5/upgrade#jobset" >}}) |

## After the upgrade

| You see | Likely cause | Fix |
|---------|--------------|-----|
| DSC `Ready=False [AdminAckRequired]` | Upgrade gates: pre-migration work skipped | [Post-upgrade]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ki-admin-ack" >}}) |
| DSC `ProvisioningFailed: modelregistry`; Gateway `Programmed=False`; `istiod-openshift-gateway` 0/1; "Istio CRDs are managed by an unknown party" | Stale Service Mesh 2 `*.istio.io` CRDs | [Post-upgrade]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ki-stale-istio-crds" >}}) |
| Dashboard Gateway URL doesn't resolve on a managed cluster | NetworkPolicy rejected by an admission webhook | [Post-upgrade]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ki-gateway-netpol" >}}) |
| `workbenches.verify-migration` reports `Failed: N` | Custom image still has oauth-proxy built in | [Post-upgrade]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ki-wb-verify-failed" >}}) |
| RayCluster `ready` but head pod still has `oauth-proxy` | KubeRay hasn't adopted the new spec | [Post-upgrade]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ki-ray-stale" >}}) |
| `raycluster.migrate` succeeds but nothing recreates pods; status stale | `ray: Removed`, so no KubeRay | [Remediate the platform]({{< relref "rhoai-2-25-to-3-5/remediate-platform#ki-ray-removed" >}}) |
| Guardrails `/info` shows `UNKNOWN` | Backend unreachable (check the baseline) | [Post-upgrade]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ki-gorch-unknown" >}}) |
| GPU predictor stuck `Pending` next to TrustyAI | GPU deployment deadlock | [Post-upgrade]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ki-gpu-deadlock" >}}) |
| `training.verify-workloads` "please report a bug" | A running KFTO job (healthy) | [Post-upgrade]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ki-training-blocker" >}}) |
| ISVC `Ready` but HTTP 503, "Application Not Available", Outdated runtimes, leftover Knative or Authorino | See the model-serving matrix | [Post-upgrade]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ki-serving-matrix" >}}) |
| Model URL unchanged but auth still `oauth-proxy` | Expected: only workbenches move to kube-rbac-proxy | [Re-test]({{< relref "rhoai-2-25-to-3-5/re-test#ki-isvc-oauth-proxy" >}}) |
| Every workbench probe `HTTP 000` | Empty `GATEWAY_HOST` (wrong jsonpath) | [Re-test]({{< relref "rhoai-2-25-to-3-5/re-test#ki-gateway-host-empty" >}}) |
| Workbench URL 404 | HTTPRoute not propagated yet, or Notebook not patched | [Re-test]({{< relref "rhoai-2-25-to-3-5/re-test#ki-wb-404" >}}) |
| DSPA healthz 404 | Pipeline route path changed | [Re-test]({{< relref "rhoai-2-25-to-3-5/re-test#ki-dspa-404" >}}) |
| LLM 502/503 right after the upgrade | Predictor still rolling | [Re-test]({{< relref "rhoai-2-25-to-3-5/re-test#ki-llm-502" >}}) |
| Old Ray dashboard routes return 403 | Leftover CodeFlare resources | [Clean up]({{< relref "rhoai-2-25-to-3-5/clean-up" >}}) |

## Trackers referenced

- KB [7134025](https://access.redhat.com/articles/7134025): converting ModelMesh and Serverless InferenceServices to RawDeployment (the manual fallback).
- KB [7137771](https://access.redhat.com/solutions/7137771): dashboard URL 404s after the upgrade (bookmark redirects).
- KB [7141146](https://access.redhat.com/solutions/7141146): OSSM 3.x fails to deploy on a disconnected cluster.

Most of the known issues on these pages say **"None filed. Observed in a field run."** They came from real 2.25.10 → 3.5.1 runs and have no Jira or KCS id yet. When one gets a tracker, add its id to the inline write-up.
