# Backlog — findings from the 2026-11-19 repo review

Findings from a four-agent review (content doctrine, config/build, cross-page
consistency, accuracy/risk) plus a devils-advocate pass. Every load-bearing
item was re-verified against the working tree at its cited lines. Verified-sound
areas are listed under "Verified sound (no action)" so future reviews don't re-litigate them.

## Open

### High

- [ ] **H1 — 5.10 final lint gate can false-pass and can't produce its expected output.**
  `content/rhoai-2-25-to-3-5/remediate-platform/index.md:578` runs
  `rhai-cli lint --target-version 3.5 | grep -E 'Total:|FAIL|PASS|WARNING|PROHIBITED'`
  but the expected output at :584 is `Failed: 0`, which matches none of the
  case-sensitive alternatives. Worse than a broken verify: lines containing
  `PASS`/`WARNING` do print, so the reader sees output and nothing forces them
  to notice the decisive line never appeared — at the last gate before the
  point of no rollback. Fix: add `|Failed` to the pattern (or show the raw
  summary) and make the shape agree with assess's exit-code table
  (`assess/index.md:242-246`).
- [ ] **H2 — Kueue Unmanaged path: canonical DSC patch contradicts the page's own rule.**
  `remediate-platform/index.md:334` says rename any LocalQueue named `default`
  ("RHBOK reserves that name, and admission breaks otherwise"), then
  :353-355 patches the DSC with `defaultClusterQueueName: "default"` and
  `defaultLocalQueueName: "default"`. Following the page verbatim ships the
  exact state it calls broken, and downstream `KueueReady=False` reads as a
  JobSet problem first (post-upgrade:58), sending readers to debug the wrong
  thing. Resolve with real DSC default-field semantics — the fields may need
  to be dropped under Unmanaged rather than renamed to `rhoai-kueue-default`
  (create-vs-reference semantics unclear; check RHBOK docs or a field run
  before editing).
- [ ] **H3 — RHCL block (4.6) annotates a Service before anything creates it.**
  `convert-model-serving/index.md:355-356` runs
  `oc annotate svc/authorino-authorino-authorization …` before the Authorino CR
  at :358-375 (the thing that creates that Service) — deterministic failure for
  every reader who follows the block in order. Fix: move the annotate after the
  Authorino apply + ready-wait, and add the missing expected outputs to the
  block's `oc new-project`/`oc wait` steps (:337, :353).

### Medium

- [ ] **M1 — 8.3 skip path strands `managed=false` while the same verify expects `managed=true`.**
  `post-upgrade/index.md:221` tells hand-managers to skip the action, but the
  verify at :223-228 expects `managed=true`; 5.6 set it `false` unconditionally
  and the skip path restores nothing. Fix: one line for the skip path —
  `oc annotate configmap inferenceservice-config -n redhat-ods-applications
  opendatahub.io/managed=true --overwrite` — or change the expectation and say
  how a hand-managed ConfigMap stays unmanaged on 3.5.
- [ ] **M2 — 8.7 DATA-LOSS restore assumes a TrustyAI backup that 5.2 may have skipped.**
  `remediate-platform/index.md:91` makes 5.2 conditional; the 8.7 restore
  (`post-upgrade/index.md:~457`) globs `trustyai-metrics-${NS}-*.json` — empty
  glob → `BACKUP_FILE=""` → restore runs with `--file ""`. Fix: guard the
  restore (`[ -n "$BACKUP_FILE" ] || abort`) and cross-reference "if you
  skipped 5.2 for this namespace, the Phase 2 baseline is your comparison".
- [ ] **M3 — 5.7 Unmanaged path demands three cluster-state changes with zero commands.**
  `remediate-platform/index.md:326` requires RHBOK "installed and working
  **first**" and names a `rhai-cli` `kueue` action — no install command, no
  verify, and no action invocation exists anywhere (assess's action table
  maps `kueue` → 5.7, but 5.7 never calls it). :346 demands labeling each
  Kueue-managed project and adding `queue-name` annotations — again no
  commands, no verify. Fix: add the RHBOK install/verify, the label loop, and
  the annotation one-liner before the DSC patch at :351.
- [ ] **M4 — KubeRay readiness verify reads the RESTARTS column.**
  `post-upgrade/index.md:308`: `oc get pods -A --no-headers | grep -i kuberay
  | awk '{print $4}'` — default columns are NAME READY STATUS RESTARTS AGE, so
  `$4` is RESTARTS; a healthy cluster prints `0`, never the expected `Running`
  (:311-316). This is the hard 8.5 prerequisite. Fix: `awk '{print $3}'` or a
  label/field-selector check like the rest of the manual.
- [ ] **M5 — re-test 9.1 claims "Re-run the same probe as the baseline" but the probe deliberately differs.**
  `re-test/index.md:32` vs `baseline/index.md:70-105`: re-test correctly drops
  the ModelMesh pod fallback (ModelMesh is Removed by 5.7 — do NOT re-add it)
  and the auth-header note (covered by `re-test#ki-isvc-oauth-proxy`). The
  defect is the false "same probe" sentence. Fix: reword to name the two
  deliberate differences.
