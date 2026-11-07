# Review — CAI Field Manual prototype (issue #3)

**Verdict:** the skeleton delivers its six conventions; the gate is clean (only the known LibSass warning; verified with hugo v0.169.0+extended). The doctrine pages are the strongest part. Findings below are content gaps inside the exemplar itself, ranked.

## What works (verified)

- **Six conventions, consistently applied.** `conventions.md` states each rule with its cost-of-omission; `examples.md` gives wrong/right source pairs for all six; `write-a-manual.md` is itself status-gated — every command (cp, head, grep, curl, hugo gate) carries literal expected output. The doctrine eats its own cooking.
- **Dual consumption holds in the build output.** `public/field-manual/hello-world/set-up/index.md` labels every variant block (`**Ops Mode: GitOps**`, `**RHAIE Version: 3.5, 3.6**`) and flattens tokens to shipped defaults (`--username=guest --server=api.ocp.abcd.sandbox1234.opentlc.com`). An agent reading the markdown loses nothing.
- **Selector config is coherent** (`hugo.yaml`): both axes have `neutral` + `default` + status phrases; version default 3.6, mode default all — matching what `customize.md` documents.
- **Publication gate passes**: no WARN beyond `css.Sass: libsass`, build completes (`Total in 692 ms`).

## Findings — fix in the exemplar

### 1. Status-gate rule is violated by the exemplar's own Procedure section (highest priority)
`set-up.md` Procedure step 2 is a pointer — *"Run the setup command and confirm the output matches the expected output below"* — but there is no setup command and no expected output anywhere on the page. Step 1 (`oc login`) has no verify command either; per the site's own convention it needs one, e.g.:

```sh
oc whoami
```

Expected output:

```sh
guest
```

Fix: give step 1 its gate, and replace step 2 with a real command (or delete it — step 3 "Apply the change" is the actual action and carries per-mode blocks).

### 2. The manual references artifacts that don't exist
`set-up.md` references `manifests/hello-world/`, `./scripts/apply-hello-world.sh`, `./scripts/rollback-hello-world.sh`; `things-that-broke.md` workarounds reference `manifests/hello-world/`. No `scripts/` or `manifests/` dir exists in the repo. For a *skeleton* that's arguably fine, but nothing on the page says so. Fix: one sentence at the top of `set-up.md` — "This is a skeleton; the referenced paths are placeholders to be filled in when duplicating" — or ship minimal stub dirs.

### 3. `operate.md` promises drift detection and escalation criteria it never delivers
The lead and description say "confirm health, watch for drift, and know when to escalate", but the page only covers health; there is no drift check and no escalation criteria (who/when/how). Per the doctrine's own "outcome first" rule, either add a real drift check (e.g. `oc get hello hello-world -o yaml` diffed against the manifest) and an escalation block, or narrow the promise to match the content.

### 4. `llms.txt` hides the doctrine from agents
`llms.txt` Documentation index lists only `field-manual/hello-world` (the `docs_section`). `writing-the-field-manual/` and `why-this-approach.md` render per-page markdown but aren't in the index — yet those are exactly the pages an agent asked to "write a manual here" must read. Consider whether `docs_section` should widen, or whether landing cards need an agent-facing alternative index. (Prototype-scope call, not a bug.)

### 5. Placeholder tracker ids are self-documenting but easy to miss
`RHOAIENG-0000/0001` say "placeholder" inline — good — but nothing instructs the duplicating author to replace them. One clause in `write-a-manual.md` step 3 ("replace the placeholder tracker ids in things-that-broke.md") closes the loop.

### 6. Minor: duplicated conditional text the variant system was built to remove
`set-up.md` line 52 ("On **3.5 and 3.6**, the prototype default, use the commands above as-is") is a no-op statement — the dual of the 3.4 divergence note. Dropping it halves the version noise and matches "route divergence through the selector" (the 3.4 block alone carries the signal). The "all-modes" variant block at line 10 is similarly meta; consider whether it earns its pixels.
