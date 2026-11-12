---
title: Conventions and intent
description: The six conventions every field manual follows — why each exists and what the reader loses without it.
icon: fa-solid fa-compass
weight: 10
---

Field manuals here are written against six conventions. Each one below states why it exists, what a reader loses when a manual skips it, and the rule itself. The [RHOAI 2.25 → 3.5 migration manual](../content/field-manual/rhoai-2-25-to-3-5/) is the working exemplar.

## Chronological information architecture

The work happens in a fixed order: set the system up once, operate it day to day, and fix what breaks. A manual organized by order-of-work puts the stage a reader is standing in one click away, and the timeline never goes stale the way an install route does — phases get renumbered by every release, but field work is still set up, operate, breakage. Ordered by deployment phases instead, the nav stops matching the reader's moment, and a day-two check hides inside whatever phase list came from the installer's point of view.

**Rule: order the manual by the field-work timeline — set up → operate → things that broke.**

## Status-gate verification

A command whose output nobody checks is a guess about the system's state. The status gate turns each step from "ran it" into "confirmed it": the command, a verify command, and the literal expected output to compare against. Without the gate, a half-applied change looks exactly like a successful one, and the failure surfaces steps later — far from the command that caused it and past the point where the reader knows what to undo.

**Rule: follow every command with a verify command and its literal expected output.**

## Inline known issues

Breakage arrives in the middle of following a manual, not after finishing it, so the fix belongs on the page where the reader already is. A known issue is documented as symptom, diagnosis command, workaround, and tracker id, inline. Banished to a separate known-issues page, the same information costs the reader their place: they leave mid-procedure, scan a list that is not about their step, and usually give up before finding the workaround — and the tracker id is what keeps the entry honest once the workaround rots.

**Rule: document each known issue where the reader hits it — symptom, diagnosis command, workaround, tracker id.**

## Variant selector axes

Version and ops-mode differences are permanent features of the product, not noise to edit away. The page-top selector holds both axes, filters the page for the current reader, and persists the choice — one manual instead of one fork per version, and no mode buried behind tabs. The labels have to describe themselves, because most consumption is not interactive: agents read the markdown output, where nothing is filtered and the label is the only thing saying which variant a block belongs to.

**Rule: route version and ops-mode divergence through the page-top selector's axes, and write labels that describe themselves.**

## Customize tokens

No two readers share a cluster name, a username, or a project. Customize tokens mark those values and substitute the reader's own — set once, applied in every command, with a shipped default so the manual still reads before any value is set. Without them, every command ships with one environment's values baked in; readers hand-edit, and hand-edits are where wrong clusters, stale usernames, and copy-paste mistakes come from.

**Rule: substitute environment-specific values with customize tokens, each with a sensible shipped default.**

## Dual consumption

A field manual is read by a human in a browser and consumed by an agent as markdown — same page, both outputs. The HTML filters variants and substitutes tokens interactively; the markdown output carries every variant labeled and every token at its shipped default, so nothing is lost, only flattened. Written for just one consumer, the page serves the other one ambiguity: an unlabeled variant or an unexplained value in the markdown is a sentence the agent cannot act on.

**Rule: write every page so the markdown-only reader gets every variant labeled and every token at its shipped default.**


