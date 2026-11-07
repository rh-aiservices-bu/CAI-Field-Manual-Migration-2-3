# Top 5 next moves for the field manuals (issue #3 follow-up)

The prototype's stated goals: chronological field-work notes (set up → operate → things that broke), every command status-gated with literal expected output, known issues documented where the reader hits them, divergence routed through the page-top selector axes, environment-specific values as customize tokens, and one page serving both a human in a browser and an agent reading markdown. The first review (findings 1–6 below the fold of this doc's PR) covered gaps inside the hello-world exemplar. This doc is the next layer: what to build so the format survives contact with real manuals, real drift, and real readers.

Each item: why it matters, a concrete worked example, and the cost.

---

## 1. Publish an automated contract check for the two-consumer promise

**The gap.** Dual consumption is the site's differentiator — but nothing enforces it. A new manual can ship a variant block with ids that match no axis option (silently always-visible), a `customize` token with no `hugo.yaml` entry (renders as an empty string in every command), or a status-gate step whose expected output block is missing — and the gate still passes. The promises that differentiate the site are exactly the ones no human reviewer reliably re-checks by hand.

**The check.** A small CI script over the built markdown output (`public/`) asserting:

- every fenced `sh` block inside a Procedure/Verification section is followed by an "Expected output" fence or an explicit no-expected-output marker;
- every `{{< customize X >}}` id used in content exists in `params.customize`;
- every `{{< variant axis option >}}` pair exists in `params.variants`;
- every page lists its variants in the flattened markdown (the `**Axis: Option**` label lines) — catches a block whose label got edited away;
- no shipped default tokens (guest, `.ocp.abcd.sandbox1234.opentlc.com`) appear in `hugo.yaml`-declared production contexts other than the documented defaults.

**Worked example** (the script this doc ships; run before opening a PR):

```sh
scripts/check-contracts.sh
```

Expected output:

```sh
contracts OK — 4 pages, 11 variant labels, 2 customize tokens
```

**Cost.** One script (~100 lines), one CI step. Each assertion was probed against the current tree: an undeclared customize token, an undeclared variant option, a raw shortcode leaked into the markdown output, and a dangling "Expected output" are each reported and fail the check. The current tree passes (the set-up page's "expected output below" promise — review finding 1 — is followed by a Verification section's block, so the loose heuristic does not fire), which is the point: the check pins today's good state and keeps every future manual honest.

---

## 2. Give known issues a lifecycle, not just a location

**The gap.** The doctrine says *where* a known issue lives (inline, four parts) but nothing about how it dies. Real field issues rot in one of two ways: the workaround stops working (product fixed it, manual still tells readers to hand-patch), or the issue stops applying (version-gated, and a 3.6 reader is reading a 3.4-era fix). Today the only freshness signal is a placeholder Jira id. Unmaintained known issues are worse than absent ones — they are the one part of the manual the reader is forced to trust mid-breakage.

**The convention to add.** A known issue carries a **status** alongside its tracker id, and the manual page is re-verified against each issue at every release bump:

- `open` — reproduces as described; workaround applies.
- `fixed in <version>` — stop shipping the workaround to newer readers: wrap the entry in `{{< variant version "3.4 3.5" >}}` so the selector hides it from readers the fix reached, and add one line pointing the newer reader at the fixed behavior.
- `obsolete` — the symptom can no longer occur (feature removed, path renamed); delete the entry and note the deletion in the changelog.

**Worked example** (the OOMKill entry from `things-that-broke.md`, once the product team confirms a fix landed in 3.6):

````markdown
{{< variant version "3.4 3.5" >}}
## Known issue: hello-world pod OOMKill

**Symptom.** The pod restarts with reason `OOMKilled`.

**Diagnosis.**

```sh
oc describe pod hello-world | grep -A3 "Last State"
```

**Workaround.** Raise the memory limit in `manifests/hello-world/` and re-apply.

**Tracker.** RHOAIENG-0001 — fixed in 3.6: the operator's default limit doubled.
On **3.6** the workaround below no longer applies; re-apply your own limit only
if you have raised the size class.
{{< /variant >}}
````

A 3.6-pinned reader never sees the stale workaround; a Show-all reader sees it labeled with its own expiry. The markdown output keeps both, correctly labeled — the dual-consumption promise holds.

**Cost.** One clause in `conventions.md`, two sentences in `write-a-manual.md` step 3, and the discipline to re-check entries at release bumps (item 1's script can flag entries whose `fixed in` version is older than the manual's default version).

---

## 3. Write the second manual on a real component — retire the skeleton only after it has a successor

**The gap.** The hello-world manual is a skeleton first and an exemplar second; several of its gaps (placeholder manifests, placeholder tracker ids, the pointer-with-no-command procedure step) exist *because* it is a template. A format proves itself on the second, real manual: that is where the doctrine either holds or needs another pass. The MaaS guide's own module list (notebooks, workbenches, model serving, pipelines) is the natural source of candidates.

**How to pick the first real subject.** The component where field work actually hurt:

- high day-two variance between 3.4/3.5/3.6 (exercises the version axis with real divergences, not synthetic ones);
- at least two genuinely different ops modes (exercises the mode axis);
- at least one known issue with a real tracker id and a real workaround (exercises the inline-issue convention with a lifecycle, per item 2).

