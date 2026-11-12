---
title: Assess
description: Phase 3 — deploy the rhai-cli pod, run the migration lint, read its findings, and submit the report to Red Hat.
weight: 30
icon: fa-solid fa-clipboard-check
---

**Outcome:** a long-lived `rhai-cli` pod with a persistent backup volume in `rhai-migration`, a first assessment report, and that report attached to your proactive support case. The findings decide which of Phases 4–6 you need. **Phase 3 of 10 · Before upgrade.** Next: [Convert model serving]({{< relref "rhoai-2-25-to-3-5/convert-model-serving" >}}).

## Prerequisites

- [Baseline]({{< relref "rhoai-2-25-to-3-5/baseline" >}}) saved.
- Permission to create a namespace, a StatefulSet, and a PVC.
- A StorageClass that can provision a 1 Gi RWO volume. The default StorageClass works on most clusters.

{{< variant env disconnected >}}
**Disconnected:** mirror `registry.redhat.io/rhoai/rhai-cli-rhel9:v3.5.0` to your local registry using your internal procedure, and use the mirrored reference in the StatefulSet below.
{{< /variant >}}

> [!NOTE]
> **The migration namespace** (`rhai-migration`) is a management namespace, separate from your workload namespaces. If you use a different name, substitute it everywhere you see `rhai-migration` in this manual.

## Procedure

### 3.1 Deploy the rhai-cli pod

The image `registry.redhat.io/rhoai/rhai-cli-rhel9:v3.5.0` (binary `kubectl-odh` 1.26.4) pulls with the cluster's global pull secret. It holds the `rhai-cli lint` assessment and every `rhai-cli migrate` action used in this manual. The 2.x helper scripts (`/opt/rhai-upgrade-helpers/*.sh`, `ray_cluster_migration.py`) **no longer exist**.

Create the namespace:

```sh
oc new-project rhai-migration
```

Expected output (first line):

```text
Now using project "rhai-migration" on server "https://api.<cluster-domain>:6443".
```

Create the StatefulSet:

```sh
cat <<'EOF' | oc apply -n rhai-migration -f -
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: rhai-cli
spec:
  serviceName: rhai-cli
  replicas: 1
  selector:
    matchLabels:
      app: rhai-cli
  template:
    metadata:
      labels:
        app: rhai-cli
    spec:
      containers:
        - name: rhai-cli
          image: registry.redhat.io/rhoai/rhai-cli-rhel9:v3.5.0
          command:
            - sleep
            - infinity
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
          volumeMounts:
            - name: backup
              mountPath: /tmp/rhoai-upgrade-backup
  volumeClaimTemplates:
    - metadata:
        name: backup
      spec:
        accessModes:
          - ReadWriteOnce
        # storageClassName: <your-storage-class>   # set if the PVC stays Pending
        resources:
          requests:
            storage: 1Gi
EOF
```

Expected output:

```text
statefulset.apps/rhai-cli created
```

Wait for the pod:

```sh
oc wait pod/rhai-cli-0 -n rhai-migration --for=condition=Ready --timeout=120s
```

Expected output:

```text
pod/rhai-cli-0 condition met
```

> [!CAUTION]
> **Keep this PVC until the very end.** `/tmp/rhoai-upgrade-backup` holds your reports and component backups, including the AI Pipelines snapshot that the *post*-upgrade check diffs against. Delete it only in [Clean up]({{< relref "rhoai-2-25-to-3-5/clean-up" >}}), after copying everything off.

#### Known issue: rhai-cli pod never becomes Ready (PVC Pending) {#ki-pvc-pending}

**Symptom.** `oc wait` times out. The pod is `Pending`.

**Diagnosis.**

```sh
oc get pvc -n rhai-migration
oc describe pod rhai-cli-0 -n rhai-migration | tail -5
```

**Workaround.** If `backup-rhai-cli-0` is `Pending`, the cluster has no default StorageClass. Uncomment `storageClassName`, set it to one listed by `oc get storageclass`, delete the StatefulSet and PVC, and re-apply.

**Tracker.** None. This is environment-specific.

### 3.2 Open a shell in the pod and log in

The assessment runs with *your* credentials, not the pod's service account. From your workstation:

```sh
oc exec -it rhai-cli-0 -n rhai-migration -- /bin/bash
```

Then, **inside the pod**:

```sh
export KUBECONFIG=/tmp/.kubeconfig
export PATH="/opt/rhai-cli/bin:$PATH"
oc login --token=<token> --server=https://api.<cluster-domain>:6443
oc whoami && command -v rhai-cli
```

