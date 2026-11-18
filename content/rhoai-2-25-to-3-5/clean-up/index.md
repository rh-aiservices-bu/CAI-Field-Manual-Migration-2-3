---
title: Clean up
description: Phase 10 — copy every backup off the PVC, remove the rhai-cli pod, clear 2.x leftovers, tell users the new URLs, and record the final 3.5 state.
weight: 100
icon: fa-solid fa-broom
---

**Outcome:** every backup is on your workstation (or in your archive), the `rhai-cli` pod and PVC are gone, there are no Ray dashboard, Serverless, or Service Mesh 2 leftovers, users have their new URLs, and the final 3.5 state is recorded. **Phase 10 of 10 · Clean up.** This is the last phase.

## Prerequisites

- [Re-test]({{< relref "rhoai-2-25-to-3-5/re-test" >}}) passed, and the evidence archive is saved.
- The [AI Pipelines post-upgrade check]({{< relref "rhoai-2-25-to-3-5/post-upgrade#non-core" >}}) has run. It needed the PVC.

## Procedure

### 10.1 Copy everything off the PVC

Deleting the PVC destroys everything under `/tmp/rhoai-upgrade-backup`: assessment reports, RayCluster CRs, TrustyAI metrics and data, the AI Pipelines snapshot, and Llama Stack archives.

```sh
oc cp rhai-migration/rhai-cli-0:/tmp/rhoai-upgrade-backup ./rhoai-upgrade-backup-final
ls ./rhoai-upgrade-backup-final
```

Expected output: the directories created by the phases you ran (shape):

```text
ai_pipelines  llamastack  ray_cluster  rhai-cli-output.yaml  trustyai
```

### 10.2 Remove the rhai-cli pod and PVC

```sh
oc delete statefulset rhai-cli -n rhai-migration
oc delete pvc backup-rhai-cli-0 -n rhai-migration
```

Expected output:

```text
statefulset.apps "rhai-cli" deleted
persistentvolumeclaim "backup-rhai-cli-0" deleted
```

Optionally delete the namespace too: `oc delete project rhai-migration`.

### 10.3 Remove the leftover Ray dashboard resources

`raycluster.migrate` left the CodeFlare `ray-dashboard-<cluster>` Routes and `<cluster>-oauth-<hash>` Services behind. They return **HTTP 403** because the ServiceAccount they used is gone. Per cluster:

```sh
oc delete route -n <ns> -l ray.io/cluster=<cluster-name> --ignore-not-found
oc get route,svc -n <ns> | grep -E 'ray-dashboard-|-oauth-'
```

Expected output (the second command):

```text
(no output)
```

If a `<cluster>-oauth-<hash>` Service is still listed, delete it by name.

### 10.4 Remove any remaining 2.x serving leftovers

```sh
oc get csv -A | grep -E 'authorino-operator\.|serverless-operator\.|servicemeshoperator\.' | grep -v rhods
oc get namespace knative-serving --ignore-not-found
```

Expected output:

```text
(no output)
```

If anything is listed, remove it as in [5.9]({{< relref "rhoai-2-25-to-3-5/remediate-platform#uninstall-operators" >}}), then run `oc delete namespace knative-serving`. **Never touch `servicemeshoperator3`.**

Optionally, remove the harmless `*.maistra.io` CRDs. Unlike the `*.istio.io` ones removed in [8.2]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ki-stale-istio-crds" >}}), they hold no CRs and don't block the Gateway:

```sh
oc get crd -l maistra-version -o custom-columns=NAME:.metadata.name,VER:.metadata.labels.maistra-version
```

### 10.5 Tell users what changed

- **New dashboard URL and new workbench URLs** (Gateway API). Their 2.x URLs no longer resolve.
- **Model endpoints:** publish new URLs **only** for models you converted from Serverless or ModelMesh. Models that were already RawDeployment keep their Route and URL ([9.2]({{< relref "rhoai-2-25-to-3-5/re-test#what-changes-for-a-standard-model" >}})).
- **Renamed dashboard navigation:** **AI hub → Models** (catalog) and **Settings → Model registry settings**.
- **Llama Stack is now OGX:** owners recreate their servers as `OGXServer`.
- **Runbooks:** remove references to Serverless and ModelMesh, and note that `RawDeployment` now shows as `Standard`.

### 10.6 Record the final state {#re-enable-gitops}

{{< variant deploy gitops >}}
**Update Git first, then re-enable sync.** If you re-enable first, the next sync reverts the migration. Your Git source must now describe the 3.x state, at least:

- the DSC with `codeflare`, `modelmeshserving`, and `kserve.serving` `Removed` (or dropped under v2), `ray` `Managed`, and Kueue `Removed`/`Unmanaged`;
- the DSCI without `serviceMesh` `Managed`;
- the `rhods-operator` Subscription on `stable-3.5`;
- no InferenceServices with Serverless or ModelMesh annotations, and no multi-model ServingRuntimes;
- no Service Mesh 2, Serverless, or standalone Authorino Subscriptions;
- the new cert-manager and JobSet operators (and RHCL, if used);
- `OGXServer` in place of `LlamaStackDistribution`.

Before re-enabling, preview what a sync would change:

```sh
argocd app diff <app-name>
```

Expected output: no diff, or only differences you intend:

```text
(no output)
```

Then restore `syncPolicy.automated` on each Application, from Git or by re-applying the Application manifest.
{{< /variant >}}

{{< variant deploy standard >}}
Save the 3.5 DSC for your runbook:

```sh
oc get dsc -o yaml > ./dsc-3.5-final.yaml && echo saved
```

Expected output:

```text
saved
```
{{< /variant >}}

## Verification

- `./rhoai-upgrade-backup-final` exists, and the PVC and StatefulSet are gone.
- There are no `ray-dashboard-*` / `*-oauth-*` leftovers and no 2.x serving operators, and `servicemeshoperator3` is untouched.
- Users have been sent the new URLs.
- 10.6 is done for your deployment type.
- Close your proactive support case with a short summary and the evidence archive.

## Rollback

Deleting leftovers is safe: they were inert. The only irreversible step is deleting the PVC, which is why 10.1 comes first. To restore a component backup later, use the copy in `./rhoai-upgrade-backup-final`.
