---
title: Upgrade
description: Phase 7 — switch to the support-required-upgrade-3.5 channel, approve the InstallPlan, install the JobSet operator, wait for the DSC, and move to stable-3.5.
weight: 70
icon: fa-solid fa-circle-up
---

**Outcome:** `rhods-operator` 3.5 is `Succeeded`, no 2.x CSV is left, the JobSet operator is installed, the DSC and DSCI are `Ready`, and the Subscription is on **`stable-3.5`**. **Phase 7 of 10 · Upgrade.** Next: [Post-upgrade]({{< relref "rhoai-2-25-to-3-5/post-upgrade" >}}).

> [!CAUTION]
> **This is the point of no return.** Once you approve the InstallPlan, the only way back is restoring the [Pre-flight backup]({{< relref "rhoai-2-25-to-3-5/pre-flight#backup" >}}). OpenShift AI doesn't support rolling back an in-place migration.

## Prerequisites

- Phases 4–6 complete. **The latest `rhai-cli lint` shows zero critical or prohibited findings.** Nothing enforces this: the lint can't stop OLM (see the [overview]({{< relref "rhoai-2-25-to-3-5#the-assessment-drives-the-work-but-it-does-not-stop-you" >}})).
- The Subscription's approval is `Manual` ([5.10]({{< relref "rhoai-2-25-to-3-5/remediate-platform#final-readiness" >}})).
- Every workbench is stopped. Everyone, including you, is **logged out of the OpenShift AI dashboard**.

## Procedure

### 7.1 Inspect the current subscription

```sh
oc -n redhat-ods-operator get subscription rhods-operator \
  -o jsonpath='channel={.spec.channel}{"\n"}approval={.spec.installPlanApproval}{"\n"}installedCSV={.status.installedCSV}{"\n"}'
```

Expected output (your current channel and 2.25.z):

```text
channel=stable-2.25
approval=Manual
installedCSV=rhods-operator.2.25.10
```

Confirm that the catalog offers the migration channel:

```sh
oc get packagemanifest rhods-operator -n openshift-marketplace \
  -o jsonpath='{range .status.channels[*]}{.name}{"\n"}{end}' | grep -x 'support-required-upgrade-3.5'
```

Expected output:

```text
support-required-upgrade-3.5
```

The **`support-required-upgrade-3.5`** channel is kept separate so that nobody can trigger this upgrade by accident. It is the **only** channel with the cross-major 2.25 → 3.5 path: its edge carries `skipRange >=2.25.10 <2.26.0`, so any 2.25.10+ goes straight to 3.5. (The unversioned `support-required-upgrade` channel is for 2.25 → **3.3** only.)

### 7.2 Mirror the required OSSM v3 {#mirror-ossm}

{{< variant env connected >}}
**Connected cluster: skip this step.** The Cluster Ingress Operator pulls OSSM v3 itself.
{{< /variant >}}

{{< variant env disconnected >}}
**Disconnected cluster.** Mirror exactly the OSSM v3 version and channel that the Cluster Ingress Operator requires:

```sh
oc set env deployment/ingress-operator -n openshift-ingress-operator --list | grep GATEWAY_API_OPERATOR_VERSION | sed 's/.*=//'
oc set env deployment/ingress-operator -n openshift-ingress-operator --list | grep GATEWAY_API_OPERATOR_CHANNEL | sed 's/.*=//'
```

Create an `ImageSetConfiguration` for `servicemeshoperator3` pinned to that `minVersion`/`maxVersion` and channel. Run `oc-mirror --v2` into your mirror registry, then apply the generated cluster resources, making sure the CatalogSource is named `redhat-operators`. Verify that the version is available:

```sh
oc get packagemanifest -o json | jq '.items[] | select(.metadata.name=="servicemeshoperator3" and .status.catalogSource=="redhat-operators") | .status.channels[] | select(.name=="<ossm-channel>") | .entries[].name'
```

Expected output: includes the version reported by `GATEWAY_API_OPERATOR_VERSION` (shape):

```text
"servicemeshoperator3.v3.x.y"
```

If OSSM-dependent components don't become ready after the upgrade, see KB [7141146](https://access.redhat.com/solutions/7141146).
{{< /variant >}}

### 7.3 Switch to the migration channel

```sh
oc -n redhat-ods-operator patch subscription rhods-operator --type=merge -p '{
  "spec": { "channel": "support-required-upgrade-3.5" }
}'
```

Confirm that OLM produced an unapproved InstallPlan:

