# Plan: Align CAI-Field-Manual-Migration-2-3 with Hello-World (content repo) shape

> Goal: make **Migration-2-3** match the **Hello-World** architecture: a content-only Hugo site that imports all chrome from **Shell** (`CAI-Field-Manual-Shell`) as a Hugo module. No content may be lost. No behaviour may regress. The rendered site must be pixel-equivalent (modulo fingerprint-hashed asset URLs) and the publication gate must stay green.

Source of truth for the target architecture: `CAI-Field-Manual-Hello-World/README.md`, `CAI-Field-Manual-Hello-World/AGENTS.md`, `CAI-Field-Manual-Hello-World/hugo.yaml`, `CAI-Field-Manual-Shell/README.md`, `CAI-Field-Manual-Shell/AGENTS.md`, `CAI-Field-Manual-Shell/hugo.yaml`. Do not invent a new architecture.

---

## 0. How the three repos relate today

| Repo | Role | Has content? | Has chrome (`layouts/`, `assets/`, `static/` chrome)? | Module import |
|---|---|---|---|---|
| **Shell** | Hugo module, never deployed | No | Yes — all 8 pinned oink overrides + 4 shortcodes + 2 hooks + scss/icons/css/js + favicons + scripts | Imports `github.com/pgsty/oink v1.4.0` |
| **Hello-World** | Content site, deployed | Yes (`content/hello-world/`, `_index`, `data/home.yaml`, `archetypes/`) | **No** — zero `layouts/`, `assets/`, or content-serving `static/` | Imports **Shell** (pinned commit `4adf78646ad1`); indirectly oink |
| **Migration-2-3** | Content site, deployed, but **pre-split** | Yes (`content/rhoai-2-25-to-3-5/`, `content/chat/`, `content/_index.md`, `data/home.yaml`, `Docs/`) | **Yes** — full local copy of chrome (`layouts/` 14 files, `assets/` 4 files incl. duplicated logo+scss+js, `static/` favicons + static css/js duplicates) | Imports **oink directly** — no Shell |

Migration-2-3 is Hello-World's *previous generation*. The work is to make it Hello-World's *current generation*.

---

## 1. Success criteria (do not ship unless all hold)

