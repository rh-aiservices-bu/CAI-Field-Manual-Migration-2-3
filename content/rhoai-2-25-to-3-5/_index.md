---
title: RHOAI 2.25 → 3.5 migration
description: Migrate Red Hat OpenShift AI 2.25.10 (or later 2.25.z) in place to 3.5 — in the order you do the work, with every step verified and every known break documented where you hit it.
weight: 5
icon: fa-solid fa-route
outputs: [HTML, RSS, print, markdown, LLMSFULL]
cascade:
  type: docs
  footer_style: slim
---

**Outcome:** an OpenShift AI cluster moved in place from **2.25.10 or a later 2.25.z** to **3.5**, with every workload migrated off the components 3.5 removes, the upgrade applied, and a before/after test record that shows nothing broke without you noticing.

This manual is a task-ordered field version of the 2.25 → 3.5 migration. The official documentation is organized by *component*, with each component split into "before upgrade" and "after upgrade" chapters. Here each step sits in the **phase you do it in**, and the pages follow that order in the left nav. Every command is followed by a verify step, and every known break is documented on the page where you will hit it.

> [!IMPORTANT]
> **The one rule: migrate a workload *off* a component before you remove the component.** Get the order wrong and you lose a running model, with no automated way back. OpenShift AI does not support rollback once an in-place migration starts. The only way back is the verified backup you take in [Pre-flight]({{< relref "rhoai-2-25-to-3-5/pre-flight" >}}).

## The migration at a glance

| Stage | Page | What you do | Why it's here |
|-------|------|-------------|---------------|
| Prepare | [1. Pre-flight]({{< relref "rhoai-2-25-to-3-5/pre-flight" >}}) | Confirm deployment type and prerequisites, install cert-manager, take a verified backup | The only rollback path is a backup |
| Before upgrade | [2. Baseline]({{< relref "rhoai-2-25-to-3-5/baseline" >}}) | Snapshot every workload's working state | Proof the migration didn't break anything without anyone noticing |
| Before upgrade | [3. Assess]({{< relref "rhoai-2-25-to-3-5/assess" >}}) | Deploy `rhai-cli`, run the lint, send it to Red Hat | The findings drive every remaining phase |
| Before upgrade | [4. Convert model serving]({{< relref "rhoai-2-25-to-3-5/convert-model-serving" >}}) | Serverless → RawDeployment, ModelMesh → KServe | Move models off the serving modes 3.5 removes |
| Before upgrade | [5. Remediate the platform]({{< relref "rhoai-2-25-to-3-5/remediate-platform" >}}) | Back up stateful components, then disable removed ones | Back up before you flip; flip in dependency order |
| Before upgrade | [6. Workbench images]({{< relref "rhoai-2-25-to-3-5/workbench-images" >}}) | Triage custom images, bump tags, stop workbenches | Workbench auth and routing change in 3.x |
| **Upgrade** | [7. Upgrade]({{< relref "rhoai-2-25-to-3-5/upgrade" >}}) | Switch channel, approve, install JobSet, wait for the DSC | The operator upgrade itself |
| After upgrade | [8. Post-upgrade]({{< relref "rhoai-2-25-to-3-5/post-upgrade" >}}) | Clear gates, fix the Gateway, restore config, migrate workbenches and Ray | Finish each component on 3.x |
| After upgrade | [9. Re-test]({{< relref "rhoai-2-25-to-3-5/re-test" >}}) | Re-run the baseline tests and diff | Prove the workloads survived |
| Clean up | [10. Clean up]({{< relref "rhoai-2-25-to-3-5/clean-up" >}}) | Remove 2.x leftovers, record the final state | Finish clean |

If something has already gone wrong, start at [Things that broke]({{< relref "rhoai-2-25-to-3-5/things-that-broke" >}}), a symptom index that links to each fix where it lives. Use the selector at the top of any page to show only the steps for your deployment type (GitOps-managed or not), cluster network, and your Kueue end state.

## Why this is a migration, not an upgrade

Earlier OpenShift AI version bumps were routine operator upgrades. The move to 3.x changes all of the following in one step:

- **Components are removed.** KServe Serverless mode, ModelMesh Serving, and CodeFlare are gone in 3.5. The embedded Kueue is replaced by the external Red Hat build of Kueue (RHBOK), and the embedded Service Mesh dependency is dropped. Any workload running on these must be migrated *off first*, or it stops serving.
- **Components are renamed.** Llama Stack becomes **OGX (Open GenAI Stack)**, and the `LlamaStackDistribution` CR is replaced by `OGXServer` (v1beta1). `RawDeployment` model serving is displayed as **`Standard`** in 3.5. This is a display rename only, not a re-conversion.
- **Routing changes for the dashboard and workbenches, not Standard models.** The dashboard and workbenches move to the Kubernetes Gateway API. Workbench URLs become path-based (`https://<gateway-host>/notebook/<ns>/<name>/`) and their 2.x Routes are deleted, so bookmarks break. **An ISVC that is already RawDeployment keeps its Route and its URL unchanged** (measured; see [Re-test]({{< relref "rhoai-2-25-to-3-5/re-test#what-changes-for-a-standard-model" >}})). Serverless ISVCs are the ones whose endpoints move.
- **Authentication changes for workbenches only.** Workbench pods move from the `oauth-proxy` sidecar to `kube-rbac-proxy`. **Model serving does not make this move:** an auth-enabled Standard ISVC still runs `oauth-proxy` on 3.5.
- **Schema changes.** HardwareProfiles move to a new API group, and the DSC/DSCI move from the v1 to the v2 API. The operator converts them automatically on startup.

