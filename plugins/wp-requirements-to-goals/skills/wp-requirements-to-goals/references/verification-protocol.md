# Verification Protocol Reference

This file holds the **verbatim contents** of `protocols/run_goal_tests.md` that the skill copies into the generated project during Phase 2 (scaffold).

When generating `protocols/run_goal_tests.md`, copy everything below the `--- BEGIN PROTOCOL ---` marker and above the `--- END PROTOCOL ---` marker into the destination file, byte-for-byte. Do not paraphrase, summarize, or modify.

The protocol is the agent-agnostic verification contract that every goal's `VERIFY.md` references. Codex during a `/goal` run reads this protocol inline as part of evidence-based completion. Other agents/scripts can follow it given a single argument: the goal folder path.

--- BEGIN PROTOCOL ---

# run_goal_tests — Goal Verification Protocol

A self-contained, agent-agnostic protocol for verifying a single goal folder using **playwright-cli** for browser tests and **wp-cli** (`wp eval-file`) for server-side checks.

This protocol is the verification contract referenced by every goal's `VERIFY.md` and by the goal's Definition of Done. Any coding agent — Codex during a `/goal` run, a CLI script, or a future agent — can follow this document end-to-end given a single argument: the goal folder path.

## Argument

`<goal-folder>` — path to a goal folder, e.g., `goals/03-us03-dismiss-and-suppress`. Every other path is derived from this.

## Required tools

- `playwright-cli` — installed and on `$PATH` (or accessible via `npx playwright-cli`).
- `wp-cli` — accessible via `npm run env:cli -- ...` (the wp-env wrapper).
- File system read/write inside the project.

## Derived paths

| Item | Path |
|------|------|
| Test plan | `<goal-folder>/tests/test_plan.md` |
| Domain script | `<goal-folder>/tests/domain.eval.txt` |
| Status JSON | `<goal-folder>/test-status.json` |
| Results log | `<goal-folder>/test-results.md` |
| Artifacts | `<goal-folder>/test-artifacts/<TC-ID>/` (one folder per TC) |
| Allowed paths | listed in `<goal-folder>/GOAL.md` (used during the fix loop) |

## Session name

Derive a deterministic playwright-cli session name from the goal folder's leaf:

```text
goal-folder                            → session name
goals/00-foundation                    → goal-00-foundation
goals/03-us03-dismiss-and-suppress     → goal-03-us03-dismiss-and-suppress
goals/09-hybrid-mode                   → goal-09-hybrid-mode
goals/10-integration                   → goal-10-integration
```

Pass `-s=<session-name>` to every `playwright-cli` invocation.

## Base URL

Read `.wp-env.json` at the project root at run time:

- If `port` is set, use `http://localhost:<port>` as the dev URL.
- If `port` is absent or `.wp-env.json` does not exist, default to `http://localhost:8888` and continue.
- Tests admin URL is `<dev-url>/wp-admin/`; admin credentials default to `admin / password` (wp-env defaults).

**Reading `.wp-env.json` happens at run time, not at scaffold time.** If the user edits `.wp-env.json` to change the port, every protocol invocation picks up the new value without re-scaffolding. `_shared/project-config.md` carries the Phase 1 snapshot in its Environment table for reference, but the runtime authority is `.wp-env.json`.

---

## Protocol

This protocol is sequential and single-agent by design. It does not rely on any agent-specific sub-task primitive. The agent maintains state by reading and writing `<goal-folder>/test-status.json` directly.

### Phase 1 — Initialize

#### Step 1: Resumption check

If `<goal-folder>/test-status.json` exists AND has at least one TC with status `pass`:

- This is a **resumed run**.
- Continue with **only** TCs whose status is `pending` or `fail` (with `fixAttempts < 3`). All other TCs are skipped.
- Skip steps 2–6; jump to Step 7 (open session) and then Phase 2.

Otherwise, continue from Step 2 (fresh run).

#### Step 2: Read the test plan

Read `<goal-folder>/tests/test_plan.md`. For each TC, capture:

- TC ID (auto-detect pattern: `TC-001`, `TC-AC1`, `TC-EDGE-1`, etc.)
- Name
- Priority (Critical / High / Medium / Low — default Medium if unstated)
- Preconditions
- Steps + expected outcomes (in order)
- Test data (if any)
- Dependencies on other TCs (`Depends on:` field)

#### Step 3: Determine execution order

Resolve dependencies. TCs with no dependencies run first. Then TCs whose dependencies are now resolved. Continue until all are ordered. Cycles are an authoring error in `test_plan.md`; report and stop if found.

#### Step 4: Initialize the status JSON

Create `<goal-folder>/test-status.json`:

```json
{
  "metadata": {
    "goalFolder": "<goal-folder>",
    "testPlanSource": "<goal-folder>/tests/test_plan.md",
    "session": "<session-name>",
    "startedAt": "<ISO-timestamp>",
    "lastUpdatedAt": "<ISO-timestamp>",
    "summary": {
      "total": 0,
      "pending": 0,
      "pass": 0,
      "fail": 0,
      "knownIssue": 0
    }
  },
  "testCases": {
    "<TC-ID>": {
      "name": "...",
      "priority": "Critical|High|Medium|Low",
      "status": "pending",
      "fixAttempts": 0,
      "notes": "",
      "lastTestedAt": null
    }
  },
  "knownIssues": []
}
```