- [ ] **M6 — GitOps variant note asymmetry.**
  cert-manager install gets a `{{< variant deploy gitops >}}` note
  (`pre-flight/index.md:211-213`); same-shaped installs get none: assess 3.1
  (`assess/index.md:44`), RHCL 4.6 (`convert-model-serving/index.md:336-341`),
  JobSet 7.5 (`upgrade/index.md:185-206`). clean-up 10.6 expects those objects
  recorded in Git before sync re-enables. Fix: add the same note to the three
  steps.
- [ ] **M7 — seven destructive `rhai-cli migrate run` sites have no expected output.**
  `convert-model-serving/index.md:80` (serverless-to-raw), :142
  (modelmesh-to-raw); `remediate-platform/index.md:107-110` (trustyai
  prepare ×2), :186 (ai-pipelines prepare); `post-upgrade/index.md:270`
  (workbenches.patch-auth-model), :375 (trustyai.migrate-gorch-otel-exporter —
  the rewrite's only checks are pod readiness and /info, though 5.2 saves the
  pre-upgrade `spec.otelExporter` at `remediate-platform/index.md:156-158` for
  exactly this comparison). assess §3.3 proves the tool prints distinctive
  closers; add fenced expected outputs (success closer + `Proceed? [y/N]`
  prompt) at each site.
- [ ] **M8 — daily cron build uploads a Pages artifact deploy can never use.**
  `.github/workflows/github-pages.yaml:8` cron runs the build job (`if:
  github.event_name != 'pull_request'`, :30), :78-80 uploads the artifact, but
  deploy only fires on push/workflow_dispatch (:136). Ops waste, and the cron
  build is also the only thing exercising the gate-vs-pin drift in M9 — when it
  goes red for a non-content reason, its stated purpose ("re-verify main when
  quiet") silently dies. Fix together with M9: gate the upload step on
  `github.event_name != 'schedule'` and pin the Shell checkout.
- [ ] **M9 — CI's gate script runs from Shell main while the site builds the pinned commit.**
  `.github/workflows/github-pages.yaml:38-40` checks out
  CAI-Field-Manual-Shell with no `ref:`, so `publication-gate.sh` strictness
  can drift ahead of the `1f1471c74947` pin in `hugo.yaml:167`. Fix: checkout
  Shell at the pinned hash (or document the accepted drift in README).
- [ ] **M10 — CI sets HUGO_CACHEDIR but caches nothing.**
  `.github/workflows/github-pages.yaml:25` relocates the cache into the
  ephemeral workspace; no `actions/cache` step exists, so oink + Shell
  re-download on every build and PR gate. Fix: cache `.hugo_cache` keyed on
  `go.sum` + the module pin line.
- [ ] **M11 — README documents an "Open Gemini" action the share config doesn't define.**
  `README.md:44` vs `hugo.yaml:93`
  (`share: [claude, chatgpt, linkedin, email, copy]`); "Gemini" appears
  nowhere else in the repo. Confirm against Shell's action-registry (may be
  injected under `page_context_menu.assistant_links: true`), then either add
  `gemini` to `share` or delete the README claim. If it's Shell chrome,
  propose in CAI-Field-Manual-Shell.
- [ ] **M12 — Sass tooling drift between CI and README.**
  CI installs `sass-embedded` via npm (`.github/workflows/github-pages.yaml:63,113`);
  README:104-110 prescribes `brew/npm/snap sass` and claims "no Node.js
  needed" four lines above `npm i -g sass`. Pick one distribution
  (recommend sass-embedded, matching CI) and fix the README prerequisites.
- [ ] **M13 — AGENTS.md/README blur where the two local overrides live.**
  `AGENTS.md:66-67` keeps `layouts/_partials/actions/page-urls.html` and
  `layouts/_partials/td-variant-selector.html` local with `TODO(Shell)`
  headers, but :69 lists `td-variant-selector.html` among files that "live in
  Shell"; `README.md:82` says chrome lives in Shell with no exception. A
  future Shell fix upstream could be silently shadowed by the local copies
  forever. Fix: cross-reference the two overrides in the pinned-copies list
  and add the exception to README.
- [ ] **M14 — 5.1 flips CodeFlare to Removed before raycluster.backup, unexplained.**
  `remediate-platform/index.md:40-59` — the flip is tool-imposed (backup
  action fails while CodeFlare is Managed) but the page's own header rule
  (:23-ish) says "back up before you flip", and nothing explains why the
  post-flip backup still captures the correct 2.x CR state. Fix: one
  explanatory sentence (or reorder if the tool allows).

### Low

- [ ] **L1 — OCP floor vs sail-Istio window don't line up.** pre-flight:124-128
  accepts 4.19.9+; `post-upgrade/index.md:138-145` describes the built-in
  Gateway API behavior for 4.20.31+/4.21.22+/4.22+. Readers on 4.19.x–4.20.30
  can't tell whether the most common post-upgrade failure applies to them.
  State the behavior per OCP band in the KI.
