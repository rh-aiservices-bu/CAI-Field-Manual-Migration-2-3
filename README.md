Rendered site: https://rh-aiservices-bu.github.io/CAI-Field-Manual-prototype/

# CAI Field Manual

The CAI Field Manual is a working example of what future field manuals should
look like: chronological field-work notes — set up → operate → things that
broke — where every command is followed by a verify step with literal expected
output, and known issues are documented where the reader hits them. It
emulates the [RHOAI MaaS guide](https://rh-aiservices-bu.github.io/rhoai-maas-guide/modules/main/index.html)'s
approach with deliberate divergences; the rationale lives in
[Why this approach](https://rh-aiservices-bu.github.io/CAI-Field-Manual-prototype/why-this-approach/).

Built with [Hugo](https://gohugo.io/) and the [OINK](https://oink.pgsty.com/)
theme (`github.com/pgsty/oink`).

## How to consume it

Start at [Field Manual](https://rh-aiservices-bu.github.io/CAI-Field-Manual-prototype/field-manual/) —
the first manual is the [Hello World Field Manual](https://rh-aiservices-bu.github.io/CAI-Field-Manual-prototype/field-manual/hello-world/).

**Humans** — read the rendered HTML:

- The selector at the top of every manual (RHAIE version: 3.4 / 3.5 / 3.6;
  ops mode: GitOps / Manual / Scripted — each with *Show all*) filters
  content; the selected pill is clearly highlighted, and a status line
  beneath the pills restates the current view as a sentence, e.g. *Showing
  RHAIE 3.6, GitOps steps — reading as guest on
  api.ocp.abcd.sandbox1234.opentlc.com*; the choice persists in
  `localStorage` across pages, visits, and tabs.
- The **Customize this!** page (bottom of the manual nav) sets every choice
  in one place: RHAIE version, ops mode, your name (default `guest`), and
  your cluster (default `.ocp.abcd.sandbox1234.opentlc.com`). The name and
  cluster substitute into every `customize` token across the manuals.
- Search with `/` or the navbar search box (`offline_search`).
- Each section also renders a print bundle for offline/print reading.

**AI agents** — consume the markdown:

- Per-page markdown via the page action menu: *Copy markdown*, *View
  markdown*, *Open in Claude / Gemini / ChatGPT*.
- **Command palette** (the navbar search box or `/`): type `agent` and
  choose **"Feed it to my AI Agent"** — it opens a copy-ready prompt for
  Claude Code or Codex: the agent clones the repo, reads the README and
  the code, reports what the manual can do, and asks what to do next.
- Whole site as [`llms.txt`](https://rh-aiservices-bu.github.io/CAI-Field-Manual-prototype/llms.txt).
- The markdown, `llms.txt`, and print outputs carry every display option
  labeled (`Axis: Option`) and every customize token as its shipped
  default — only the interactive HTML filters content or substitutes
  values, so agents always see all variants with concrete values.

## Report issues, propose changes

- **Issues** — file a [GitHub Issue](https://github.com/rh-aiservices-bu/CAI-Field-Manual-prototype/issues)
  with the page URL (or the `content/` path) and what you hit.
  *(Labels and triage conventions TBD for now.)*
- **Changes** — PRs to `main` are welcome. Content lives in
  `content/field-manual/<manual>/`; start a new manual by duplicating the blank
  skeleton in `content/field-manual/hello-world/`. Run the publication gate
  (below) before opening a PR. Merges to `main` deploy automatically via
  GitHub Actions; repo Settings → Pages → Source must be **GitHub Actions**
  (one-time admin step).

Where things live:

- `hugo.yaml` — site config: display-option (variant) axes — an ordered
  slice with per-axis `neutral` (show-all) and `default`, plus optional
  `status.specific` / `status.neutral` phrases for the selector's status
  line (`{value}` = the option label) — customize fields (user, cluster),
  `docs_section: field-manual` (drives the llms.txt Documentation index and
  the docs-sidebar fallback), `docs_sidebar_root: home` (left nav roots at
  the whole site tree), GA4 placeholder
- `data/home.yaml` — landing page sections (hero, cards, cta)
- `content/_index.md` — home page front matter
- `content/field-manual/` — the manuals; `hello-world/` doubles as the blank
  skeleton to duplicate
- `content/why-this-approach.md` — design rationale (what the prototype
  copies from the MaaS guide, changes, and why)
- `content/writing-the-field-manual/` — the author doctrine section (how
  to write a manual: the six conventions, annotated examples, and the
  walkthrough for a first manual)
- `layouts/_partials/google_analytics.html` — GA4 partial (the theme's
  head.html calls it in production)
- `layouts/docs/baseof.html`, `layouts/_partials/shell/sidebar-tree.html`,
  `layouts/_partials/pager-state.html` — pinned copies of the oink v1.4.0
  files, each headed by a provenance comment naming its one deliberate change
  (page-top selector call; Home promoted to the tree's top level with a
  small-screen Home row; pager rooted at the page's own section instead of
  the site root). Re-diff all three against
  `~/go/pkg/mod/github.com/pgsty/oink@v<ver>/` on a theme bump.
- `layouts/_partials/td-variant-selector.html` +
  `layouts/_partials/hooks/head-end.html` — the page-top selector and the
  pre-paint persistence runtime (config blob, filter CSS). The theme ships
  both hooks empty, so these are sanctioned extension points, not copies.
- `layouts/_shortcodes/customize.html` +
  `layouts/_shortcodes/customize-form.html` — token substitution points
  and the Customize form
- `static/js/agent-setup.js` + `static/css/agent-setup.css` (wired through
  the `body-end`/`head-end` hooks) — the *Feed it to my AI Agent*
  copy-prompt modal. The row is registered with the assistant page actions
  in `layouts/_partials/actions/context.html` (`url: "#agent-prompt"`), so
  it appears directly under Gemini in both the page action menu and the
  palette. The JS intercepts that fragment hash, opens the modal, and clears
  the hash so the action can fire again. The repo name reaches the JS via the
  `__TD_AGENT_SETUP__` blob the same way the chat page gets `llmsFull`.
- `.github/workflows/github-pages.yaml` — deploy workflow

The project root stays minimal: the theme module supplies the navbar logo and
favicon, and build outputs (`public/`, `resources/`) are gitignored and
regenerate.

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

```sh
git clone https://github.com/rh-aiservices-bu/CAI-Field-Manual-prototype.git
cd CAI-Field-Manual-prototype
hugo server
```

With a path in `baseURL`
(`https://rh-aiservices-bu.github.io/CAI-Field-Manual-prototype/`), the dev
server serves at `http://localhost:1313/CAI-Field-Manual-prototype/` — a 404
at the root is expected, not a broken build.

### Publication gate

```sh
hugo --cleanDestinationDir --gc --minify --environment production \
  --printPathWarnings
```

Note: `--panicOnWarning` is intentionally omitted — the pinned theme version
(v1.4.0) still transpiles SCSS with Hugo's deprecated LibSass, which emits a
WARNING on Hugo ≥ 0.153 and would abort the build. Gate on the remaining
warning surface instead: assert the build emits no WARN lines other than the
known libsass one.

```sh
hugo --cleanDestinationDir --gc --minify --environment production \
  --printPathWarnings 2>&1 | grep -i warn | grep -v "css.Sass: libsass"
```

No output = clean. Revisit when the theme moves to the Dart Sass transpiler.