Set `metadata.summary.total` = TC count and `metadata.summary.pending` = TC count.

#### Step 5: Initialize the results log

Create `<goal-folder>/test-results.md`:

```markdown
# Test Results — <goal-folder>

**Test Plan:** <goal-folder>/tests/test_plan.md
**Started:** <ISO-timestamp>
**Browser:** playwright-cli (session: `<session-name>`)

## Execution Log
```

#### Step 6: Create the artifacts root

```bash
mkdir -p <goal-folder>/test-artifacts
```

#### Step 7: Open the playwright-cli session

```bash
playwright-cli list
# If <session-name> is NOT in the list:
playwright-cli -s=<session-name> open <base-url>
```

Reusing one named session preserves cookies across TCs and is faster than launching per-test.

#### Step 7.5: Resolve URL placeholders in the test plan

Test plans use placeholder URLs rather than hard-coded ports so the same plan works whether wp-env runs on 8888, 8899, or any user-edited port. Before executing each TC's steps, substitute:

| Placeholder | Resolves to |
|---|---|
| `[DEV_URL]` | `<base-url>` (computed from `.wp-env.json` `port` in the Base URL section above) |
| `[ADMIN_URL]` | `<base-url>/wp-admin/` |
| `[DEV_PORT]` | The numeric port (e.g., `8888`) |
| `[ADMIN_USER]` | `admin` (wp-env default unless overridden in `_shared/project-config.md`) |
| `[ADMIN_PASSWORD]` | `password` (wp-env default unless overridden) |

A test plan command written as `playwright-cli -s=<session-name> goto [DEV_URL]/?p=42` executes as `playwright-cli -s=<session-name> goto http://localhost:8888/?p=42`. The substitution is text-level — no shell expansion magic, no environment variables.

---

### Phase 2 — Execute (sequential, one TC at a time)

For each TC in dependency-resolved order, execute the sub-routine below. **Do not parallelize.** The shared session is single-threaded; concurrent commands clobber snapshots.

#### Step 8: Per-TC sub-routine

##### 8.1 Prepare the per-TC artifacts directory

```bash
mkdir -p <goal-folder>/test-artifacts/<TC-ID>
```

##### 8.2 Start the video recording (BEFORE the first step)

```bash
playwright-cli -s=<session-name> video-start
```

Video recording is **mandatory** — `recording.webm` is the evidence that the TC actually exercised the UI. Without it, a failure can't be reviewed and a pass can't be audited.

If `video-start` fails, retry once. If it still fails:

- Mark the TC `status: "fail"`, with `notes: "video-start failed twice; cannot record evidence — investigate playwright-cli installation, browser binaries, or sandbox restrictions"`.
- Skip the rest of the per-TC sub-routine for this TC — there is no recording to verify against.
- Continue to the next TC in dependency order. The orchestrator handles the fix loop the same way as any other failure (root cause, fix attempt, re-run).

Do not silently continue without video. Recording is the gate — a failed video-start is a failed TC.

##### 8.3 Execute the test steps

Follow the steps in `test_plan.md` exactly. For each step:

- **Snapshot before every interactive command.** Refs (`e1`, `e5`, …) come from the most recent snapshot and go stale on any DOM change. Always run `playwright-cli -s=<session-name> snapshot` before `click`, `fill`, `select`, `check`, `hover`, `dblclick`, `drag`, or `upload`.
- Read the snapshot output to find the correct ref for the element you want to interact with.
- **Snapshots are for ref-picking, NOT artifacts.** Do not pass `--filename=...`.
- Use `playwright-cli -s=<session-name> eval "<JS expression>"` for DOM assertions that go beyond snapshot ref shape (counts, `textContent`, computed styles).
- Use `playwright-cli -s=<session-name> network` for asset / request assertions.
- Use `playwright-cli -s=<session-name> resize <w> <h>` for viewport-dependent steps.
- Honor any explicit `playwright-cli` command listed verbatim in the TC's steps.

##### 8.4 Capture the console (BEFORE stopping the video)

```bash
playwright-cli -s=<session-name> console > <goal-folder>/test-artifacts/<TC-ID>/console.log
```

Inspect for errors. Pre-existing unrelated warnings can be noted but do not fail the test alone.

##### 8.5 Stop the video recording and verify the artifact

```bash
playwright-cli -s=<session-name> video-stop <goal-folder>/test-artifacts/<TC-ID>/recording.webm
```

After `video-stop`, verify the recording landed:

- `recording.webm` must exist at `<goal-folder>/test-artifacts/<TC-ID>/recording.webm`.
- Its size must be greater than 0 bytes (`stat`-equivalent check; an empty file means the recorder closed without flushing).

