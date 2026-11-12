# Repository Guidance

Hugo Extended >= 0.168 + Go >= 1.27 documentation site (theme via Hugo modules,
no Node.js). README.md is the source of truth for setup and architecture.

## Before you push: the publication gate (mandatory)

There is no test suite. The only correctness check is the production build:

```sh
hugo --cleanDestinationDir --gc --minify --environment production \
  --printPathWarnings 2>&1 | grep -i warn | grep -v "css.Sass: libsass"
```

No output = clean. Build failure or any other WARN = not done. Fix and re-run.
Note the root 404 is expected: with a path in baseURL the dev server serves at
`http://localhost:1313/rhoai-2.25-3.5-migration-field-guide/`.

## Content rules

- Manuals live in `content/field-manual/<manual>/`. The one manual is
  `content/field-manual/rhoai-2-25-to-3-5/` (one page per migration phase).
- Author doctrine: read `Docs/field-manual-conventions.md` before
  writing manual pages. Six conventions: outcome first; prerequisites stated;
  every command followed by a verify step with literal expected output;
  verification; rollback; known issues documented where the reader hits them.
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

## Do not touch without re-diffing

Files under `layouts/` and `assets/js/` marked as pinned oink v1.4.0 copies
(`layouts/docs/baseof.html`, `layouts/_partials/shell/sidebar-tree.html`,
`layouts/_partials/pager-state.html`, `assets/js/action-registry.js`,
`assets/js/page-actions.js`, `layouts/_partials/actions/context.html`,
`layouts/_partials/actions/title-menu.html`) each carry a provenance comment
naming its one deliberate change. Any edit beyond that change requires
re-diffing against `~/go/pkg/mod/github.com/pgsty/oink@v1.4.0/`.
Sanctioned extension points (free to edit): `td-variant-selector.html`,
`hooks/head-end.html`, `hooks/body-end.html`, the customize shortcodes,
`static/js/`, `static/css/`, `hugo.yaml`, `data/home.yaml`, `content/`.

## Verification for JS changes

Interactive behavior lives in `static/js/` and `assets/js/`. If you change it,
verify the rendered page actually works (dev server + browser), not just that
the build passes.

## omp agent (CI)

The repo runs an [omp](https://omp.sh)-based coding agent via
`.github/workflows/omp.yml`. Comment `/omp <request>` on any issue or PR
review thread to invoke it; it reads this file and README.md, and opens a
draft PR from a branch `omp/issue-<n>` for any change. Configuration is three
repo-level settings — `AGENT_BASE_URL` (variable), `AGENT_MODEL` (variable),
`AGENT_API_KEY` (secret) — never in files. The publication gate above applies
to the agent exactly as it applies to you.
