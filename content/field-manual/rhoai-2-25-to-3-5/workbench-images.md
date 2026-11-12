---
title: Workbench images
description: Phase 6 — triage custom (BYON) workbench images for the 3.x auth and routing changes, bump required tags, and stop every workbench.
weight: 60
icon: fa-solid fa-laptop-code
---

**Outcome:** every custom workbench image is triaged (re-import only, or rebuild), code-server workbenches are on `2025.2`, **every workbench is stopped**, and the notebook lint returns PASS or WARNING. **Phase 6 of 10 · Before upgrade.** Next: [Upgrade]({{< relref "/field-manual/rhoai-2-25-to-3-5/upgrade" >}}).

3.x changes how workbenches **authenticate** (`oauth-proxy` → `kube-rbac-proxy`) and how they're **routed** (OpenShift Routes → Kubernetes Gateway API with path-based URLs). The operator bumps out-of-the-box images, but **custom (BYON) images** and **old tags** need your attention.

> [!IMPORTANT]
> **Finish all of this before the upgrade.** Unmigrated workbenches stay on the 2.x auth layer. Combined with `NB_PREFIX` routing conflicts, that produces redirect loops or connection failures, especially for RStudio, code-server, and custom images. Workbenches created in 2.25 or earlier are **unsupported** in 3.5 unless they're migrated.

## Prerequisites

- [Remediate the platform]({{< relref "/field-manual/rhoai-2-25-to-3-5/remediate-platform" >}}) complete.
- **Users have been told** to save their work. Every workbench ends this phase **Stopped**. If one can't reach Running, stop or delete it.
- Users know that **workbench URLs change** after the upgrade. They'll get new ones from the dashboard, and old bookmarks break.
- Owners of custom images are available. **Red Hat doesn't rebuild custom images. Rebuilding is the application owner's job.**

## Procedure

### 6.1 Find the custom (BYON) images

```sh
oc get imagestream -n redhat-ods-applications -l app.kubernetes.io/created-by=byon \
  -o custom-columns='NAME:.metadata.name,URL:.metadata.annotations.opendatahub\.io/notebook-image-url'
```

Expected output: one row per custom image, or `No resources found` (shape):

```text
NAME                 URL
custom-my-jupyter    quay.io/my-org/my-jupyter:1.0
```

Any image built before 3.x (for example, an upstream community Jupyter image) won't work as-is after the upgrade.

### 6.2 Triage each custom image {#triage}

The tag alone doesn't tell you which case you're in:

| The image is… | What breaks | What to do |
|---------------|-------------|------------|
| Built ***FROM*** the `2025.2` workbench base | Nothing. Gateway `NB_PREFIX` routing and auth are already built in. | **Re-import** (6.3), then apply the post-upgrade auth patch ([8.4]({{< relref "/field-manual/rhoai-2-25-to-3-5/post-upgrade#workbench-auth" >}})). **No rebuild.** |
| Only *tagged* `2025.2`, on an older base | The tag is cosmetic. It still assumes 2.x routing. | **Full rebuild** (below). |
| Anything older | Auth and routing | **Full rebuild** (below). |

Because the tag can't tell the first two cases apart, **check by testing**: after the upgrade, start **one workbench per unique image** and confirm that it routes and authenticates before you trust the rest.

**Why 2.x custom images break, and how to rebuild them:**

1. **Authentication.** In 2.x, each workbench pod ran an `oauth-proxy` sidecar. In 3.x, the platform injects `kube-rbac-proxy`. An image with oauth-proxy configuration built in fights the platform and produces redirect loops. **Remove all oauth-proxy binaries, config, and sidecar wiring.** The image only needs to serve the notebook on its own port.
2. **Routing.** Workbenches now sit behind the Gateway under a path prefix, which is passed in the `NB_PREFIX` environment variable. The server must serve under that prefix *and* must not strip it from redirects. For Jupyter, use this entrypoint in place of the upstream `start-notebook.sh`, which ignores `NB_PREFIX`:

```sh
#!/bin/bash
set -euo pipefail
exec jupyter lab \
  --ServerApp.base_url="${NB_PREFIX:-/}" \
  --ServerApp.ip=0.0.0.0 --ServerApp.port=8888 \
  --ServerApp.token='' --ServerApp.password='' \
  --ServerApp.allow_origin='*' --ServerApp.open_browser=False --ServerApp.quit_button=False
```

In the Containerfile: drop any oauth-proxy wiring, `COPY` the entrypoint in, and set it as the `ENTRYPOINT`.

> [!WARNING]
> **Rebuild gotchas.**
> - Build for the cluster's architecture: `--platform linux/amd64`. An arm64 image fails with `exec format error`.
> - Production images should be rebased on UBI9 plus Python from `registry.redhat.io`.
> - **NGINX-fronted images (code-server, RStudio)** need two extra fixes that Jupyter doesn't: keep `NB_PREFIX` in every `Location:` redirect header, and serve `/api` as a `302` rather than an inline rewrite (which avoids 403s).

Background: [Introducing the Kubernetes Gateway API for custom image migration](https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/managing_resources/introducing-kubernetes-gateway-api_resource-mgmt).

### 6.3 Re-register the ImageStream with the rebuilt image {#reimport}