If either check fails, retry `video-stop` once. If the second attempt also yields a missing or zero-byte file, mark the TC `status: "fail"`, with `notes: "video-stop did not produce a non-empty recording.webm; cannot verify the TC's UI evidence"`. Same fix-loop semantics as Step 8.2.

##### 8.6 Determine the result

- **PASS** if all expected outcomes verified (via snapshots / `eval` / `network`), no unexpected console errors, UI matches the plan.
- **FAIL** otherwise.

##### 8.7 Apply the result

**If PASS:**

- Update the TC's entry in `<goal-folder>/test-status.json`:
  - `status: "pass"`
  - `lastTestedAt: <ISO-timestamp>`
  - `notes: "<brief verification summary; reference recording.webm and console.log>"`
- Recompute `metadata.summary` counts (`pass++`, `pending--`).
- Set `metadata.lastUpdatedAt`.
- Append a results-log entry (Step 8.8).

**If FAIL and `fixAttempts < 3`:**

1. Read `recording.webm` and `console.log` for evidence. Analyze the root cause.
2. Implement a fix in plugin code, **only inside paths listed in `<goal-folder>/GOAL.md` "Allowed paths"**.
3. Update the TC's `fixAttempts: <prev + 1>`, `notes: "<failure description, root cause, fix applied, artifact references, video timestamp>"`.
4. Re-run the steps from 8.2 (fresh video — the new recording overwrites the previous).
5. Loop until passing or `fixAttempts == 3`.

**If FAIL and `fixAttempts >= 3`:**

- Mark as `known_issue`:
  - `status: "known_issue"`
  - `notes: "KI — <description, repro, severity, suggested fix, artifact paths, video timestamp>"`
- Add an entry to `knownIssues` in the status JSON.
- Recompute `metadata.summary` counts (`knownIssue++`, `pending--`).

##### 8.8 Append to the results log

Append to `<goal-folder>/test-results.md`:

```markdown
## <TC-ID> — <Name>

**Result:** PASS | FAIL | KNOWN ISSUE
**Tested At:** <ISO-timestamp>
**Fix Attempts:** <N>
**Artifacts:** <goal-folder>/test-artifacts/<TC-ID>/

**What happened:** <one or two sentences>

**Console findings:** <summary of console.log>

**Notes:** <observations, fixes attempted, video timestamp of failure if applicable>

---
```

##### 8.9 Sanity check before moving to the next TC

Confirm three locations are updated:

1. The TC's entry in `<goal-folder>/test-status.json`
2. The summary counts in the same JSON
3. A new entry in `<goal-folder>/test-results.md`

Confirm `playwright-cli list` still shows `<session-name>` open. Re-open if a step accidentally closed it.

---

### Phase 3 — Summary

#### Step 9: Append the final summary

Append to `<goal-folder>/test-results.md`:

```markdown
# Final Summary

**Completed:** <ISO-timestamp>
**Total TCs:** <N>
**Passed:** <N>
**Known Issues:** <N>

## Results

| TC | Name | Priority | Result | Fix Attempts |
|----|------|----------|--------|--------------|
| ... | ... | ... | ... | ... |

## Known Issues

### KI-001: <TC-ID> — <Title>

- **Severity:** low | medium | high | critical
- **Repro:** <how to see it>
- **Suggested fix:** <if known>
- **Artifacts:** <goal-folder>/test-artifacts/<TC-ID>/
```

#### Step 10: Close the session

```bash
playwright-cli -s=<session-name> close
playwright-cli list
```

The second `list` should confirm the session is gone.

---

## Rules summary

| Rule | Description |
|------|-------------|
| Sequential | One TC at a time. Never parallelize. The shared session is single-threaded. |
| Snapshot before action | Always `snapshot` before `click`/`fill`/`select`/etc. Refs go stale on any DOM change. |
| Snapshots are ephemeral | For ref-picking only. Do not save snapshot YAMLs as artifacts. |
| Video per TC | `video-start` before first step; `video-stop <path>` after console capture. |
| Console before video-stop | Always capture `console` BEFORE `video-stop`. |
| Per-TC artifacts | `<goal-folder>/test-artifacts/<TC-ID>/{recording.webm,console.log}`. |
| Three update locations | TC entry in status JSON, summary counts in the same JSON, results log entry. |
| Max 3 fix attempts | Then mark `known_issue`. |
| Allowed paths | Code edits during fix loop must respect `Allowed paths` from GOAL.md. |
| Resumable | If status JSON exists with `pass` entries, continue from where the prior run stopped. |
| Cleanup | Close the session in Phase 3, after the summary. |

## Do NOT

- Spawn parallel test executions.
- Close the session inside the per-TC loop. Only Phase 3 closes it.
- Interact with elements without a fresh snapshot first.
- Save snapshot YAMLs or per-step screenshots as artifacts.
- Edit plugin files outside the goal's `Allowed paths` during the fix loop.
- Skip the console-capture step.
- Forget to update both the status JSON and the results log.

--- END PROTOCOL ---