Expected output:

```text
<your-username>
/opt/rhai-cli/bin/rhai-cli
```

> [!TIP]
> In any **new** shell in the pod (for example, when you come back for the post-upgrade work), re-run the two `export` lines, or call the binary by its full path, `/opt/rhai-cli/bin/rhai-cli`.

### 3.3 How the migrate actions behave

Every remediation in Phases 4–8 is a `rhai-cli migrate` action:

```text
rhai-cli migrate run|prepare|list --migration <name> --target-version 3.5.0 [--dry-run] [--yes]
```

The action works out on its own whether it is in the pre- or post-upgrade phase.

| Component | Action | Phase |
|-----------|--------|-------|
| Model serving | `modelserving.serverless-to-raw` | [4]({{< relref "rhoai-2-25-to-3-5/convert-model-serving#serverless" >}}) |
| | `modelserving.modelmesh-to-raw` | [4]({{< relref "rhoai-2-25-to-3-5/convert-model-serving#modelmesh" >}}) |
| | `modelserving.hardwareprofiles-ignorelist` | [5.6]({{< relref "rhoai-2-25-to-3-5/remediate-platform#isvc-config" >}}) |
| | `modelserving.managed-isvc-config` | [8.3]({{< relref "rhoai-2-25-to-3-5/post-upgrade#restore-isvc-config" >}}) |
| Workbenches | `workbenches.patch-auth-model`, `workbenches.verify-migration` | [8.4]({{< relref "rhoai-2-25-to-3-5/post-upgrade#workbench-auth" >}}) |
| TrustyAI | `trustyai.metrics`, `trustyai.data` | [5.2]({{< relref "rhoai-2-25-to-3-5/remediate-platform#trustyai" >}}), [8.7]({{< relref "rhoai-2-25-to-3-5/post-upgrade#trustyai" >}}) |
| | `trustyai.patch-guardrails`, `trustyai.migrate-gorch-otel-exporter` | [8.6]({{< relref "rhoai-2-25-to-3-5/post-upgrade#guardrails" >}}) |
| | `trustyai.break-gpu-deadlock` | [8.7]({{< relref "rhoai-2-25-to-3-5/post-upgrade#trustyai" >}}) |
| Llama Stack / OGX | `llamastack.backup` | [5.4]({{< relref "rhoai-2-25-to-3-5/remediate-platform#delete-llamastack" >}}) |
| AI Pipelines | `ai-pipelines.pre-upgrade-check`, `ai-pipelines.update-dsp-role` | [5.3]({{< relref "rhoai-2-25-to-3-5/remediate-platform#ai-pipelines" >}}) |
| | `ai-pipelines.post-upgrade-check` | [8.8]({{< relref "rhoai-2-25-to-3-5/post-upgrade#non-core" >}}) |
| Ray | `raycluster.backup` | [5.1]({{< relref "rhoai-2-25-to-3-5/remediate-platform#ray-backup" >}}) |
| | `raycluster.migrate` | [8.5]({{< relref "rhoai-2-25-to-3-5/post-upgrade#ray" >}}) |
| Kueue | `kueue` (RHBOK migration) | [5.7]({{< relref "rhoai-2-25-to-3-5/remediate-platform#kueue" >}}) |
| Training | `training.verify-workloads` | [8.8]({{< relref "rhoai-2-25-to-3-5/post-upgrade#non-core" >}}) |

#### Known issue: a declined prompt reports success and exits 0 {#ki-declined-prompt}

**Symptom.** A `migrate run` ends with `All migrations completed`, but nothing changed:

```text
    → User cancelled Serverless to RawDeployment conversion
Migration modelserving.serverless-to-raw completed with skipped steps
All migrations completed (some steps were skipped).
```

**Diagnosis.** Every `migrate run` asks `Proceed with …? [y/N]`. If it doesn't get a `y`, the action cancels, and that **exit code is 0**. That includes runs without a TTY, in a pipeline, or through a plain `oc exec`. Treat **"completed with skipped steps"** as a failure until you have checked the result independently (for example, `oc get isvc -A`).

**Workaround.** Answer `y`, or pass `--yes` (`-y`) when you script it:

```sh
rhai-cli migrate run --migration <name> --target-version 3.5.0 --yes
```

The examples in this manual leave out `--yes` so you see each prompt.

**Tracker.** None filed. Observed in a field run (2.25.10 → 3.5.1).