- [ ] **L2 — multi-DSC assumption undocumented.** Patches use
  `$(oc get dsc -o name | head -n1)` (remediate:43, :351, post-upgrade:321)
  different objects (patch one, verify another, false-green gate). Fix: capture
  the name once and reuse; also state the single-DSC assumption in pre-flight.
- [ ] **L3 — `--output-dir` "required" (remediate:104) but 5.3's prepare omits it and works** (remediate:185-186). Scope the requirement to trustyai or add the flag.
- [ ] **L4 — `oc get dsc default-dsc` hardcode** (`post-upgrade/index.md:73`) — the only non-name-agnostic DSC reference; use `$(oc get dsc -o name | head -n1)`.
- [ ] **L5 — six KI blocks have prose-only diagnosis.** assess:187, convert:324,
  upgrade:245, remediate:135, :147, post-upgrade:561. Add a command only where
  it adds signal (e.g. `oc get isvc <name> -o jsonpath='{.metadata.finalizers}'`
  for terminating-ISVC); several are legitimately prose ("wrong API group").
- [ ] **L6 — ~10 scattered commands without verify.** upgrade:61-62 (shape-only
  output for the OSSM version probes), upgrade:181 (`oc create namespace`),
  workbench-images:83-84 (annotate not verified — the istag check verifies the
  tag, not the annotation), post-upgrade:207 (netpol patch), post-upgrade:511
  (create-job tail), convert:318 (orphaned ksvc/virtualservice "look for" with
  no command).
- [ ] **L7 — 31 of 32 inline known issues say "Tracker. None".** Documented debt
  (`things-that-broke/index.md:72-74`), not concealment. File trackers as field
  issues arrive; the one with a KB (7134025) shows the pattern.
- [ ] **L8 — things-that-broke fix links land on page/section roots, not the fix.**
  zsh row → pre-flight page root (the WARNING block at pre-flight:16-18 has no
  anchor); Ray-403 row → clean-up root (fix is 10.3, clean-up:38-46). Add
  `{#…}` anchors and point the rows there.
- [ ] **L9 — 5.8 SMCP drain loop is an unbounded wait.**
  `remediate-platform/index.md:474`:
  `until [ -z "$(oc get smcp -A …)" ]; do … done` — no timeout, no counter,
  in a phase whose own KI documents SMMR deletes hanging. Bound it
  (`for i in {1..60}` + explicit failure message).
- [ ] **L10 — go.sum carries stale oink v1.5.1 checksums.** `go mod graph` and
  `go list -m` select v1.4.0 (verified), so behavior is correct — prune with
  `go mod tidy` to remove the ambiguity.
- [ ] **L11 — workflow hygiene.** `.github/workflows/github-pages.yaml:11-18`:
  workflow-level `pages: write`/`id-token: write` apply to the PR job too, and
  PR + deploy share one concurrency group. Move permissions into the build
  job; separate `pr-gate` concurrency. (Optional, same commit: SHA-pin the
  mutable `@v7`/`@v5` action tags on the deploy path.)
- [ ] **L12 — Chat page weight 50 ties remediate-platform's 50.**
  `content/chat/_index.md:5` — dormant while `draft: true`, but an undraft
  would slot Chat before Remediate in the chronological nav. Set weight 120
  when chat ships.
- [ ] **L13 — no LICENSE file.** Public site, README invites PRs, but the
  manual can't legally be reused. One file + README line; maintainer decision
  on license.
- [ ] **L14 — cosmetic naming drift.** "Ray clusters"/"RayClusters",
  "Service Mesh 2"/"OSSM v2", "GPU ISVC"/"GPU predictor". Pick one form per page.

### Confirm in CAI-Field-Manual-Shell (chrome — not fixable here)

- Gemini page action (M11) — check Shell's action-registry before touching README/hugo.yaml.
- Upstreaming the two local overrides (`page-urls.html`, `td-variant-selector.html`) per their `TODO(Shell)` headers; the AGENTS.md cross-ref (M13) is the in-repo half.

## Verified sound (no action)

- Variant blocks: 22 opens / 22 closes, all ids valid against
  `hugo.yaml` `params.variants`; no customize tokens anywhere; dual-consumption
  labels present on every variant block.
- All ~90 relrefs (incl. anchors) resolve; landing links and Chat's three
  hide-toggles consistent.
- KI index (things-that-broke) complete in both directions; tracker KBs used
  consistently.
- Migration sequencing chain sound (convert → disable, SMMR-before-operator,
  workbenches stopped pre-upgrade, Gateway before Ray, re-test before clean-up);
  "only rollback is the backup" chain consistent on every page.
- Placeholders clean (`<cluster-domain>`, `<token>`, `rhai-migration` only);
  no real cluster hosts.
- Tool pins consistent (Hugo 0.168.0, Go 1.27.3, Shell pin ↔ go.mod hash);
  .gitignore covers all build/CI artifacts; zh/fr disabled languages are
  intentional (translation-ready config).
- GA ID in hugo.yaml is a public Measurement ID, not a secret; robots/RSS/print
  outputs configured as documented.
