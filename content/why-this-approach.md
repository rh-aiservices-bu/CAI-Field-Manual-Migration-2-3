---
title: Why this approach
description: What this prototype intends, copied from the MaaS guide, changed, and why.
weight: 30
icon: fa-solid fa-lightbulb
# docs type puts this page in the docs shell, so the left nav is present on
# every top-level entry, not just the manuals and chat.
type: docs
footer_style: slim
---
This prototype is the example of what future field manuals should be. It emulates the [RHOAI MaaS guide](https://rh-aiservices-bu.github.io/rhoai-maas-guide/modules/main/index.html)'s high-level approach with deliberate divergences.
For the author side — how to write a manual of this kind — see [Writing the field manual]({{< relref "/writing-the-field-manual" >}}).

## Copied from the MaaS guide

- **Status-gate discipline** — every command is followed by a verify command and literal expected output (see [Set up](field-manual/hello-world/set-up/)).
- **Known issues where the reader hits them** — symptom, diagnosis, workaround, tracker id (see [Things that broke](field-manual/hello-world/things-that-broke/)).
- **PR-linked changelog culture** and **version honesty** ("orientation, not a support statement").

## Changed on purpose

- **Markdown over AsciiDoc** — Hugo + Markdown, not Antora.
- **Dual consumption built in** — every page renders as HTML for humans and as markdown for AI agents: the page action menu offers *Copy markdown*, *View markdown*, *Open in Claude/ChatGPT*, and *Open Gemini*; the whole manual is also available as `llms.txt`.
- **Page-top display options** — a selector at the top of every manual page, above the breadcrumb (RHAIE version: 3.4 / 3.5 / 3.6; ops mode: GitOps / Manual / Scripted, each with *Show all*) filters content — a status sentence under the selector restates the current view and follows every change — and remembers the choice in `localStorage` across pages and visits. No re-choosing, no site forks — the MaaS guide's tabs idea, generalized.
- **Chronological manuals** — each manual walks the field-work timeline: set up → operate → things that broke, instead of numbered deployment phases.

## Serving humans and AI agents

Field manuals are read by humans or consumed by AI agents; they have to serve both. In this prototype:

- Humans get the styled HTML with the page-top selector and search.
- AI agents get the per-page markdown (the page action menu's *View markdown*), the site's `llms.txt`, and the print bundle — all of which carry every variant, labeled, because only the interactive HTML filters content.

## Search

The site search indexes every manual (`offline_search`), reached with `/` or the navbar search box.

## Google Analytics

GA4 is wired via the standard Hugo services config with a placeholder measurement ID; a real ID lands before real traffic.