1. **Build equivalence.** `hugo --cleanDestinationDir --gc --minify --environment production --printPathWarnings` succeeds; after filtering, no WARN remains except `css.Sass: libsass` (and once Dart Sass is mandatory, no WARN at all). Identical to Hello-World's gate.
2. **Page-count equivalence.** `public/` contains the same set of HTML pages as before the change (1 home + 1 manual section + 11 leaf bundles + chat draft excluded from prod). No 404s gain or loss. `public/rhoai-2-25-to-3-5/llms-full.txt` still emitted via front-matter `outputs: [HTML, RSS, print, markdown, LLMSFULL]`.
3. **Variant axes preserved verbatim.** `hugo.yaml` `params.variants` still declares the three migration-specific axes (`deploy: gitops/standard`, `env: connected/disconnected`, `kueue: removed/unmanaged`) with their `all` neutrals and status phrases. All existing `{{< variant … >}}` invocations in `content/rhoai-2-25-to-3-5/**` continue to pass the shortcode's build-time validation (no new `warnf`).
4. **Visual/interactive parity.** Variant selector at page top (3 axes, status sentence ends at axes — no dangling ` — reading as  on api` tail), numbered left-nav with CSS counters (`1.` = first phase; manual name in the selector row above the tree — verifying `sidebar_root_for: self` + `sidebar_root_menu: true`), preset/theme toggle, footer, offline search, page-action menu (incl. *Open Gemini* + *Feed it to my AI Agent*), landing `timeline` 3-child grid no longer scrunched (Shell fix active), chat mount, agent-setup modal — all behave identically when verified in a real browser against the built site.
5. **Asset delivery modernised.** `static/css/{chat,agent-setup}.css` and `static/js/{chat,agent-setup}.js` are no longer served as verbatim static files; they are served through Shell's `assets/` pipeline with `minify | fingerprint` and SRI in production — the same as Hello-World. No duplicate copies remain to drift. `_styles_project.scss` cover rule no longer needed (nav-shape handshake in §5.1.2) and Shell's timeline/image-outline fixes are active (they were shadowed before).
6. **Module pin is explicit.** `hugo.yaml` `module.imports[0].version` pins Shell to a concrete commit (today's head is fine even without `page-urls.html`/guard — kept overrides in §2.2 shadow the missing Shell files until a future bump fixes them); `go.mod`/`go.sum` agree; `hugo mod graph` shows `Shell@<pin> → oink v1.4.0`. Any kept overrides are listed in the PR description.
7. **Docs updated.** `README.md` and `AGENTS.md` describe the new split (content-owned vs Shell-owned) in the same language as Hello-World's docs, with the updated publication gate and `hugo.work` instructions.
8. **No content lost.** Every `content/rhoai-2-25-to-3-5/**` Markdown file is byte-identical before/after **except** the intentional front-matter addition of `sidebar_root_for: self` to `content/rhoai-2-25-to-3-5/_index.md` — enumerated here as the one approved exception (nav-shape handshake §5.1.2). `data/home.yaml` preserved. `content/chat/_index.md` draft tri-state preserved.

---

## 2. Ground truth: file-by-file inventory of Migration-2-3

### 2.1 Chrome that must leave the repo (moves to Shell)

> **Repo-scope boundary:** This plan modifies **only** `CAI-Field-Manual-Migration-2-3`. Shell and Hello-World are **read-only references** (compare via `read`/`git ls-remote`/`hugo mod graph`; no commits, branches, or PRs in those repos). Any gap where Shell is behind is handled as a **kept local override** in this repo with a `TODO(Shell): <issue link>` — not as a Shell edit.

These files **exist locally today** and **exist in Shell already** (identical or evolved). The content repo must stop shipping them:
| Local path | Shell counterpart | Disposition |
|---|---|---|
| `layouts/docs/baseof.html` | `layouts/docs/baseof.html` | **Delete** — byte-identical (`git diff` shows no delta except timestamps). |
| `layouts/_partials/shell/sidebar-tree.html` | `layouts/_partials/shell/sidebar-tree.html` | **Delete** — Shell version is a strict superset (adds `sidebar_root_for: self` cover handling, third deliberate change). |
| `layouts/_partials/pager-state.html` | `layouts/_partials/pager-state.html` | **Delete** — identical. |
| `layouts/_partials/td-variant-selector.html` | `layouts/_partials/td-variant-selector.html` | **Do NOT delete until Shell is patched** — Shell's current copy unconditionally renders ` — reading as <user> on api<cluster>` in `renderStatus()` with no `params.customize` guard. This repo has **no** `params.customize` (0 matches in `hugo.yaml`), and its local copy correctly guards with `if (!('user' in fields) \|\| !('cluster' in fields)) return;` so the status ends at the axis segments. Switching to Shell verbatim would produce `…Kueue Removed — reading as  on api` on every page. **Keep in Migration until a Shell commit with the guard exists** (see §2.2). Pinning a fixed Shell commit is what lets you delete — but the fix itself lands in a separate Shell change outside this plan. |
| `layouts/_partials/hooks/head-end.html` | `layouts/_partials/hooks/head-end.html` | **Delete** — Shell version upgrades CSS/JS delivery to `assets/` pipeline with SRI. Local still uses `static/` + bare `relLangURL`. |
| `layouts/_partials/hooks/body-end.html` | `layouts/_partials/hooks/body-end.html` | **Delete** — Shell version generalises `__TD_CHAT__.llmsFull` from hardcoded `"rhoai-2-25-to-3-5/llms-full.txt"` to `print site.Params.ui.docs_section` (makes a future rename safe) and switches to `assets/js/` pipeline with `with site.Params.github_repo` guard. |
| `layouts/_shortcodes/variant.html` | `layouts/_shortcodes/variant.html` | **Delete** — identical. |
| `layouts/_shortcodes/customize.html` | `layouts/_shortcodes/customize.html` | **Delete** — identical (unused in this site — keep deleting, do not resurrect). |
| `layouts/_shortcodes/customize-form.html` | `layouts/_shortcodes/customize-form.html` | **Delete** — identical. |
| `layouts/_shortcodes/feedback-demo.html` | `layouts/_shortcodes/feedback-demo.html` | **Delete** — identical. |
| `layouts/_partials/google_analytics.html` | `layouts/_partials/google_analytics.html` | **Delete** — identical. |
| `assets/scss/_styles_project.scss` | `assets/scss/_styles_project.scss` | **Do NOT blindly delete.** Local copy carries the single-manual cover rule (`& > ul.td-shell-tree__list { counter-reset: none }` + `& > ul > .td-shell-tree__item { counter-increment: none }`) that makes the `docs_sidebar_root: home` promoted tree render the manual overview as an **unnumbered cover** with children numbered 1–11. Shell's newer copy removed that rule (replaced with `:has(> .td-shell-tree__item--root)` guard for the explicit `data/docs_nav.json` tree) and added timeline 3-child grid + image-outline fixes. Because a project-level asset shadows the module's same path in `resources.Get`, keeping the local file would silently discard Shell's timeline/image fixes; deleting it while still on `docs_sidebar_root: home` would renumber the nav to `1.` = manual cover, `1.1` = Pre-flight, etc. **Do not edit Shell.** Resolve inside Migration: switch to the `sidebar_root_for: self` handshake (§3, §5.1.2) so the cover rule becomes unnecessary, then delete the local SCSS and inherit Shell's file. If the handshake is deferred, keep a minimal local SCSS overlay (import Shell's file and add only the cover rule) with a `TODO(Shell):` — still no Shell edit (the overlay lives in Migration). |
| `assets/icons/logo-rh-cai.svg` | `assets/icons/logo-rh-cai.svg` | **Delete** — identical. |
| `assets/js/action-registry.js` | `assets/js/action-registry.js` | **Delete** — pinned copy, no provenance header; Shell's copy is canonical. |
| `assets/js/page-actions.js` | `assets/js/page-actions.js` | **Delete** — same. |
| `static/js/chat.js` | `assets/js/chat.js` | **Delete static copy** — Shell now serves via pipeline (`assets/js/chat.js → resources.Get + minify + fingerprint`). |
| `static/js/agent-setup.js` | `assets/js/agent-setup.js` | **Delete static copy** — same. |
| `static/css/chat.css` | `assets/css/chat.css` | **Delete static copy** — same. |
| `static/css/agent-setup.css` | `assets/css/agent-setup.css` | **Delete static copy** — same. |
| `static/{favicon.ico,favicon.svg,favicon-16x16.png,favicon-32x32.png,apple-touch-icon.png}` | `static/{…}` | **Delete** — Shell already ships all five; Hello-World ships **none** in its own `static/`. The module mount makes them visible to Hugo; Shell's `layouts/_partials/favicons.html` emits the tags unconditionally (otherwise the module's `static/` would be missed). |

### 2.2 Chrome that exists locally but **does not** exist in Shell — keep as local overrides (no Shell edits)

Fixing these in Shell is out of scope for this plan. Until Shell catches up, Migration keeps minimal local overrides with a `TODO(Shell)`. The override shadows the module mount (Hugo: local `layouts/` wins), so the site stays correct while the plan still deletes everything else it can.

| Local path | Gap vs Shell | Disposition |
|---|---|---|
| `layouts/_partials/actions/page-urls.html` | Local-only fix for `createChild` on leaf bundles (`File.LogicalName == "index.md"` → parent the dir so "Create child" targets the section, not a page resource). Shell has no `page-urls.html` (only `actions/context.html`+`title-menu.html`) — deleting here regresses the action URL on 11 leaf-bundle pages. | **Keep in Migration** with provenance header + `TODO(Shell): File tracking issue to add this as a pinned oink override in Shell — leaf-bundle createChild fix (File.LogicalName == "index.md" parent-dir); re-diff on theme bump.` Do NOT delete until a pinned Shell commit that contains this file exists (future Shell bump, not this plan). |
| `layouts/_partials/td-variant-selector.html` | Shell's `renderStatus()` unconditionally appends ` — reading as <user> on api<cluster>`. Migration has **no** `params.customize` (0 matches in `hugo.yaml`); its local copy guards with `if (!('user' in fields) || !('cluster' in fields)) return;` so the status ends at the axis segments. Deleting now would render `…Kueue Removed — reading as  on api` on every page. | **Keep in Migration** with header + `TODO(Shell): Shell's selector needs a customize-tail guard — add if (!('user' in fields) || !('cluster' in fields)) return; immediately before el.appendChild(' — reading as ') in renderStatus() (~line 100). Hello-World has user+cluster so it still gets the tail.` Do NOT delete until a pinned Shell commit with the guard exists. |
| `assets/scss/_styles_project.scss` | Local SCSS carries the `docs_sidebar_root: home` cover rule (`counter-reset: none` on the promoted list). Shell removed it in favour of `:has(> .td-shell-tree__item--root)` for the explicit `data/docs_nav.json` tree. Handshake: prefer the `sidebar_root_for: self` Migration in §3/§5.1.2 — then this file can be deleted and Shell's timeline/image fixes inherited. | Delete only after that handshake (§5.1.2), which is a **Migration-only** change — no Shell edit. If handshake is deferred, keep a minimal local overlay (import Shell's SCSS + only the cover rule) with a `TODO(Shell)` — still no Shell commit. |
| `layouts/_partials/actions/context.html` | Pinned copy adding Gemini/agent rows. Shell **does** have a newer copy that subsumes it. | **Delete** — Shell's copy already covers this (gated on `params.github_repo`). |
| `layouts/_partials/actions/title-menu.html` | Same. | **Delete.** |

### 2.3 Chrome that exists in Shell but **not** locally — automatically gained after the switch

| Shell path (new capability) | Effect on Migration site |
|---|---|
| `layouts/_partials/favicons.html` | Favicons work again after deleting local `static/` (see 2.1). |
| `layouts/_partials/head-css.html` | Switches SCSS transpilation to `transpiler: dartsass` with `silenceDeprecations` (Dart Sass required on PATH). Build now **requires** `sass --version` to print Dart Sass, matching Hello-World's CI. Without it the build errors *before* WARN filtering — a deliberate stricter gate. |
| `assets/scss/td/_chroma.scss` + `assets/scss/td/chroma/_dark-wrapped.scss` | Required companion to `head-css.html`'s dartsass switch; hoists `@import` out of `@if`. |
| `assets/css/{chat,agent-setup}.css` + `assets/js/{chat,agent-setup}.js` as pipeline resources | Replaces the deleted `static/` duplicates; enables SRI. |
| `scripts/check-contracts.sh` + `scripts/publication-gate.sh` | New stricter gates that validate variant/customize/status-gate contracts against the built site. |

### 2.4 Files that **must stay** (content-owned)

```
content/_index.md
content/rhoai-2-25-to-3-5/_index.md          # LLMSFULL opt-in + approved nav-shape edit: adds sidebar_root_for: self (§5.1.2) — no no_list (see §3)
content/rhoai-2-25-to-3-5/*/index.md        # 10 phase pages + things-that-broke

content/chat/_index.md                      # draft:true stub, must keep tri-state comment
data/home.yaml                               # hero + timeline + cards + faq + cta
hugo.yaml                                    # site config — BUT trimmed to Hello-World shape (see §3)
go.mod / go.sum                               # BUT rewritten to import Shell
.github/workflows/github-pages.yaml          # BUT rewritten to Shell-aware shape
.github/workflows/omp.yml                    # keep (or align to Hello-World's if drifted)
.gitignore                                   # update
README.md / AGENTS.md                        # update
Docs/**                                      # keep (author doctrine, reviews, backlog)
archetypes/default.md                        # optionally ADD (Hello-World has it; not required)
```

---

## 3. What changes in `hugo.yaml`

Current Migration `hugo.yaml` is the *pre-split monolith*: it carries both site identity (`title`, `baseURL`, `languages`, `markup`, `services`, `outputs`, `menus`, `module`) **and** chrome defaults (`logo`, `offline_search`, `copyright`, `ui` incl. `docs_section`, `docs_sidebar_root`, `sidebar_root_menu`, `share`, etc.).

Target: split chrome defaults out via Hugo's deep-merge — exactly as Hello-World does.

**Principles:**

* `hugo.yaml` in the content repo is the **only** place that declares `title`, `baseURL`, `languages`, `markup`, `services`, `outputs`, `menus`, `params.{github_repo,github_branch,variants,customize}`.
* **Nav-shape alignment (preferred path).** This repo currently uses `params.ui.docs_sidebar_root: home` + a CSS-only cover hack in `_styles_project.scss` to show the manual's 10 phases numbered 1–11. Hello-World (and Shell's `AGENTS.md:46` nav-shape target) instead use a per-manual **self-root**: `content/<slug>/_index.md` carries `sidebar_root_for: self` (Hello-World: `content/hello-world/_index.md:6`), and the site sets `params.ui.sidebar_root_menu: true` (Hello-World `hugo.yaml:69`) so the manual name sits in the selector above the tree (`shell/root-menu.html`). Shell's `sidebar-tree.html` already implements cover promotion for both `IsHome` and `sidebar_root_for: self` (`§2.1`), so under that shape Shell's counter reset (`:has(> .td-shell-tree__item--root)`) does the right thing and no CSS cover rule is needed. **Do in Phase 3 when you touch `hugo.yaml` anyway:** add `sidebar_root_for: self` (+ `no_list: true` to match Hello-World) to `content/rhoai-2-25-to-3-5/_index.md`, and flip `params.ui.sidebar_root_menu: false → true` in `hugo.yaml`. Then the `_styles_project.scss` cover rule can be dropped safely (see §5.1.2). If the team wants to keep `docs_sidebar_root: home`, keep a minimal local SCSS overlay in Migration (import Shell SCSS + cover rule only) with a `TODO(Shell)` — no Shell edit.
* Chrome defaults (`params.logo`, `params.offline_search`, `params.copyright`, `params.footer_center_info`, `params.ui.*` incl. `docs_section`, `docs_sidebar_root`, `sidebar_root_menu`, `share`, `page_context_menu`, etc.) **move to Shell's `hugo.yaml`** and are deep-merged in. The content repo **may** override any of them by re-declaring the key (Hello-World overrides only `params.ui.sidebar_root_menu: true` + site identity; Migration must override `docs_section: rhoai-2-25-to-3-5` because Shell's default is `field-manual`).
* `params.variants` **stays** in the content repo — it is content-owned. There is no `params.variants` in Shell's `hugo.yaml` (intentionally, so `check-contracts.sh` can validate content against the site's own config at the repo root). Preserve the three migration axes verbatim.
* `params.customize` **stays unset** — this site intentionally has no customize tokens (content uses plain placeholders `<cluster-domain>` etc.). Do not add `params.customize`; keep the shortcodes present but inert (matching pre-work — they are unused but not removed). This is why the kept `td-variant-selector.html` override in §2.2 is correctness-critical: without the `TODO(Shell)` guard, this site would render the ` — reading as … on api…` tail with no values.
* Keep `outputs` **exactly as is today** — `home: [HTML,RSS,markdown,LLMS]`, `page: [HTML,markdown]`, `section: [HTML,RSS,print,markdown]`, plus the per-section LLMSFULL opt-in already in `content/rhoai-2-25-to-3-5/_index.md`. Do not adopt Hello-World's `outputs`-via-front-matter-only phrasing for the section until a deliberate follow-up; changing outputs mid-migration risks losing `llms-full.txt`.
**Concrete `hugo.yaml` edit spec:**

```yaml
# BEFORE (Migration, pre-split) — module imports oink directly
module:
  imports:
    - path: github.com/pgsty/oink

# AFTER — mirror Hello-World structure, pinning Shell
module:
  imports:
    - path: github.com/rh-aiservices-bu/CAI-Field-Manual-Shell
      # Pinned to Shell commit <NEW_SHELL_COMMIT> on main; bump by editing this hash.
      version: <NEW_SHELL_COMMIT_12_hex>
  hugoVersion:
    extended: true
    min: 0.168.0
* Compute `<NEW_SHELL_COMMIT_12_hex>` as the 12-char short hash of the current Shell `main` HEAD (`git ls-remote https://github.com/rh-aiservices-bu/CAI-Field-Manual-Shell main | cut -c1-12`). This plan pins today's Shell head — the two kept overrides in §2.2 shadow the missing Shell files until a future Shell bump contains them, at which point a follow-up bumps `version:` and removes the overrides (still only in Migration).
* **Nav-shape edit (same phase):** in `hugo.yaml` set `params.ui.sidebar_root_menu: true` (was `false`) and in `content/rhoai-2-25-to-3-5/_index.md` add `sidebar_root_for: self` to the front matter (matching Hello-World's `content/hello-world/_index.md:6`). Keep `params.ui.docs_sidebar_root: home` — under `sidebar_root_for: self` + `sidebar_root_menu: true` the `sidebar-tree.html` cover promotion makes the effective nav root the manual section itself (child pages render as the top level of the tree), so the `home` fallback is inert for day-to-day nav and does not need to change now.

  > **Why not `no_list: true`?** Hello-World carries `no_list` because its index body already duplicates the section index (7 hand-written markdown links → auto cards would double them). Migration's `rhoai-2-25-to-3-5/_index.md` ends in `{.cards}` (11 links) **and** already renders oink's auto `td-section-index--cards` grid (`public/…/index.html` `td-section-index--cards` + per-page icons/descriptions). Adding `no_list: true` would delete that grid — gated by `section-index.html:29` `if not (or $page.Params.no_list …)` — contradicting criteria 4/8. Keep only `sidebar_root_for: self`.

If the team later wants `AGENTS.md:46`'s two-level fold target (`sidebar_root_for: self` + `sidebar_root_enabled: true` — see Shell `config.html:33-35` / `sidebar-root.html:9-23`), that is a follow-up nav-shape PR, not this migration.
* Leave `logo`, `offline_search`, `copyright`, `footer_center_info`, `ui` **in place for now with a comment** explaining they are now defaults from Shell (deep-merged) and that local values win on conflict — identical to Hello-World's `hugo.yaml` comment: `# Chrome defaults (logo, offline_search, copyright, footer_center_info, ui incl. docs_section/docs_sidebar_root) live in the Shell module's hugo.yaml and are deep-merged; site values win on conflict.`
## 4. What changes in `go.mod` / `go.sum`

**Before:**

```
module github.com/pgsty/oink-starter
require github.com/pgsty/oink v1.4.0
```

**After (match Hello-World shape, with this repo's module path):**

```
module github.com/rh-aiservices-bu/CAI-Field-Manual-Migration-2-3

go 1.27.3

require (
	github.com/pgsty/oink v1.4.0 // indirect
	github.com/rh-aiservices-bu/CAI-Field-Manual-Shell v0.0.0-<timestamp>-<commit> // indirect
)
```

* Obtain the pseudo-version suffix by running `go get github.com/rh-aiservices-bu/CAI-Field-Manual-Shell@<12-char-hash>` (or the full hash) **after** editing `hugo.yaml`. Hugo resolves the pinned commit directly, so the build passes even before `go.mod`/`go.sum` are reconciled — but reconcile them before merging (do not use `hugo mod get` — it rewrites `go.mod`/`go.sum` to Shell `main` and dirties lockfiles).
* `go.sum` will then contain oink + one Shell pseudo-version line; keep prior Shell entries purged by `go mod tidy` equivalent or keep them — Hello-World's `go.sum` accumulates prior pins harmlessly. Either is fine; prefer tidy (`go mod tidy` is safe here after `go get`, unlike the `hugo mod tidy` warning in Hello-World's AGENTS.md which applies to the `hugo mod get` path).

---

## 5. What changes in `layouts/`, `assets/`, `static/`

### 5.1 Deletions — what leaves in this plan (two local overrides stay)

**This section deletes all §2.1 chrome in one atomic commit. §2.2 overrides stay behind in Migration (no Shell work) — see their `TODO(Shell)` rows for when they lift. The only gated deletion inside §5.1.2 is the SCSS cover rule: delete `assets/scss/_styles_project.scss` only together with the `sidebar_root_for: self` handshake (§3) so numbering stays correct; until then keep a minimal overlay in Migration.**

Then remove every file listed as **Delete** in §2.1 in one atomic commit (so bisect is meaningful). Specifically:

```
# layouts — delete everything except the two kept overrides in §2.2 (§5.1 re-creates them)
rm -rf layouts/
# Re-create kept overrides from git show HEAD:<path> with a TODO(Shell) header (see §2.2):
mkdir -p layouts/_partials/actions
# layouts/_partials/actions/page-urls.html — leaf-bundle createChild fix (kept until Shell has it)
# layouts/_partials/td-variant-selector.html — customize-tail guard (kept until Shell has it)

# (each file keeps its provenance header + TODO(Shell): <tracking issue>; remove when the pinned Shell commit contains it)

# assets chrome — delete, keep nothing (cover rule is now handled by self-root,
# Shell's SCSS is canonical)
rm -rf assets/

# static chrome — delete, keep nothing
rm -rf static/
# Note: deleting static/ removes the 5 favicons. Favicons are now served
# from Shell's static/ via module mount; Shell's favicons.html emits the tags.
```

After this step the working tree has **no** `assets/` or `static/` and **at most two** kept files under `layouts/` (the §2.2 overrides) — Hello-World has zero, but a kept override is an intentional deviation until Shell catches up. Each kept file must carry a `TODO(Shell): <tracking issue>` header (visible `git status`) and be listed explicitly in the phase PR description as a deviation.

> If the team prefers to keep an empty `layouts/` for ergonomics, do not — Hello-World's proof is that absence works, and stray empty directories mask mount failures.

#### 5.1.2 `_styles_project.scss` and the nav-shape handshake

History: this repo's `_styles_project.scss` carried `& > ul.td-shell-tree__list { counter-reset: none }` + `& > ul > .td-shell-tree__item { counter-increment: none }` so that with `params.ui.docs_sidebar_root: home` (whose `sidebar-tree.html` promotion renders the manual overview as an unnumbered cover) the children numbered `1.`–`11.` Shell's newer copy deleted that rule (replaced by `:has(> .td-shell-tree__item--root)` for the explicit `data/docs_nav.json` tree only) and added the landing `timeline` 3-child grid fix + `.td-content img` outline — all correctness. Because a project-level override at `assets/scss/_styles_project.scss` shadows the module file of the same name in `resources.Get`, keeping the local file would silently discard Shell's timeline/image fixes; deleting it while still on `docs_sidebar_root: home` would break the numbering (`1.` = cover, `1.1` = Pre-flight, `1.2` = Baseline, …). **That is why the nav-shape flip in §3 (`sidebar_root_for: self` + `sidebar_root_menu: true`) must land in the same commit that deletes `_styles_project.scss`:** under self-root, `sidebar-tree.html`'s `or IsHome (eq sidebar_root_for "self")` promotion makes the manual's children the top level of the tree (`ul--1`), so Shell's default counters produce `1.`–`11.` with no cover rule at all. Verify in browser: left nav reads `1. Pre-flight` … `11. Things that broke` (or the current count), no `0.N` or `1.`-cover. If verification fails, do not proceed — keep a minimal local SCSS overlay in Migration (import Shell SCSS + cover rule) with a `TODO(Shell)` and re-verify before dropping the local file.


### 5.2 What replaces them

Nothing to create locally. After this plan's deletions, `hugo build` / `hugo server` resolves `layouts/`, `assets/`, `static/` via the Hugo module mount (Hugo merges the Shell module — verify with `hugo config` `module.imports` and `hugo mod graph`). The two kept overrides in §2.2 shadow Shell where it is still behind (local `layouts/` wins over the mount), so the site stays correct until a future Shell bump removes them. At that point `hugo.mod` is the only integration point that changes: brings in Shell's `layouts/`, `assets/`, `static/` automatically (verified via `hugo config` `module.imports` and `hugo mod graph`).

---

## 6. What changes in `.github/workflows/github-pages.yaml`

Current `github-pages.yaml` is the **pre-split** deploy: it runs `go mod download github.com/pgsty/oink` and `hugo --printPathWarnings --baseURL …` directly.

Target: Hello-World's **shell-aware** workflow — two jobs (`build` for pushes, `pr-gate` for PRs), Shell checkout at `shell/`, Dart Sass install, and `shell/scripts/publication-gate.sh` as the single gate.

**Required edits:**

1. **Triggers:** add `pull_request:` and `schedule: cron: "30 5 * * *"` (daily re-verify). Hello-World has them; Migration currently has only `push` + `workflow_dispatch`. Use Hello-World's `on:` block verbatim.
2. **Env pin:** add `GOWORK: off`, `HUGO_MODULE_WORKSPACE: off`, `HUGO_CACHEDIR: ${{ github.workspace }}/.hugo_cache` (Hello-World has them; Migration already has the first two — keep).
3. **Shell checkout step:** add after the source checkout in **both** jobs:
   ```yaml
   - name: Check out shell module (layouts/assets/scripts)
     uses: actions/checkout@v7
     with:
       repository: rh-aiservices-bu/CAI-Field-Manual-Shell
       ref: main
       path: shell
   ```
   `ref: main` is correct even though `hugo.yaml` pins a commit — CI needs the *scripts* at HEAD (they are backwards-compatible); the Hugo build itself still respects the `version:` pin for layout/asset resolution.
4. **Configure Pages enablement:** add `with: enablement: true` to `actions/configure-pages@v6` (Hello-World has it; Migration omits it — harmless, but align).
5. **Dart Sass install:** add before tool-version recording in both jobs:
   ```yaml
   - name: Install Dart Sass
     run: npm install -g sass
   ```
   This satisfies `Shell/layouts/_partials/head-css.html`'s `transpiler: dartsass` (requires `sass` on PATH). Without it the build errors before WARN filtering — Hello-World CI already does this. Do not skip.
6. **Publication gate step:** replace the raw `hugo --printPathWarnings --baseURL …` command with:
   ```yaml
   - name: Publication gate (build Pages artifact)
     run: shell/scripts/publication-gate.sh --baseURL "${{ steps.pages.outputs.base_url }}/"
   ```
   In the `pr-gate` job the gate runs as `shell/scripts/publication-gate.sh` (no `--baseURL` — it detects absence and uses the site's own baseURL).
7. **Job predicates:** add `if: github.event_name != 'pull_request'` to `build` and `if: github.event_name == 'pull_request'` to `pr-gate` (isolates PR vs deploy), matching Hello-World. Without this every PR would attempt a Pages deploy and require `pages: write` unnecessarily.
8. **Deploy job gating:** change `needs: build` to include `if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'` so scheduled/pR runs do not deploy.

Keep `omp.yml` unchanged unless it has drifted from Hello-World (it does not, currently). No `.github` for Shell (none expected).

---

## 7. What changes in `.gitignore`

**Before:**

```
/public/
/resources/
/.hugo_cache/
/.hugo_build.lock
.DS_Store
```

**After (match Hello-World):**

```
/public/
/resources/
/.hugo_cache/
/.hugo_build.lock
.DS_Store
/hugo.direct.sum
/_archive/
/hugo.work
/hugo.work.sum
```

* `hugo.direct.sum` — Hugo's secondary module checksum cache (Hello-World ignores it).
* `/_archive/` — support for stashing previous content before a reset without deleting git history (Hello-World's `_archive/README.md` documents it; Migration may use it later).
* `/hugo.work` + `/hugo.work.sum` — Go workspace overrides for testing unpushed Shell changes via `HUGO_MODULE_WORKSPACE=hugo.work`. Must be gitignored per both Shell and Hello-World docs.

---

## 8. What changes in `README.md` and `AGENTS.md`

### 8.1 `README.md`

Rewrite the "Where things live" section to match Hello-World's phrasing: chrome now lives in Shell, not locally. Preserve migration-specific truth (10 phases + things-that-broke, 3 variant axes, no customize tokens, `rhai-migration` namespace literal). Use Hello-World's README (§60-69 "Where things live" + clone/render section incl. `hugo.work` workspace instructions) as a template, but:

* Keep the migration hero (`OpenShift AI 2.25 → 3.5. Migrated in the right order.`) and CTA URL (`github.com/rh-aiservices-bu/CAI-Field-Manual-Migration-2-3/issues`).
* Keep `Docs/field-manual-conventions.md` reference.
* Remove the now-inaccurate local-chrome inventory (`layouts/docs/baseof.html`, `layouts/_partials/shell/sidebar-tree.html`, … pinned copies) — those are now Shell's concern; link to Shell's README for chrome details.
* Add the **Shell update** subsection: how to bump the pinned commit (`git ls-remote … main | cut -c1-12`, edit `version:` in `hugo.yaml`, `go get …@<hash>`, re-run gate), and the `hugo.work` workspace replacement for testing unpushed Shell work — copy Hello-World's wording verbatim except repo names.
* Update Prerequisites to mention **Dart Sass on PATH** (same as Shell's README).

### 8.2 `AGENTS.md`

Align to Hello-World's `AGENTS.md` structure:

* Restore the opening paragraph: `This repo is the <name> site — it owns all content (…) and imports CAI-Field-Manual-Shell as a Hugo module for look-and-feel and rules. Layouts, assets, static, and scripts live in the Shell repo — propose shell/chrome changes there, not here.`
* Keep the publication gate command, and add the CI equivalence note: `In CI the gate runs via shell/scripts/publication-gate.sh (see .github/workflows/github-pages.yaml); locally the raw pipeline above works without the sibling checkout.`
* Add the **Contract check** optional section (as Hello-World has), pointing at `sh ../CAI-Field-Manual-Shell/scripts/check-contracts.sh`.
* Rewrite **Content rules** to use the new path language: `Content lives in content/rhoai-2-25-to-3-5/ — one manual per repo, 11 leaf bundles (pre-flight … clean-up plus things-that-broke).` Keep the 6-convention doctrine pointer, the variant-block example (`{{< variant deploy gitops >}}`), the placeholder convention (`<cluster-domain>` etc. + `rhai-migration`), and the "never delete a variant block" rule.
* Rewrite **Do not touch without re-diffing** to delegate to Shell: `Chrome files live in the Shell repo. If you propose shell changes there, these files are pinned oink v1.4.0 copies …` and list the 6 core pinned files + 2 JS files. Remove the local pinned-copy list that will no longer exist in this repo.
* Remove the old "Sanctioned extension points (free to edit)" list that named local `td-variant-selector.html`, `hooks/head-end.html`, etc. — those now live in Shell; the local equivalents are "Layouts, assets, and static live in Shell (free to edit there: `td-variant-selector.html`, `hooks/…`, customize shortcodes, `static/js/`, …)" — see Hello-World's phrasing.
* Keep the **Verification for JS changes** paragraph but note that interactive behaviour now lives in `assets/js/` + `assets/css/` in the Shell module.
* Add the **Updating the shell** subsection (copy Hello-World's, with this repo's module path).

---

## 9. Execution phases for sub-agents

> Each phase is a self-contained PR-sized slice. Run them in order; later phases depend on earlier ones. No phase should perform build/lint mid-flight (AGENTS.md rule) — the assigned agent runs the gate once at the end of that phase and reports.

### Phase 0 — Baseline and shoring (solo owner, 30 min)

**Goal:** prove the current site is green and freeze a reference artefact so later deltas can be compared.

**Tasks:**

1. Run the current gate exactly as `AGENTS.md` specifies:
   ```sh
   hugo --cleanDestinationDir --gc --minify --environment production \
     --printPathWarnings 2>&1 | grep -i warn | grep -v "css.Sass: libsass"
   ```
   Assert empty. Save `public/` page inventory (`find public -name index.html | sort > /tmp/before-public.txt`). Save `hugo config` and `hugo mod graph` to `/tmp/before-config.txt`.
2. Audit Shell head for the two known gaps (read-only; no PRs in this plan):
   * **`page-urls.html` present?** `ls` (or `read`) `CAI-Field-Manual-Shell/layouts/_partials/actions/` — today it has only `context.html`+`title-menu.html`, so Migration's `page-urls.html` (`File.LogicalName == "index.md"` parent-dir fix) must be kept as a local override. Record "Shell lacks page-urls.html → keep".
   * **`td-variant-selector.html` has the customize-tail guard?** Grep Shell's `layouts/_partials/td-variant-selector.html:renderStatus()` for `if (!('user' in fields) || !('cluster' in fields)) return;` (or equivalent `if (!('user' in fields) || !('cluster' in fields))`). Migration has **no** `params.customize` (0 matches), so without that guard Shell would render `…Kueue Removed — reading as  on api`. Today Shell lacks it → record "Shell lacks customize-tail guard → keep".
   Both are handled in Migration by keeping the local file with `TODO(Shell): <tracking issue>` — no Shell change. If Shell fixes one in a future bump, this plan's pin can pick it up and the override can be removed in a follow-up commit that still lands only in Migration.
3. Choose the pin commit: `git ls-remote https://github.com/rh-aiservices-bu/CAI-Field-Manual-Shell main | cut -c1-12` (current Shell head is fine — the kept overrides shadow it for now). Record it as `<PIN>`. List the kept overrides (`page-urls.html`, `td-variant-selector.html`) explicitly in the plan PR description so reviewers can see the deviation.
**Acceptance:** publication gate empty; `/tmp/before-public.txt` saved; Shell gaps audited and recorded (no Shell PRs filed); `<PIN>` known and `hugo.mod graph` pin target identified.

---

### Phase 1 — Wire the module (foundation, blocks everything else)

**Owner:** one agent. Do not split.

**Inputs:** `hugo.yaml`, `go.mod`, `go.sum`, target `<PIN>` from Phase 0.

**Change:**

1. Edit `hugo.yaml` `module.imports`:
   ```yaml
   module:
     imports:
       - path: github.com/rh-aiservices-bu/CAI-Field-Manual-Shell
         # Pinned to Shell commit <PIN> on main; bump by editing this hash.
         version: <PIN>
     hugoVersion:
       extended: true
       min: 0.168.0
   ```
   Do not yet delete chrome — the site must remain buildable throughout. Hugo will now resolve layouts/assets via union mount: local files shadow the module, so existing behaviour is preserved while the module is available for validation.
2. Rewrite `go.mod` module path and requirements:
   ```
   module github.com/rh-aiservices-bu/CAI-Field-Manual-Migration-2-3
   go 1.27.3
   require (
   	github.com/pgsty/oink v1.4.0 // indirect
   	github.com/rh-aiservices-bu/CAI-Field-Manual-Shell v0.0.0-<ts>-<PIN> // indirect
   )
   ```
3. Reconcile lockfiles:
   ```sh
   go get github.com/rh-aiservices-bu/CAI-Field-Manual-Shell@<PIN>
   go mod tidy
   ```
   (Verify `go.sum` contains exactly one Shell pseudo-version for `<PIN>` plus oink; tolerate accumulated older pins but prefer tidy.)

**Verification (once at end of phase):**

```sh
hugo mod graph
# expect:
# github.com/rh-aiservices-bu/CAI-Field-Manual-Migration-2-3 github.com/rh-aiservices-bu/CAI-Field-Manual-Shell@v0.0.0-...-<PIN>
# github.com/rh-aiservices-bu/CAI-Field-Manual-Shell@... github.com/pgsty/oink@v1.4.0

hugo config 2>&1 | head -n 80
# verify baseURL still https://rh-aiservices-bu.github.io/CAI-Field-Manual-Migration-2-3/
hugo --cleanDestinationDir --gc --minify --environment production --printPathWarnings 2>&1 | grep -i warn | grep -v "css.Sass: libsass"
# still empty (local chrome still shadows, so gate must still pass)
```

**Acceptance:** `hugo mod graph` shows pinned Shell → oink. Gate still empty. No content touched.

---

### Phase 2 — Remove co-located chrome + nav-shape handshake (the cutover)

**Owner:** one agent. This is the high-risk phase — coordinate on a branch. Includes the nav-shape switch that pairs with the stylesheet deletion (§5.1.2); do not split them into separate PRs.

**Inputs:** Phase 1's `hugo.yaml` pin. Shell's `page-urls.html`/guard are intentionally **not** required — this plan keeps local overrides for them (Phase 0's audit).

**Change:**

1. **Nav-shape flip (paired with stylesheet deletion).** In `hugo.yaml` set `params.ui.sidebar_root_menu: false → true`; in `content/rhoai-2-25-to-3-5/_index.md` front matter add `sidebar_root_for: self` (matching Hello-World `content/hello-world/_index.md:6`). Keep `params.ui.docs_sidebar_root: home` — it is inert once `sidebar_root_for: self` promotion in `sidebar-tree.html` takes over (`or IsHome (eq sidebar_root_for "self")` → children at `ul--1`). This is the only change in the plan that touches `content/` outside `hugo.yaml`; it is required so the SCSS cover rule in the next step can be dropped without renumbering the tree.

2. Delete local chrome, exactly as enumerated in §5.1 (now `§5.1` + §5.1.2):
   ```sh
   rm -rf layouts assets static
   ```
   **Kept overrides (no PR needed — they shadow Shell):** re-create the two §2.2 files from `git show HEAD:<path>` with provenance + `TODO(Shell): <tracking issue>` headers. They make the site correct while the pinned Shell is still missing them; a future Shell bump removes them.

3. Update `params.ui.docs_section` if you had previously removed it while trimming `hugo.yaml` — it **must** remain `rhoai-2-25-to-3-5` (Shell's default is `field-manual`). If the key was deleted, re-add it under `params.ui`. This keeps `body-end.html`'s `print .Site.Params.ui.docs_section "/llms-full.txt" | relLangURL` resolving correctly once Shell's `body-end.html` is active.
4. Ensure `hugo.yaml` still contains no `params.customize` (good — no tokens). Verify `data/home.yaml` CTA URL still points at `Migration-2-3/issues`.
5. Install Dart Sass locally and verify:
   ```sh
   sass --version  # must print Dart Sass
   ```
   `head-css.html` now requires it (it always did in Shell, but migration never needed it because it had no `head-css.html`; after deletion, the mount pulls `head-css.html` in and the build will fail without Dart Sass). The CI change in Phase 3 will install it in GitHub Actions, but the local dev must also have it from now on.

**Verification (once):**

```sh
sass --version

hugo --cleanDestinationDir --gc --minify --environment production \
  --printPathWarnings 2>&1 | grep -i warn | grep -v "css.Sass: libsass"
# must be empty — strictest check; dartsass warnings are silent, libsass warning gone

# Also run Shell's gate via local checkout (optional if sibling exists):
# sh ../CAI-Field-Manual-Shell/scripts/publication-gate.sh --baseURL "https://example.invalid/CAI-Field-Manual-Migration-2-3/"

find public -name index.html | sort > /tmp/after-public.txt
diff -u /tmp/before-public.txt /tmp/after-public.txt
# must be empty (same set of pages)

# Spot-check critical outputs still emitted:
test -f public/rhoai-2-25-to-3-5/llms-full.txt
test -f public/index.html
test -f public/llms.txt
# Spot-check that variant labels still render in markdown outputs:
grep -c "^\*\*[A-Za-z].*: " public/rhoai-2-25-to-3-5/pre-flight/index.md
# should be >= 1 (every leaf bundle containing a variant block emits a label line)
```

**Acceptance:** gate empty, page set unchanged, llms-full.txt present, at least one variant label per variant-bearing page. Browser spot-check of the dev server: `hugo server` → open `http://localhost:1313/CAI-Field-Manual-Migration-2-3/` → landing hero + timeline + cards render (and timeline's `icon+date` 3-child grid no longer "scrunched left" — Shell fix now active); open a leaf page → variant selector has 3 axes, status sentence ends at the axes (e.g. `Showing GitOps-managed steps, connected cluster, Kueue Removed`) with **no** dangling ` — reading as  on api` tail, CSS counters number the left nav starting `1.` = first phase (not the manual cover), the manual name appears in the selector row above the tree (`td-shell-root--static` — verifying `sidebar_root_for: self` + `sidebar_root_menu: true`), search works.

---

### Phase 3 — CI: switch to Shell-aware publication gate

**Owner:** one agent; depends on Phase 2's `hugo.yaml` pin (needs `shell/` checkout path to exist).

**Inputs:** `.github/workflows/github-pages.yaml` (current), Hello-World's `.github/workflows/github-pages.yaml` as template.

**Change:** apply §6 edits verbatim:

* Add `pull_request:` + `schedule: daily 05:30 UTC` triggers.
* Add `GOWORK/HUGO_MODULE_WORKSPACE/HUGO_CACHEDIR` env if missing.
* Add `Check out shell module` step in both `build` and `pr-gate` jobs.
* Add `Install Dart Sass` step in both jobs.
* Add `with: enablement: true` to `configure-pages`.
* Replace raw Hugo build + artifact upload with `shell/scripts/publication-gate.sh` invocation.
* Split jobs with `if:` predicates and gate `deploy` on `push || workflow_dispatch`.

Reference the exact YAML from `CAI-Field-Manual-Hello-World/.github/workflows/github-pages.yaml` (140 lines) — copy its structure, substituting repo-specific strings (`CAI-Field-Manual-Migration-2-3`, baseURL path if needed — but the gate now handles `--baseURL` forwarding so the hard-coded build line is gone).

**Do not** edit `omp.yml` in this phase unless it is blocking (it is not).

**Verification (once):**

```sh
# Validate YAML parses
python3 -c "import yaml, pathlib; yaml.safe_load(open('.github/workflows/github-pages.yaml'))" && echo "yaml ok"
# Dry-run the gate locally as CI will (without --baseURL override):
sh shell/scripts/publication-gate.sh 2>&1 | tail -20
# must end with "publication gate OK"
```

**Acceptance:** workflow file matches Hello-World's shape (two-job build/pr-gate, shell checkout, dart sass, gate script). `yaml ok` and `publication gate OK`.

---

### Phase 4 — Docs and housekeeping

**Owner:** one agent; can run in parallel with Phase 3 after Phase 2.

**Inputs:** `README.md`, `AGENTS.md`, `.gitignore`, `hugo.yaml`, Hello-World's `README.md`/`AGENTS.md` as templates.

**Changes:**

1. **`.gitignore`** — add the 4 Hello-World entries (§7). Keep it sorted: `/public/`, `/resources/`, `/.hugo_cache/`, `/.hugo_build.lock`, `.DS_Store`, then `/hugo.direct.sum`, `/_archive/`, `/hugo.work`, `/hugo.work.sum`.

2. **`README.md`** — apply §8.1. Specifically:
   * Keep hero + disclaimers + clone/local section.
   * Add Dart Sass prerequisite (copy Shell's prerequisite phrasing).
   * Add `hugo.work` workspace block (copy Hello-World's verbatim, substituting repo path if mentioned).
   * Rewrite "Where things live" to the Shell-delegated phrasing.
   * Add "Updating the shell" subsection (pin comment + `go get` + gate re-run).
   * Update Publication gate section to document both local raw gate and CI gate via `shell/scripts/publication-gate.sh`.

3. **`AGENTS.md`** — apply §8.2.
   * Replace the old 6-file pinned-copy warning with the Shell-delegated one.
   * Add the content-owned vs Shell-owned split paragraph at top.
   * Add the contract-check section.
   * Update publication gate + shell-update instructions.

4. **Optional: `archetypes/default.md`** — add the 6-line Hello-World scaffold (`title`, `description`, `weight`, `icon`) if the team wants parity. This is low-risk; leave it out if there is any disagreement — it is not load-bearing.

**Verification:** `hugo --printPathWarnings` gate already proven in Phase 2; docs change cannot break it. Visual check: open `README.md` and `AGENTS.md` on GitHub preview; links resolve, code fences render.

**Acceptance:** `.gitignore` matches Hello-World (modulo repo-specific entries like `/_archive/` if the team prefers it absent). README + AGENTS read as migration-specific copies of Hello-World's docs, with no stale reference to local `layouts/`/`assets/` chrome.

---

### Phase 5 — Final validation (integration owner, after all phases)

**Owner:** one person; owns the final green.

**Steps:**

1. From a **clean clone** (no `hugo.work`, no `.hugo_cache`), run the full gate:
   ```sh
   npm install -g sass   # if not present
   sass --version
   hugo mod download
   hugo mod graph
   hugo --cleanDestinationDir --gc --minify --environment production --printPathWarnings 2>&1 | grep -i warn | grep -v "css.Sass: libsass"
   # expect empty
   ```
2. Run the contract guard (requires sibling Shell + `public/`):
   ```sh
   sh ../CAI-Field-Manual-Shell/scripts/check-contracts.sh
   # expect: contracts OK — 12 pages, N variant labels, 0 customize tokens
   # (N = total variant blocks in content/rhoai-2-25-to-3-5/**)
   ```
3. **Browser proof:** `hugo server` → verify landing (hero, timeline with icon+date layout fix, cards, FAQ), open `rhoai-2-25-to-3-5/pre-flight/` → variant selector has 3 axes, switching filters blocks correctly, status sentence updates, numbered nav `1.`/`1.1` renders, page-action menu contains *Copy markdown* / *View markdown* / *Open in Claude / ChatGPT / Gemini* / *Feed it to my AI Agent* / *View edit history*, search (`/`) works.
4. **Diff `public/before → after`:** confirm `public/**/index.html` set unchanged, `llms-full.txt` and `llms.txt` present, per-page markdown still carries `**Label: Option**` lines.

**Acceptance:** gate empty, contracts OK, browser parity, page-set diff empty, llms-full present. Merge.

---

## 10. Non-goals (explicitly out of scope)

* **Do not** add a second manual (`content/hello-world/`) — Migration owns exactly one manual (`content/rhoai-2-25-to-3-5/`). Multi-manual nav is a future concern.
* **Do not** introduce `params.customize` tokens — migration content intentionally uses plain placeholders; adding tokens would require retouching every code fence and is a separate proposal.
* **Do not** collapse the 3 variant axes into Shell's axes — axes are content-owned and must remain `deploy/env/kueue`.
* **Do not** change `outputs` shape (`section: [HTML,RSS,print,markdown]` etc.) or remove `outputs: [..., LLMSFULL]` from `content/rhoai-2-25-to-3-5/_index.md` — the chat assistant depends on `llms-full.txt`.
* **Do not** delete `Docs/` or `content/chat/_index.md` — keep them until the chat feature is re-enabled (mirrors Hello-World's hidden-chapter pattern).
* **Do not** edit Shell's `hugo.yaml` in this plan — chrome defaults already live there; only the content repo changes.

---

## 11. Risks and mitigations

| Build fails with `transpiler: dartsass: binary not found` after chrome deletion | **Certain** (Phase 2) | Already in plan: Phase 2 verification requires `sass --version` before declaring done; Phase 3 CI installs it; README documents it. |
| `createChild` page action links break for leaf bundles (missing `page-urls.html`) | **Certain if deleted** | Mitigated: §2.2 keeps `page-urls.html` locally in Migration with `TODO(Shell)` — no Shell change needed for this plan. Verify `createChild` URLs after cutover. |
| Status sentence shows dangling ` — reading as  on api` | **Certain if selector swapped without guard** | Mitigated: §2.2 keeps `td-variant-selector.html` locally with `if (!('user' in fields) …` guard — no Shell change. Phase 2 acceptance checks for no dangling tail. |
| Left nav renumbers to `1.` = manual cover (or shows duplicate `td-shell-tree__item--root` row) | **Certain if SCSS deleted without nav-shape handshake** | `assets/scss/_styles_project.scss` carried the `home`-cover `counter-reset: none` hack. Shell's copy removed it. The nav-shape flip (§3: `sidebar_root_for: self` + `sidebar_root_menu: true`) makes Shell's `sidebar-tree.html` cover promotion (`IsHome or sidebar_root_for:self → ul--1`) do the right thing without any cover rule — see §5.1.2. Phase 2 acceptance verifies `1.` = first phase in browser. Fallback: keep a minimal local SCSS overlay in Migration (import Shell SCSS + cover rule) with a `TODO(Shell)`. |
| `llms-full.txt` 404s because Shell's `body-end.html` now computes it from `site.Params.ui.docs_section` and the content repo forgot to re-declare it | Medium | Phase 2 step 3 explicitly re-adds `docs_section` if pruned; Phase 5 `test -f public/…/llms-full.txt` catches it. |
| Favicons vanish after deleting `static/` | Low | Counter-intuitive but safe: Shell ships the same 5 files and Shell's `favicons.html` emits the tags unconditionally — this is the intended fix, not a loss. Verified by Hello-World (which has no local favicons and shows them correctly). |
| Variant blocks start warning (`unknown axis …`) because `params.variants` was trimmed | Low | Phase 5 `check-contracts.sh` + gate's `warnf` would surface it as build WARN → gate fails. No trimming allowed. |
| Go module cache serves stale Shell commit | Low | Pin commit explicitly in both `hugo.yaml:version` and `go.mod`; `hugo mod graph` verification in Phase 1 proves resolution. |

---

## 12. Appendix: shell command cheat-sheet

**Find the pin commit:**

```sh
git ls-remote https://github.com/rh-aiservices-bu/CAI-Field-Manual-Shell main | cut -c1-12
```

**Wire the module (Phase 1):**

```sh
# edit hugo.yaml version: <PIN>, then:
go get github.com/rh-aiservices-bu/CAI-Field-Manual-Shell@<PIN>
go mod tidy
hugo mod graph
```

**Verify locally with workspace (before Shell pin is published):**

```sh
cat > hugo.work <<'EOF'
go 1.27.3

use .

replace github.com/rh-aiservices-bu/CAI-Field-Manual-Shell => ../CAI-Field-Manual-Shell
EOF
HUGO_MODULE_WORKSPACE=hugo.work hugo --cleanDestinationDir --gc --minify --environment production --printPathWarnings 2>&1 | grep -i warn | grep -v "css.Sass: libsass"
# expect empty
rm hugo.work hugo.work.sum
```

**Prove the gate (Phase 2/5):**

```sh
sass --version
hugo --cleanDestinationDir --gc --minify --environment production --printPathWarnings 2>&1 | grep -i warn | grep -v "css.Sass: libsass"
sh ../CAI-Field-Manual-Shell/scripts/check-contracts.sh
```

**Prove page-set equivalence (Phase 2):**

```sh
find public -name index.html | sort > /tmp/after-public.txt
diff -u /tmp/before-public.txt /tmp/after-public.txt
```

---

## 13. What to hand sub-agents

When you delegate, give each agent:

1. **This plan file path:** `Docs/migration-to-shell-alignment.plan.md` (or wherever you persist this document).
2. **Its phase number (§9) and the verbatim task list for that phase.** Do not paraphrase — the file list in §5.1 and the YAML snippets in §3/§6 are load-bearing.
3. **Its allowed file set:** Phase 1 (`hugo.yaml`, `go.mod`, `go.sum` only), Phase 2 (`layouts/`, `assets/`, `static/`, `hugo.yaml:docs_section` + `hugo.yaml:sidebar_root_menu` + `content/rhoai-2-25-to-3-5/_index.md` front matter — the one approved content edit §5.1.2), Phase 3 (`.github/workflows/github-pages.yaml` only), Phase 4 (`README.md`, `AGENTS.md`, `.gitignore`), Phase 5 (read-only verification). No agent should touch another's files.
4. **The publication gate command** and the rule that the agent runs it exactly once at the end of its phase, not mid-flight.
5. **The constraint that diffs to `content/rhoai-2-25-to-3-5/**` are limited to the approved front-matter edit in Phase 2 (`sidebar_root_for: self` in `_index.md` §5.1.2 / §3). Any body/markdown edit requires approval per §10 — the agent must stop and surface it.