```sh
oc tag <registry>/<rebuilt-image>:3.x custom-<name>:3.x \
  -n redhat-ods-applications --reference-policy=local

oc annotate imagestream custom-<name> -n redhat-ods-applications \
  opendatahub.io/notebook-image-url="<registry>/<rebuilt-image>:3.x" --overwrite
```

Verify the new tag resolved:

```sh
oc get istag custom-<name>:3.x -n redhat-ods-applications -o jsonpath='{.image.dockerImageReference}{"\n"}'
```

Expected output: an image reference with a digest (shape):

```text
image-registry.openshift-image-registry.svc:5000/redhat-ods-applications/custom-<name>@sha256:…
```

`--reference-policy=local` pins the ImageStream to the internal registry. If you host the image there, also grant `system:image-puller` to the workbench ServiceAccount for `redhat-ods-applications`. See [Importing a custom workbench image](https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/managing_openshift_ai/creating-custom-workbench-images#importing-a-custom-workbench-image_custom-images).

#### Known issue: `oc tag` can't reach the image {#ki-oc-tag}

**Symptom.** The ImageStream tag shows an import error.

**Diagnosis.**

```sh
oc describe imagestream custom-<name> -n redhat-ods-applications | grep -iA2 error
```

**Workaround.** Check that the image URL is correct and public, or add a pull secret for the registry to `redhat-ods-applications`.

**Tracker.** None.

### 6.4 Bump out-of-date image tags

| Image | 3.5 requirement |
|-------|-----------------|
| Jupyter | `2025.2` *recommended*. A Jupyter workbench on `2025.1` still lints as compatible. |
| code-server | `2025.2` **required** |
| RStudio (BuildConfig) | `latest` **required**, plus a fresh build *after* the upgrade |

First check which tags the ImageStream actually offers. The target may not exist on your cluster yet:

```sh
oc get imagestream code-server-notebook -n redhat-ods-applications \
  -o jsonpath='{range .spec.tags[*]}{.name}{"\n"}{end}'
```

Expected output (must include):

```text
2025.2
```

Bump every code-server workbench that is on an old tag:

```sh
oc get notebooks -A -o json \
  | jq -r '.items[]
      | select(.spec.template.spec.containers[0].image | test("code-?server"))
      | select(.spec.template.spec.containers[0].image | test(":2025\\.[01]$"))
      | "\(.metadata.namespace)/\(.metadata.name)"' \
  | while read -r nb; do
      NS="${nb%/*}"; NAME="${nb##*/}"
      oc patch notebook "$NAME" -n "$NS" --type=json \
        -p='[{"op":"replace","path":"/spec/template/spec/containers/0/image","value":"image-registry.openshift-image-registry.svc:5000/redhat-ods-applications/code-server-notebook:2025.2"}]'
    done
```

Verify that no code-server workbench is left on `2025.0` or `2025.1`:

```sh
oc get notebooks -A -o json | jq -r '[.items[] | .spec.template.spec.containers[0].image | select(test("code-?server")) | select(test(":2025\\.[01]$"))] | length'
```

Expected output:

```text
0
```

### 6.5 Stop every workbench {#stop}

The notebook controller treats the `kubeflow-resource-stopped` annotation as "stopped" whenever it's present. **Use a timestamp, not the literal `true`.**

```sh
STAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
for row in $(oc get notebooks -A --no-headers | awk '{print $1"/"$2}'); do
  ns="${row%/*}"; name="${row##*/}"
  oc -n "$ns" annotate notebook "$name" kubeflow-resource-stopped="$STAMP" --overwrite
done
```

Verify that no workbench has running pods:

```sh
oc get notebooks -A -o custom-columns="NAMESPACE:.metadata.namespace,NAME:.metadata.name,RUNNING:.status.readyReplicas"
```

Expected output: every `RUNNING` value is `0` or `<none>` (shape):

```text
NAMESPACE      NAME           RUNNING
ml-project-a   my-workbench   <none>
```

#### Known issue: a workbench won't stop, and its pod keeps coming back {#ki-wb-wont-stop}

**Symptom.** The pod restarts after you annotate the workbench.

**Diagnosis.** Check that the annotation actually applied:

```sh
oc get notebook <name> -n <ns> -o jsonpath='{.metadata.annotations.kubeflow-resource-stopped}{"\n"}'
```

**Workaround.** If it's empty, re-annotate with a timestamp. Any non-empty value means stopped.

**Tracker.** None.

### 6.6 Verify workbench readiness

**Inside the pod:**

```sh
rhai-cli lint --target-version 3.5 --checks "*notebook*"
```

Expected output: the notebook checks report **PASS** or **WARNING**, with no **FAIL**. The report sorts images into compatibility buckets (compatible, custom-needs-verification, incompatible-rebuild-after, and so on) and confirms that every notebook is stopped.

```text
PASS
```

## Verification

- The notebook lint has no FAIL.
- Every workbench's `RUNNING` value is `0`/`<none>`.
- Every custom image is triaged. Rebuilt images are re-imported, and the owners of "rebuild after" images have a date.

## Rollback

- **Restart a workbench** (for example, if the upgrade is postponed): remove the annotation with `oc -n <ns> annotate notebook <name> kubeflow-resource-stopped-`.
- **Revert a tag bump:** patch the image back to the previous tag, using the same `oc patch notebook … /spec/template/spec/containers/0/image` form.
- ImageStream re-tags are additive. The old tag is still there.