**Worked example** (the nav once a real manual lands):

```
content/field-manual/
├── _index.md            (section landing, both manuals)
├── hello-world/         (blank skeleton — stays, marked as template)
└── workbenches/         (first real manual: set-up, operate, things-that-broke)
```

`content/field-manual/_index.md` then carries one card per manual, and the hello-world `_index.md` lead sentence changes from "A blank field manual" to explicitly "The template — duplicate this; see Workbenches for a filled-in example". New authors get both halves: the empty skeleton and the worked example.

**Cost.** Authoring time (the real cost of the format — the thing the prototype exists to measure), zero code.

---

## 4. Add a drift statement to the Operate page — and a changelog page per manual

**The gap.** Two review findings compound here: `operate.md` promises drift detection and escalation criteria it never delivers, and nothing anywhere tells a returning reader what changed since they last did the procedure. Operators do not re-read manuals; they diff them. The MaaS guide's "PR-linked changelog culture" is listed as copied-from, but no manual here carries one.

**Worked example — the drift block `operate.md` is missing** (filling review finding 3):

````markdown
## Drift

Confirm the cluster still matches what Set up applied:

```sh
oc get hello hello-world -o yaml > /tmp/live.yaml
diff /tmp/live.yaml manifests/hello-world/hello-world.yaml && echo IN-SYNC
```

Expected output:

```sh
IN-SYNC
```

If the diff is non-empty, either re-apply from [Set up](set-up/) or fold the
drift into the manifest — do not leave both sources of truth.

## Escalate when

- Two consecutive drift diffs you cannot attribute to your own changes.
- `Ready` missing for more than 10 minutes with no entry on
  [Things that broke](things-that-broke/).
- Anything you would have to hand-edit inside operator-managed resources.

Escalation target: your team's normal support channel, with the manual page,
the failing verify command, and its actual output pasted.
````

**Worked example — the changelog** (new `content/field-manual/<manual>/changelog.md`, `weight: 50`, one entry per manual change, each entry linking its PR):

```markdown
---
title: Changelog
description: What changed in this manual, most recent first — each entry links its PR.
weight: 50
---

## 2026-11-07

- Added drift check and escalation criteria to Operate. (#PR)
- Marked the OOMKill known issue fixed in 3.6. (#PR)
```

**Cost.** The operate block is content the page already promises; the changelog is one file per manual and a line of discipline per PR. The theme's `lastmod` (GitInfo) already shows *that* a page changed — the changelog says *what* and *why*, which is what an operator returning after a month needs.

---

## 5. Turn the landing page into the field-work timeline it describes

**The gap.** `data/home.yaml` uses 3 of the 22 shipped landing sections; its cards are a flat directory of pages. But the site's whole thesis is chronology — set up → operate → things that broke — and the landing page is where a first-time reader decides whether the format is credible. The theme ships `timeline`, `faq`, and `metrics` sections (verified in the theme's `landing/sections/` partials) that state the thesis visually. This also demonstrates to future manual owners that the landing page is data-driven, one YAML file, no layout work.

**Worked example** — add to `data/home.yaml` (the exact data shape the theme's `timeline` and `faq` partials require; `sections:` becomes `[hero, timeline, cards, faq, cta]`):

```yaml
timeline:
  eyebrow: The format
  title: Every manual walks the field-work timeline
  items:
    - date: Phase 1
      icon: fa-solid fa-play
      title: Set up
      desc: One procedure that changes the system — prerequisites, status-gated commands, verification, rollback.
    - date: Phase 2
      icon: fa-solid fa-gauge-high
      title: Operate
      desc: Day-two health checks, drift detection, and when to escalate.
    - date: Phase 3
      icon: fa-solid fa-triangle-exclamation
      title: Things that broke
      desc: Known issues where you hit them — symptom, diagnosis, workaround, tracker id.

faq:
  eyebrow: For readers
  title: Questions people actually ask
  items:
    - question: Why does every command show its expected output?
      answer: A command whose output nobody checks is a guess about the system's state. The status gate turns "ran it" into "confirmed it" — see [Conventions](writing-the-field-manual/conventions/).
    - question: Why do versions and ops modes live in a selector instead of separate pages?
      answer: Divergence is permanent; separate pages fork the manual and drift apart. The selector filters, the choice persists, and the markdown output carries every variant labeled for agents.
```

**Cost.** Two YAML blocks in an existing file. No layout changes; the partials ship in oink 1.4.0.

---

## What deliberately did not make the top 5

- **Enabling the theme's 👍/👎 feedback widget** (`ui.feedback.enable: true`): real, one line, GA4 already wired — but it measures the landing page before it measures manuals, and without item 3 (a real manual with real readers) the signal is thin. Revisit after the second manual ships.
- **Widening `llms.txt`'s Documentation index to the doctrine pages** (review finding 4): real gap for agents, but the mechanism (`docs_section`) is one config decision the maintainers should make once — widen `docs_section` to a list or add a second section — rather than something this prototype decides unilaterally. Flagged in the review; needs a maintainer call, not an example.
- **Palette quick-commands, backlinks, badges, section theming** (`potential-improvements` page already catalogs them): polish, not thesis; none of them change what a reader can *do*.