```sh
oc -n redhat-ods-operator get installplan \
  -o custom-columns='NAME:.metadata.name,CSV:.spec.clusterServiceVersionNames[0],APPROVED:.spec.approved'
```

Expected output (shape):

```text
NAME            CSV                     APPROVED
install-abcde   rhods-operator.3.5.0    false
```

#### Known issue: no InstallPlan appears, stale `ResolutionFailed` {#ki-olm-stale}

**Symptom.** No InstallPlan appears after the channel switch. The Subscription reports `ResolutionFailed` / `ConstraintsNotSatisfiable`.

**Diagnosis.** First confirm that the channel name is exactly `support-required-upgrade-3.5`. Then check:

```sh
oc -n redhat-ods-operator get subscription rhods-operator -o jsonpath='{.status.conditions}' | jq '.[] | select(.type=="ResolutionFailed")'
oc get jobs -n openshift-marketplace
```

If `ResolutionFailed` is `"True"` while the bundle unpack jobs are `Complete`, the resolver is stale. It's not a real dependency conflict.

**Workaround.** Restart the OLM catalog operator to force a fresh resolve:

```sh
oc rollout restart deployment/catalog-operator -n openshift-operator-lifecycle-manager
oc rollout status  deployment/catalog-operator -n openshift-operator-lifecycle-manager --timeout=120s
oc -n redhat-ods-operator get installplan
```

The 3.5 InstallPlan appears within seconds.

**Tracker.** None filed. Observed in a field run.

### 7.4 Approve the upgrade

Because of the skipRange edge, any 2.25.10+ normally resolves to a **single** InstallPlan straight to 3.5. If OLM produces more than one, approve each in turn. This loop handles both cases:

```sh
deadline=$(( $(date +%s) + 1800 ))
while (( $(date +%s) < deadline )); do
  IP=$(oc -n redhat-ods-operator get installplan -o json \
    | jq -r '.items[] | select(.spec.approved==false) | .metadata.name' | head -1)
  if [ -n "$IP" ]; then
    echo "Approving InstallPlan $IP ..."
    oc -n redhat-ods-operator patch installplan "$IP" --type=merge -p '{"spec":{"approved":true}}'
    sleep 30; continue
  fi
  phase=$(oc -n redhat-ods-operator get csv rhods-operator.3.5.0 -o jsonpath='{.status.phase}' 2>/dev/null)
  echo "rhods-operator.3.5.0 phase: ${phase:-<pending>}"
  [ "$phase" = "Succeeded" ] && break
  sleep 30
done
```

If your catalog serves a later 3.5.z (for example `rhods-operator.3.5.1`), change the CSV name in the loop to match.

Verify that the new CSV succeeded and no 2.x CSV remains:

```sh
oc get csv -n redhat-ods-operator --no-headers | grep rhods-operator | awk '{print $1, $NF}'
```

Expected output: exactly one line:

```text
rhods-operator.3.5.0 Succeeded
```

#### Known issue: the approval loop times out before `Succeeded` {#ki-approval-timeout}

**Symptom.** The loop runs out its 30 minutes, and the CSV is still not `Succeeded`.

**Diagnosis.**

```sh
oc logs -n redhat-ods-operator deploy/rhods-operator --tail=50
```

**Workaround.** A stuck InstallPlan usually means a removed component was left `Managed`. Re-run the [assessment]({{< relref "rhoai-2-25-to-3-5/assess" >}}) if you are still on 2.25, fix what it reports, and the upgrade resumes. If the CSV is `Succeeded` but the DSC is held, see [Known issue: DSC held at AdminAckRequired]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ki-admin-ack" >}}).

**Tracker.** None.

### 7.5 Install the JobSet operator {#jobset}

New in 3.5: Kueue depends on the **JobSet** operator. Install it into its own namespace with an **OwnNamespace** OperatorGroup. Do **not** use `openshift-operators`.

```sh
oc create namespace jobset-system

cat <<'EOF' | oc apply -f -
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata:
  name: jobset-operator
  namespace: jobset-system
spec:
  targetNamespaces:
    - jobset-system
---
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: job-set
  namespace: jobset-system
spec:
  channel: stable-v1.0
  name: job-set
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: Automatic
EOF
```

Wait for the CSV, then **read the operand CRD's group/version from the cluster**, because it can differ between builds:

```sh
oc get csv -n jobset-system --no-headers | grep jobset-operator | awk '{print $1, $NF}'
oc get crd | grep -i jobsetoperator
oc get crd jobsetoperators.operator.openshift.io -o jsonpath='{.spec.group}/{.spec.versions[0].name}{"\n"}'
```

Expected output (on `jobset-operator.v1.0.0`; later builds may say v1.0.1):

