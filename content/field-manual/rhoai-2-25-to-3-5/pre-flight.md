---
title: Pre-flight
description: Phase 1 — confirm the deployment type and prerequisites, install cert-manager, and take the verified backup that is your only rollback path.
weight: 10
icon: fa-solid fa-plane-departure
---

**Outcome:** the cluster meets the 3.5 prerequisites, nothing will revert your changes behind your back, cert-manager is installed, and a **verified, restorable backup** exists. **Phase 1 of 10 · Prepare.** Next: [Baseline]({{< relref "/field-manual/rhoai-2-25-to-3-5/baseline" >}}).

## Prerequisites

- `cluster-admin` on the 2.25 cluster, and a workstation with `bash`, `oc`, and `jq`.
- The cluster API endpoint, `https://api.<cluster-domain>:6443`, and a login token. Get both from the OpenShift console: your user menu → **Copy login command**. In this manual, replace `<cluster-domain>` with your cluster's base domain (for example `ocp.example.com`) and `<token>` with your token.
- A maintenance window agreed with your users. OpenShift AI does not support zero-downtime upgrades.

> [!WARNING]
> **Run every snippet in this manual with `bash`, not `zsh`.** The snippets assume bash word-splitting. Under `zsh` (the macOS default), an unquoted `for c in $VAR; do …` runs **once with the whole string** instead of once per item, which quietly defeats the Istio-CRD safety check in [Post-upgrade]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade#ki-stale-istio-crds" >}}), among others. Start a `bash` shell first, or wrap multi-line blocks in `bash -c '…'`. (`for x in $(cmd)` works in both shells.)

Log in and confirm who you are:

```sh
bash
oc login --token=<token> --server=https://api.<cluster-domain>:6443
oc whoami
```

Expected output (the last line):

```text
<your-username>
```

## Procedure

### 1.1 Confirm the deployment type {#stop-gitops}

{{< variant deploy gitops >}}
**Stop the GitOps reconciler before anything else.** Argo CD (or any GitOps controller) that owns your OpenShift AI resources will **revert the migration as you make it**. Converted InferenceServices, flipped ServingRuntimes, and DSC component states all go back to their Git state, usually within seconds and without telling you.

Two steps. You need both:

```sh
# 1. Turn off automated sync on every Application that owns RHOAI resources
for a in $(oc get applications.argoproj.io -n openshift-gitops -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}'); do
  oc patch application.argoproj.io "$a" -n openshift-gitops --type=merge \
    -p '{"spec":{"syncPolicy":{"automated":null}}}'
done

# 2. Terminate any sync still in flight — disabling automated sync does NOT cancel one
oc get applications.argoproj.io -n openshift-gitops -o json \
  | jq -r '.items[] | select(.operation != null) | .metadata.name' \
  | while read -r a; do oc patch application.argoproj.io "$a" -n openshift-gitops --type=merge -p '{"operation":null}'; done
```

Verify that no Application is still running an operation:

```sh
oc get applications.argoproj.io -A -o json | jq -r '.items[] | select(.operation != null) | .metadata.name'
```

Expected output:

```text
(no output)
```

Verify that automated sync is off everywhere:

```sh
oc get applications.argoproj.io -A -o json | jq -r '[.items[] | select(.spec.syncPolicy.automated != null)] | length'
```

Expected output:

```text
0
```

While the reconciler is paused, you apply this manual's changes directly with `oc`. Record each one so you can commit the 3.x state to Git in [Clean up]({{< relref "/field-manual/rhoai-2-25-to-3-5/clean-up#re-enable-gitops" >}}) **before** you turn sync back on.
{{< /variant >}}

{{< variant deploy standard >}}
Confirm that no Argo CD Application exists, so nothing can revert your changes:

```sh
oc get applications.argoproj.io -A --no-headers 2>/dev/null | wc -l
```

Expected output:

```text
0
```

If the count is not `0`, the cluster *is* GitOps-managed. Set **Deployment type** to **GitOps-managed** and follow that block.
{{< /variant >}}

{{< variant deploy gitops >}}
#### Known issue: GitOps reverts the migration after sync is "off" {#ki-gitops-revert}

**Symptom.** A converted ServingRuntime goes back to `multiModel: true`, or a DSC component returns to `Managed`, minutes after you changed it, even though the owning Application shows `automated: none`.

**Diagnosis.** An operation already in flight keeps retrying and re-applying Git state. Turning off automated sync does not cancel it:

```sh
oc get applications.argoproj.io -A -o json | jq -r '.items[] | select(.operation != null) | .metadata.name'
```

**Workaround.** Clear the operation (step 2 above) and confirm the command returns nothing. Then re-apply the change that was reverted.

**Tracker.** None filed. Observed in a field run: one runtime was reverted twice, minutes apart.
{{< /variant >}}

### 1.2 Confirm the prerequisites

