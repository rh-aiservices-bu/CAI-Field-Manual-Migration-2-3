# Backlog

Working list of pending work for this repo. New items go at the bottom of their priority table.

## Now

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Commit rename + RH CAI lockup changes; push to renamed repo | pending | baseURL/github_repo → CAI-Field-Manual-prototype; field-guides → field-manual rename everywhere (dir, docs_section, LLMSFULL path, copy); assets/icons/logo-rh-cai.svg; gate clean |

## Next

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | GitHub Pages: Settings → Pages → Source = GitHub Actions (admin, one-time) | pending | required before the site publishes |

## Later

| # | Item | Status | Notes |
|---|------|--------|-------|
| | | | |

## Done

| # | Item | Completed | Notes |
|---|------|-----------|-------|
| 1 | *Feed it to my AI Agent* page-action/palette row + copy-prompt modal (Claude Code / Codex) | 2026-10-31 | static/js/agent-setup.js + static/css/agent-setup.css wired via body-end/head-end hooks; row is registered with the assistant actions in layouts/_partials/actions/context.html and uses url "#agent-prompt", so it appears directly below Open Gemini in both the page action menu and palette; the JS watches the fragment hash, opens the modal, clears the hash so the action can re-fire; clone URL from params.github_repo via __TD_AGENT_SETUP__ blob (chat.js llmsFull pattern); copy via theme OinkClipboard (dialog-aware execCommand fallback); prompt points agent at README.md; gate clean, browser-verified |
| | | | |