```text
jobset-operator.v1.0.0 Succeeded
jobsetoperators.operator.openshift.io            2026-11-11T15:40:00Z
operator.openshift.io/v1
```

Create the operand, using the group/version that was reported:

```sh
cat <<'EOF' | oc apply -f -
apiVersion: operator.openshift.io/v1   # <-- confirm against the CRD above
kind: JobSetOperator
metadata:
  name: cluster
spec: {}
EOF
oc get crd jobsets.jobset.x-k8s.io -o name
```

Expected output:

```text
jobsetoperator.operator.openshift.io/cluster created
customresourcedefinition.apiextensions.k8s.io/jobsets.jobset.x-k8s.io
```

#### Known issue: `no matches for kind "JobSetOperator"` {#ki-jobset-api}

**Symptom.** Applying the `JobSetOperator` fails with `no matches for kind "JobSetOperator"`.

**Diagnosis.** The wrong API group. Earlier drafts of the migration guide used `operator.jobset.x-k8s.io/v1alpha1`, which is a different group entirely.

**Workaround.** Use the group/version that `oc get crd … -o jsonpath='{.spec.group}/{.spec.versions[0].name}'` reports. On v1.0.0 that's `operator.openshift.io/v1`.

**Tracker.** None. A documentation error, fixed here.

{{< variant kueue unmanaged >}}
**Kueue Unmanaged:** JobSet is what lets `KueueReady` reach `True`.
{{< /variant >}}

{{< variant kueue removed >}}
**Kueue Removed:** `KueueReady=False` is expected and does **not** block the DSC. JobSet is installed anyway so the platform is ready if you enable Kueue later.
{{< /variant >}}

### 7.6 Wait for the DSC and DSCI

```sh
oc wait --for=jsonpath='{.status.phase}'=Ready dsc/$(oc get dsc -o jsonpath='{.items[0].metadata.name}') --timeout=20m
oc get dsci -o jsonpath='{.items[0].status.phase}{"\n"}'
```

Expected output:

```text
datasciencecluster.datasciencecluster.opendatahub.io/default-dsc condition met
Ready
```

If the wait times out, **don't debug components yet.** Check the DSC conditions first. The two most common causes are documented in Post-upgrade:

- `Ready=False [AdminAckRequired]` → [Known issue: DSC held at AdminAckRequired]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ki-admin-ack" >}})
- `ProvisioningFailed: modelregistry`, or a Gateway that never programs → [Known issue: stale Service Mesh 2 Istio CRDs]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ki-stale-istio-crds" >}})

```sh
oc get dsc -o json | jq -r '.items[0].status.conditions[] | select(.status!="True") | "\(.type) \(.reason) \(.message)"'
```

Expected output, once the DSC is healthy: only conditions that are false by design (for example, `KueueReady Removed …` on the Removed path), or nothing:

```text
(no output)
```

### 7.7 Move off the migration channel

`support-required-upgrade-3.5` is a one-shot trigger. It doesn't advance to later 3.5.z patches. Move to **`stable-3.5`**. Don't use `stable-3.x`, which would eventually offer a later minor version; that's a separate planning decision.

```sh
oc patch subscription rhods-operator -n redhat-ods-operator --type=merge -p '{
  "spec": { "channel": "stable-3.5" }
}'
```

Verify:

```sh
oc get subscription rhods-operator -n redhat-ods-operator -o jsonpath='channel={.spec.channel} state={.status.state} installedCSV={.status.installedCSV}{"\n"}'
```

Expected output:

```text
channel=stable-3.5 state=AtLatestKnown installedCSV=rhods-operator.3.5.0
```

If users had bookmarked dashboard URLs, set up redirects now: KB [7137771](https://access.redhat.com/solutions/7137771).

## Verification

- `rhods-operator.3.5.x` is `Succeeded`, and no `rhods-operator.2.*` CSV remains.
- The JobSet CSV is `Succeeded`, and `jobsets.jobset.x-k8s.io` exists.
- The DSC and DSCI are `Ready`, or you are following one of the two linked known issues.
- The Subscription is on `stable-3.5`, `AtLatestKnown`.

## Rollback

**None supported.** From here, the only path back to 2.25 is restoring the [Pre-flight backup]({{< relref "rhoai-2-25-to-3-5/pre-flight#backup" >}}) (etcd snapshot plus OADP). If the upgrade is stuck, go forward: fix the cause in [Post-upgrade]({{< relref "rhoai-2-25-to-3-5/post-upgrade" >}}) and contact Red Hat Support on your proactive case.