**OpenShift 4.19.9 or later.** If you are below that, upgrade OpenShift first ([OpenShift update docs](https://docs.redhat.com/en/documentation/openshift_container_platform/4.19/html/updating_clusters/index)).

```sh
oc get clusterversion version -o jsonpath='{.status.desired.version}{"\n"}'
```

Expected output (a version at or above):

```text
4.19.9
```

**OpenShift AI 2.25.10 or later.** The 3.5 migration channel only accepts 2.25.10+.

```sh
oc get csv -n redhat-ods-operator -o name | grep rhods-operator
```

Expected output (2.25.10 or a later 2.25.z):

```text
clusterserviceversion.operators.coreos.com/rhods-operator.2.25.10
```

**Kueue management state.** Before the upgrade it must be `Removed` or `Unmanaged`. You change it in [Remediate the platform]({{< relref "/field-manual/rhoai-2-25-to-3-5/remediate-platform#kueue" >}}). For now, just record the current state:

```sh
oc get datasciencecluster -A -o jsonpath='{.items[0].spec.components.kueue.managementState}{"\n"}'
```

Expected output: one of `Managed`, `Removed`, or `Unmanaged`:

```text
Managed
```

- `Removed`: Kueue is disabled and ready to migrate.
- `Unmanaged`: ready to migrate, as long as an external Red Hat build of Kueue (RHBOK) operator is installed and working.
- `Managed`: **not supported in 3.5.** OLM accepts it for backward compatibility, but it is rejected at runtime. You will move off it in Phase 5.

{{< variant kueue removed >}}
**Kueue path: Removed.** You will disable Kueue entirely in Phase 5. Nothing else to prepare now.
{{< /variant >}}

{{< variant kueue unmanaged >}}
**Kueue path: Unmanaged (RHBOK).** The external Red Hat build of Kueue operator must be installed and working **before** you set `Unmanaged` in Phase 5. If you are on embedded `Managed` Kueue today, plan the RHBOK migration now using the [2.25 Kueue migration guide](https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/2.25/html/managing_openshift_ai/managing-workloads-with-kueue#migrating-to-the-rhbok-operator_kueue).
{{< /variant >}}

### 1.3 Choose your migration approach {#choose-your-migration-approach}

- **Side-by-side.** Stand up a second 3.5 environment next to the untouched 2.25 one and move content across. The 2.25 environment stays intact, so a full backup is *recommended* rather than mandatory. Choose this if you can afford a second environment and a longer overlap.
- **In-place.** Modify the existing environment. Choose this if you must migrate inside a strict maintenance window. It carries the highest risk: **a robust full-cluster backup is mandatory, because it is the only rollback.**

**This manual documents the in-place path.**

### 1.4 Notify users

Tell your users the plan and the downtime window. Also warn them that **dashboard and workbench URLs change** (the Gateway API move) and that **Llama Stack data is not carried across** (see [Remediate the platform]({{< relref "/field-manual/rhoai-2-25-to-3-5/remediate-platform#delete-llamastack" >}})).

### 1.5 Install the cert-manager Operator for Red Hat OpenShift

3.x requires the cert-manager Operator.

Create the namespace, OperatorGroup, and Subscription:

```sh
oc apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: cert-manager-operator
---
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata:
  name: openshift-cert-manager-operator
  namespace: cert-manager-operator
spec:
  targetNamespaces:
    - cert-manager-operator
---
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: openshift-cert-manager-operator
  namespace: cert-manager-operator
spec:
  channel: stable-v1
  name: openshift-cert-manager-operator
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: Automatic
EOF
```

{{< variant deploy gitops >}}
Add these three manifests to your Git source too, so the next sync doesn't prune them.
{{< /variant >}}

Verify the operator succeeded and its pods are running:

```sh
oc get csv -n cert-manager-operator -o jsonpath='{range .items[*]}{.metadata.name} {.status.phase}{"\n"}{end}' | grep cert-manager
oc get pods -n cert-manager --no-headers | awk '{print $3}' | sort -u
```

Expected output (the version suffix will vary):

```text
cert-manager-operator.v1.x.y Succeeded
Running
```

### 1.6 Take a verified backup {#backup}

For an in-place migration this is the **only** rollback path. Do not continue without it.

- An **etcd snapshot** of the control plane.
- An **OADP (OpenShift API for Data Protection) backup** of the OpenShift AI namespaces and persistent volumes.

Follow [OpenShift backup and restore](https://docs.redhat.com/en/documentation/openshift_container_platform/4.19/html/backup_and_restore/backup-restore-overview). **Test a restore** before you go on. An untested backup is not a rollback path.

If you use OADP, verify the backup completed:

```sh
oc get backups.velero.io -n openshift-adp -o custom-columns='NAME:.metadata.name,PHASE:.status.phase'
```

Expected output (your backup name):

```text
NAME                    PHASE
rhoai-pre-migration     Completed
```

> [!NOTE]
> The component backups later in this manual (RayClusters, TrustyAI, AI Pipelines in [Phase 5]({{< relref "/field-manual/rhoai-2-25-to-3-5/remediate-platform" >}})) protect individual components' state during the flips. They do **not** replace the full-cluster backup.

## Verification

Pre-flight is done when all of these hold:

- `oc whoami` returns your user, and you are in `bash`.
- 1.1 is done for your deployment type, and nothing can revert your changes.
- OpenShift is ≥ 4.19.9 and OpenShift AI is ≥ 2.25.10.
- The cert-manager CSV reports `Succeeded`.
- A full-cluster backup exists **and you have tested restoring it**.
- A proactive support case is open ([overview]({{< relref "/field-manual/rhoai-2-25-to-3-5#open-a-proactive-support-case" >}})).

## Rollback

Nothing in this phase touches OpenShift AI workloads.

{{< variant deploy gitops >}}
- **Re-enable GitOps** only if you are abandoning the migration *before* making any changes. Restore each Application's `syncPolicy.automated` from Git (or re-apply the Application manifest). If you have already made migration changes, update Git first (see [Clean up]({{< relref "/field-manual/rhoai-2-25-to-3-5/clean-up#re-enable-gitops" >}})), or the next sync reverts them.
{{< /variant >}}

- **cert-manager** is a 3.x prerequisite and is harmless on 2.25. Leave it installed.
