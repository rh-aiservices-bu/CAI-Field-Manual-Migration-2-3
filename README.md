Rendered site: https://rh-aiservices-bu.github.io/CAI-Field-Manual-Migration-2-3/

# CAI Field Manual

A field manual for migrating Red Hat OpenShift AI 2.25.10+ in place to 3.5,
ordered by when you do the work. Every command is followed by a verify step
with literal expected output, and known issues are documented where the
reader hits them. The author conventions are in
[`Docs/field-manual-conventions.md`](Docs/field-manual-conventions.md).

This repo owns **content only**. Look-and-feel, layout overrides, and build
rules come from the
[`CAI-Field-Manual-Shell`](https://github.com/rh-aiservices-bu/CAI-Field-Manual-Shell)
Hugo module (imported via `hugo.yaml` → `module.imports`).

Built with [Hugo](https://gohugo.io/) and the [OINK](https://oink.pgsty.com/)
theme (`github.com/pgsty/oink`, transitively via the Shell module).

## How to consume it

Start at the [RHOAI 2.25 → 3.5 migration](https://rh-aiservices-bu.github.io/CAI-Field-Manual-Migration-2-3/rhoai-2-25-to-3-5/)
  (`content/rhoai-2-25-to-3-5/`) — the in-place OpenShift AI
  2.25.10+ → 3.5 migration, one page per phase (pre-flight → baseline →
  assess → convert model serving → remediate → workbench images → upgrade →
  post-upgrade → re-test → clean up) and a *Things that broke* symptom index.

**Humans** — read the rendered HTML:

- The selector at the top of every page (*Deployment type*: GitOps-managed
  / Not GitOps-managed; *Cluster network*: Connected /
  Disconnected (air-gapped); *Kueue end state*: Removed / Unmanaged (external
  RHBOK) — each with *Show all*) filters content; a status line beneath the
  pills restates the current view as a sentence, e.g. *Showing GitOps-managed
  steps, connected and disconnected clusters, Kueue Removed*; the choice persists in
  `localStorage` across pages, visits, and tabs.
- Commands use plain placeholders (`<cluster-domain>`, `<token>`,
  `<namespace>`) and the literal migration namespace `rhai-migration`.
- Search with `/` or the navbar search box (`offline_search`).
- Each section also renders a print bundle for offline/print reading.

**AI agents** — consume the markdown:

- Per-page markdown via the page action menu: *Copy markdown*, *View
  markdown*, *Open in Claude / ChatGPT*, *Open Gemini*.
- **Command palette** (the navbar search box or `/`): type `agent` and
  choose **"Feed it to my AI Agent"** — it opens a copy-ready prompt for
  Claude Code or Codex: the agent clones the repo, reads the README and
  the code, reports what the manual can do, and asks what to do next.
- Whole site as [`llms.txt`](https://rh-aiservices-bu.github.io/CAI-Field-Manual-Migration-2-3/llms.txt).
- The markdown, `llms.txt`, and print outputs carry every display option
  labeled (`Axis: Option`) — only the interactive HTML filters content, so
  agents always see all variants.

## Report issues, propose changes

- **Issues** — file a [GitHub Issue](https://github.com/rh-aiservices-bu/CAI-Field-Manual-Migration-2-3/issues)
  with the page URL (or the `content/` path) and what you hit.
  *(Labels and triage conventions TBD for now.)*
- **Changes** — PRs to `main` are welcome. Content lives in
  `content/rhoai-2-25-to-3-5/`. Run the publication gate
  (below) before opening a PR. Merges to `main` deploy automatically via
  GitHub Actions; repo Settings → Pages → Source must be **GitHub Actions**
  (one-time admin step). Propose shell/chrome changes in
  `CAI-Field-Manual-Shell` — not here.

Where things live:

- `hugo.yaml` — site config: display-option (variant) axes — an ordered
  slice with per-axis `neutral` (show-all) and `default`, plus optional
  `status.specific` / `status.neutral` phrases for the selector's status
  line (`{value}` = the option label) — no customize fields (the
  customize shortcodes remain but are unused),
  `docs_section: rhoai-2-25-to-3-5` (drives the llms.txt Documentation index and
  the docs-sidebar fallback), `docs_sidebar_root: home` (left nav roots at
  the whole site tree). Chrome defaults (`logo`, `offline_search`, `copyright`,
  `footer_center_info`, `ui` incl. `docs_section`/`docs_sidebar_root`) live in the
  Shell module's `hugo.yaml` and are deep-merged; site values win on conflict.
- `data/home.yaml` — landing page sections (hero, timeline, cards, faq, cta)
- `content/_index.md` — home page front matter
- `content/rhoai-2-25-to-3-5/` — the migration manual
- `Docs/field-manual-conventions.md` — the author doctrine (five active conventions; customize tokens retired in this repo)
- Layouts, assets, and static (chrome): live in the Shell module (`CAI-Field-Manual-Shell`),
  imported as a pinned Hugo module. See that repo's README for what it exports.

The project root stays minimal: the Shell module supplies the layouts and
chrome, the theme module (oink) supplies the navbar chrome, and build outputs
(`public/`, `resources/`) are gitignored and regenerate.

## Disclaimers

- **Orientation, not a support statement.** Commands and versions reflect
  what worked during field work when the manual was written; verify against
  the current official product documentation before relying on them.
- **Not official product documentation.** These are field notes from
  prototypes, maintained by project contributors.
- **Prototype.** Structure, pages, and URLs are under development and may
  change or move.

## Clone and render locally

Prerequisites:

- Hugo Extended ≥ 0.168 (`hugo version`)
- Go ≥ 1.27 — no Node.js needed (Hugo modules fetch the theme)
- Dart Sass on `PATH` — `layouts/_partials/head-css.html` sets `transpiler: dartsass`;
  Hugo Extended does **not** bundle Dart Sass
  ([oink comment `head-css.html:2-3`](https://github.com/pgsty/oink/blob/main/layouts/_partials/head-css.html#L2)).
  Install with `brew install sass/sass/sass`, `npm i -g sass`, or
  `snap install dart-sass`. Without it the build fails before the publication
  gate's WARN filter runs.

```sh
git clone https://github.com/rh-aiservices-bu/CAI-Field-Manual-Migration-2-3.git
cd CAI-Field-Manual-Migration-2-3
hugo server
```

With a path in `baseURL`
(`https://rh-aiservices-bu.github.io/CAI-Field-Manual-Migration-2-3/`), the dev
server serves at `http://localhost:1313/CAI-Field-Manual-Migration-2-3/` — a 404
at the root is expected, not a broken build. Builds use the Shell commit pinned in
`hugo.yaml` `module.imports[].version`, not Shell `main` — deliberate, commit-precise;
the `hugo.work` workspace replacement below overrides it only for testing unpushed Shell work.

To verify a Shell working-tree change locally (before it is pushed), add a
workspace replacement — create `hugo.work` in this repo root containing:

```
go 1.27.3

use .

replace github.com/rh-aiservices-bu/CAI-Field-Manual-Shell => ../CAI-Field-Manual-Shell
```

Then run with the workspace:

```sh
HUGO_MODULE_WORKSPACE=hugo.work hugo server
```

Verify with `hugo config` / `hugo mod graph` that the replacement is active.
`hugo.work` is gitignored — never commit it.

### Publication gate

One implementation, used locally and by CI (both the deploy build and PR
checks run it). Locally the raw build is enough:

```sh
hugo --cleanDestinationDir --gc --minify --environment production \
  --printPathWarnings 2>&1 | grep -i warn | grep -v "css.Sass: libsass"
```

In CI the gate runs via the Shell checkout:

```sh
shell/scripts/publication-gate.sh --baseURL "https://example.invalid/docs/"
```

The build must succeed and the only WARN allowed is the known oink libsass
deprecation; anything else fails with exit 1.

Optional contract check (needs sibling Shell clone + `public/` from the
production build):

```sh
sh ../CAI-Field-Manual-Shell/scripts/check-contracts.sh
```

Note: `--panicOnWarning` is intentionally not used. The pinned theme version
(v1.4.0) still transpiles SCSS with Hugo's deprecated LibSass, which emits a
WARNING on Hugo ≥ 0.153 and would abort the build. The gate asserts the build
emits no WARN lines other than the known libsass one. Revisit when the theme
moves to the Dart Sass transpiler.

### Updating the shell

Bump the shell pin to a newer commit on `main`:

```sh
# 1) pick the new hash (12-char short hash is enough for hugo.yaml)
git ls-remote https://github.com/rh-aiservices-bu/CAI-Field-Manual-Shell main | cut -c1-12
# 2) edit version: in hugo.yaml → module.imports[].version
# 3) reconcile Go lockfiles (the raw build does not need them)
go get github.com/rh-aiservices-bu/CAI-Field-Manual-Shell@<hash> && go mod tidy
# 4) re-run the gate
hugo --cleanDestinationDir --gc --minify --environment production \
  --printPathWarnings 2>&1 | grep -i warn | grep -v "css.Sass: libsass"
```

When a new pin contains fixes for the two kept `TODO(Shell)` overrides
(`layouts/_partials/actions/page-urls.html` and
`layouts/_partials/td-variant-selector.html`), delete those overrides and bump
the pin — see their headers for the re-diff note.

## One-time admin

- **GitHub Pages**: Settings → Pages → Source = **GitHub Actions**.