> [!WARNING]
> **Run long actions in a session that will not time out.** `modelserving.serverless-to-raw` deletes and recreates each ISVC one at a time. It took more than two minutes for just two ISVCs. If the shell is interrupted mid-run, ISVCs can be left deleted or half-converted. Use `tmux`/`screen` (or `nohup` inside the pod), and re-check `oc get isvc -A` before re-running anything.

### 3.4 Run the assessment

`rhai-cli lint` is a **read-only** diagnostic, and it only works **before the upgrade**. On a cluster already at 3.5 it does nothing: *"Current and target versions are the same (3.5), no checks will be executed."*

Full scan (inside the pod):

```sh
rhai-cli lint --target-version 3.5; echo "exit=$?"
```

Expected output: a findings table, followed by an exit code. On an unremediated cluster that is:

```text
exit=1
```

| Exit code | Meaning |
|-----------|---------|
| `0` | All checks passed. |
| `1` | At least one `prohibited` or `critical` finding. This is expected while blockers remain, not a tool error. |
| `2` | Warnings only. This is acceptable. |

To cut the noise, filter to one component (wrap the value in `*`):

```sh
rhai-cli lint --target-version 3.5 --checks "*datasciencepipelines*"
```

| Component | `--checks` | Component | `--checks` |
|-----------|-----------|-----------|-----------|
| Dashboard | `*dashboard*` | Llama Stack / OGX | `*llamastack*` |
| AI Pipelines | `*datasciencepipelines*` | ModelMesh | `*modelmesh*` |
| TrustyAI Guardrails | `*guardrails*` | Workbenches | `*notebook*` |
| KServe | `*kserve*` | Ray | `*ray*` |
| Kueue | `*kueue*` | Kubeflow Training | `*trainingoperator*` |

**Reading the rows.** The columns are `STATUS | KIND | GROUP | CHECK | IMPACT | MESSAGE` (KIND now comes *before* GROUP).

| Impact | Meaning | Action |
|--------|---------|--------|
| `prohibited` | Upgrade is not possible. | Stop. Find the component's section in this manual; if that doesn't resolve it, contact Red Hat Support. |
| `critical` | The component or workload will fail. | Fix it in the phase that covers it, then re-run the lint. |
| `warning` | A potential issue or deprecated field. | Review it. |
| `info` | A prerequisite is met. | None. |

Expect the critical count to drop as you work through the phases. Also expect fixes to **surface new findings**: for example, `llamastack / config` is a 3.x prerequisite that doesn't exist yet.

### 3.5 Submit the assessment to Red Hat

Write the report to the PVC (inside the pod):

```sh
rhai-cli lint --target-version 3.5 --output yaml > /tmp/rhoai-upgrade-backup/rhai-cli-output.yaml
ls -l /tmp/rhoai-upgrade-backup/rhai-cli-output.yaml
```

Expected output (shape; owner, size, and date vary, but the size must not be 0):

```text
-rw-r--r--. 1 1000790000 1000790000 42905 Nov 11 15:00 /tmp/rhoai-upgrade-backup/rhai-cli-output.yaml
```

#### Known issue: `lint --output yaml` prints LINT_BLOCKED and exits 1 {#ki-lint-blocked}

**Symptom.** While blockers remain, the command prints this to stderr and exits `1`:

```text
error:
  code: LINT_BLOCKED
  message: 'prohibited or blocking findings detected: upgrade cannot proceed'
```

**Diagnosis.** This is the expected result before remediation. The YAML still goes to stdout correctly.

**Workaround.** None needed. Judge the run by the `ls -l` above, not by the exit code.

**Tracker.** None. Working as designed.

Copy the report to your workstation (run this **outside** the pod):

```sh
oc cp rhai-migration/rhai-cli-0:/tmp/rhoai-upgrade-backup/rhai-cli-output.yaml ./rhai-cli-output.yaml && test -s ./rhai-cli-output.yaml && echo copied
```

Expected output:

```text
copied
```

Attach `rhai-cli-output.yaml` to your proactive support case ([How to provide files to Red Hat Support](https://access.redhat.com/solutions/2112)). Re-run and re-submit it as you clear blockers.

## Verification

- `rhai-cli-0` is `Running` in `rhai-migration`, and its PVC is `Bound`.
- `rhai-cli-output.yaml` is on your workstation and attached to the support case.
- You have a list of every `critical`/`prohibited` finding. Each one maps to Phase 4, 5, or 6.

## Rollback

`lint` changes nothing. To remove the pod before you've started any `migrate` action:

```sh
oc delete project rhai-migration
```

Expected output:

```text
project.project.openshift.io "rhai-migration" deleted
```

**Do not** do this once you've begun Phase 4. The PVC then holds your component backups.