## The order that matters

1. **Convert Serverless InferenceServices to RawDeployment**, so they survive the removal of Serverless mode. ([Phase 4]({{< relref "rhoai-2-25-to-3-5/convert-model-serving" >}}))
2. **Migrate ModelMesh models to KServe**, so they survive the removal of ModelMesh. ([Phase 4]({{< relref "rhoai-2-25-to-3-5/convert-model-serving" >}}))
3. **Back up every stateful component** (RayClusters, TrustyAI metrics and data, AI Pipelines DSPAs) *before* the destructive flips. ([Phase 5]({{< relref "rhoai-2-25-to-3-5/remediate-platform" >}}))
4. **Only then disable** Serverless, ModelMesh, and CodeFlare, set Kueue to `Removed` or `Unmanaged`, and tear down Service Mesh. ([Phase 5]({{< relref "rhoai-2-25-to-3-5/remediate-platform" >}}))
5. **Handle the workbenches**: bump the images you can, plan rebuilds for the rest, stop them all. ([Phase 6]({{< relref "rhoai-2-25-to-3-5/workbench-images" >}}))
6. **Upgrade**, then verify and re-test. (Phases 7–9)

## The assessment drives the work, but it does not stop you

Red Hat ships `rhai-cli`, which inspects the cluster and reports what must change. The loop is: run `rhai-cli lint`, fix the **critical** and **prohibited** findings, re-run until clean, *then* upgrade.

Two things the assessment is **not**:

- **Not a workload inventory.** It reports *incompatible* workloads and *removed* components. Compatible ones (a healthy RawDeployment ISVC, a Feast Feature Store, a KFTO PyTorchJob) do not appear. A clean lint means "nothing blocking", not "nothing to migrate". That is why [Baseline]({{< relref "rhoai-2-25-to-3-5/baseline" >}}) inventories what is actually running.
- **Not a gate.** The lint is advisory and has no hook into OLM. On a 2.25.10 test cluster with every pre-migration step deliberately skipped, OLM walked **2.25.10 → 2.25.11 → 3.5.1** and reached `Succeeded` without any check stopping it. The real enforcement happens one layer down: the 3.x operator installs, then **refuses to reconcile the DataScienceCluster** until its upgrade gates clear (`Ready=False [AdminAckRequired]`). That held the workloads in their pre-upgrade shape on the test cluster. But by then you are past the point where rollback is supported, and the gates are acknowledgements that anyone can set by hand. See [Known issue: DSC held at AdminAckRequired]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ki-admin-ack" >}}).

Run the lint, clear it, *then* upgrade.

## Roles

- **Cluster administrator**: owns the migration. Runs the assessment and `rhai-cli migrate` actions, performs the upgrade, and coordinates everyone else. Needs `cluster-admin`, `bash`, `oc`, and `jq`.
- **OpenShift AI administrator**: dashboard and project access. Handles workbench images, custom runtimes, and user groups.
- **OpenShift AI users** (data scientists, ML engineers): own application-level artifacts such as Llama Stack configs, pipeline definitions, and custom workbench images. Their involvement is optional if the administrator handles everything.

## Open a proactive support case

Before you begin, open a proactive support case on the [Red Hat Customer Portal](https://access.redhat.com) to tell Red Hat you plan to migrate to 3.5 ([How to submit a Proactive Case](https://access.redhat.com/articles/5387111)). You attach the assessment output to it in [Assess]({{< relref "rhoai-2-25-to-3-5/assess" >}}).

> [!NOTE]
> **Orientation, not a support statement.** The commands and outputs here are what worked during field runs of 2.25.10 → 3.5.1. Check them against the [official OpenShift AI 3.5 documentation](https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5) before relying on them. This page documents the **in-place** path; for side-by-side, see [Pre-flight]({{< relref "rhoai-2-25-to-3-5/pre-flight#choose-your-migration-approach" >}}).

- [Pre-flight](pre-flight/)
- [Baseline](baseline/)
- [Assess](assess/)
- [Convert model serving](convert-model-serving/)
- [Remediate the platform](remediate-platform/)
- [Workbench images](workbench-images/)
- [Upgrade](upgrade/)
- [Post-upgrade](post-upgrade/)
- [Re-test](re-test/)
- [Clean up](clean-up/)
- [Things that broke](things-that-broke/)
{.cards}
