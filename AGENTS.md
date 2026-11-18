# Repository Guidance

Hugo Extended >= 0.168 + Go >= 1.27 documentation site (theme via Hugo modules,
no Node.js). README.md is the source of truth for setup and architecture.
This repo owns content only and imports `CAI-Field-Manual-Shell` as a Hugo
module for look-and-feel and rules; propose shell/chrome changes there.

## Before you push: the publication gate (mandatory)

There is no test suite. The only correctness check is the production build:

```sh
hugo --cleanDestinationDir --gc --minify --environment production \
  --printPathWarnings 2>&1 | grep -i warn | grep -v "css.Sass: libsass"
```

No output = clean. Build failure or any other WARN = not done. Fix and re-run.
Note the root 404 is expected: with a path in baseURL the dev server serves at
`http://localhost:1313/CAI-Field-Manual-Migration-2-3/`.

In CI the same gate runs via the Shell checkout (`shell/scripts/publication-gate.sh`
via `.github/workflows/github-pages.yaml`).

Contract check (optional, needs sibling Shell clone + `public/` from the production build):

```sh
sh ../CAI-Field-Manual-Shell/scripts/check-contracts.sh
```

## Content rules

- The one manual lives at `content/rhoai-2-25-to-3-5/` (one page per
  migration phase).
- Author doctrine: read `Docs/field-manual-conventions.md` before
  writing manual pages. Five active conventions (customize tokens retired
  in this repo): outcome-first navigation; status-gate verification (every
  command followed by a verify step with literal expected output); inline
  known issues (symptom, diagnosis, workaround, tracker id); variant selector
  axes; dual consumption (markdown output never hides variants).
- Display options: variant blocks `{{< variant deploy gitops >}}` (also
  `standard` = not GitOps-managed; every command is `oc` CLI, so there is no
  console/CLI split), `{{< variant env disconnected >}}` (also `connected`), and
  `{{< variant kueue removed >}}` (also `unmanaged`). Option ids must
  exist in `hugo.yaml` `params.variants`. Never delete a variant block to fix a
  rendering complaint — markdown/llms.txt outputs show ALL variants.
- Environment values are plain placeholders, not customize tokens: write
  `https://api.<cluster-domain>:6443`, `<token>`, `<namespace>`, and the
  literal migration namespace `rhai-migration`. Never hardcode a real cluster
  host. (`params.customize` is unset; the customize shortcodes remain but are
  unused.)
  Never hardcode names or cluster hosts.

## Chrome lives in Shell

Chrome files (layouts, assets, static, scripts) live in `CAI-Field-Manual-Shell`,
imported as a pinned Hugo module (`hugo.yaml` → `module.imports`). The pinned
oink v1.4.0 copies in Shell carry their own provenance comments. Propose
shell/chrome changes there, not here.

- The pinned oink v1.4.0 copies in Shell are `layouts/docs/baseof.html`,
  `layouts/_partials/shell/sidebar-tree.html`, `layouts/_partials/pager-state.html`,
  `layouts/_partials/actions/page-urls.html`, `assets/js/action-registry.js`,
  `assets/js/page-actions.js`, `layouts/_partials/actions/context.html`,
  `layouts/_partials/actions/title-menu.html`. Each carries a provenance comment
  naming its deliberate change. In this repo only two overrides are kept locally
  (each with a `TODO(Shell)` header): `layouts/_partials/actions/page-urls.html`
  and `layouts/_partials/td-variant-selector.html`.
- Sanctioned extension points (free to edit): `hugo.yaml`, `data/home.yaml`,
  `content/`. Everything else (`td-variant-selector.html`, `hooks/…`,
  customize shortcodes, `static/js/`, `static/css/`) lives in Shell.

## Verification for JS changes

Interactive behavior lives in the Shell module's `assets/js/` + `assets/css/`.
If you change it there, verify the rendered page actually works (dev server +
browser), not just that the build passes.

