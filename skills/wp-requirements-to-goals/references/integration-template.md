# Integration Goal Template (Phase 6)

Read this file when generating `goals/<NN>-integration/`. This is the **last** goal generated. After this, the project structure is complete and `/goal` runs can begin.

The Integration goal verifies the whole plugin works end-to-end across every user story, every non-US feature, and every edge case. It does not introduce new features — it only adds tests and patches whatever bugs surface during cross-goal regression.

## Inputs

- `./goals-plan.md` (mandatory)
- `./requirements.md` (mandatory)
- All previously generated `goals/NN-*/` folders (for cross-reference)

## Clarification points

Resolve via `AskUserQuestion`. The Integration goal is the most judgment-heavy — surface decisions explicitly.

| # | Decision | Recommendation pattern |
|---|----------|------------------------|
| 1 | **Cross-cutting TCs** to include in the test plan | Propose a default list: smoke (full visitor flow), cross-page session continuity, settings change reflection, admin visibility + settings interaction. Mark the most critical as `(Recommended)`; let the user add/remove. Do **not** include any TC that runs `wp plugin uninstall` or otherwise removes plugin data against the running dev wp-env — uninstall hygiene is verified in a separate disposable-env protocol (see clarification #4). |
| 2 | **Edge case ownership for unowned cases** | If `goals-plan.md` "Detected edge cases" has rows without an owner goal, ask the user whether each unowned edge case lives in this Integration goal or in a more specific previous goal. |
| 3 | **Non-flakiness threshold** | Recommended: 3 consecutive identical-pass runs of the full suite (Phase 7 / "non-flakiness check" in VERIFY.md). Alternates: 2 runs (faster), 5 runs (stricter), or skip the check (not recommended). |
| 4 | **Uninstall hygiene verification mode** | Recommended: **separate disposable-env protocol** documented in `VERIFY.md` § Uninstall hygiene check. The check runs against a freshly-reset wp-env (`npm run env:clean && npm run env:start`), not the dev wp-env that the rest of the test plan exercises. Reason: running `wp plugin uninstall <slug>` mid-suite against the shared dev wp-env tears down the database the next TC depends on and leaves the wp-env in an unusable state for subsequent goals. Alternate: skip uninstall hygiene entirely (only choose if the plugin has no persistence — rare). |

## Outputs

```text
goals/<NN>-integration/
  GOAL.md
  VERIFY.md
  PROGRESS.md
  tests/
    test_plan.md       cross-cutting + edge-case TCs
    domain.eval.txt
```

`<NN>` — highest goal index in `goals-plan.md` "Proposed sequence".

Example: `goals/10-integration/`.

## Session name

`goal-<NN>-integration` — e.g., `goal-10-integration`.

## File contents

### `GOAL.md`

```md
# Goal <NN> — Integration & Edge Cases

## Objective

Confirm that every previously implemented goal works **together** and that all edge cases listed in `requirements.md` are handled correctly. This goal does not introduce new features. It only adds tests and patches whatever bugs surface during integration.

## Source of truth

- `../../requirements.md` — every section, every edge case
- `../../goals-plan.md` — full goal sequence and edge-case ownership table
- All previous `goals/NN-*/GOAL.md` files (for cross-reference)
- `./VERIFY.md` — completion gates

## Depends on

- All previous goals (`00-foundation` through `<NN-1>-<...>`).

## Allowed paths

- `goals/<NN>-integration/` (the only place new files are written)
- Any `<slug>/src/**/*.php` for bug fixes only — every change must reference an integration TC that catches the bug
- No structural changes to existing goals

## Out of scope

- Adding new features (every feature must already be in a previous goal)
- Editing previous goals' GOAL.md or VERIFY.md
- Editing `requirements.md` or `goals-plan.md`

## Acceptance criteria

- [ ] AC1: Re-running the verification protocol (`protocols/run_goal_tests.md`) for every previous goal produces zero `fail` and zero new `known_issue`. (See VERIFY.md step 3.)
- [ ] AC2: The verification protocol reports every TC `pass` for `<goal-folder>` = `goals/<NN>-integration`.
- [ ] AC3: `npm run env:cli -- eval-file goals/<NN>-integration/tests/domain.eval.txt` prints `OK`.
- [ ] AC4: Every edge case from `goals-plan.md` "Detected edge cases" is covered by either a previous goal's `tests/test_plan.md` or this goal's `tests/test_plan.md`, and that TC is `pass`.
- [ ] AC5: `WP_DEBUG_LOG` is empty after a full run of step 3.
- [ ] AC6: In a **separate disposable wp-env** (see VERIFY.md § Uninstall hygiene check), activating, deactivating, then uninstalling the plugin leaves zero orphaned options and zero orphaned custom DB tables (per clarification #4 scope). The check runs after `npm run env:clean && npm run env:start` against a freshly-reset environment so the destructive operations do not contaminate the dev wp-env used by steps 1-5 of `VERIFY.md`.

## Definition of done

- All ACs map to evidence in `PROGRESS.md`.
- <N> consecutive runs of step 3 produce identical results (verifies non-flakiness, threshold from clarification #3).
```

### `VERIFY.md`

```md
# Verify — Goal <NN> Integration

Run these in order. All must succeed.

## 1. Clean environment

```bash
npm run env:clean
npm run env:start
npm run env:cli -- plugin activate <slug>
```

## 2. Domain integration check

```bash
npm run env:cli -- eval-file goals/<NN>-integration/tests/domain.eval.txt
```

Expect `OK`.

## 3. Re-run every previous goal's test plan

Invoke the verification protocol (`protocols/run_goal_tests.md`) once per previous goal in sequence. Pass each goal folder as the argument:

```text
Follow protocols/run_goal_tests.md with <goal-folder> = goals/00-foundation
Follow protocols/run_goal_tests.md with <goal-folder> = goals/01-usXX-<slug>
Follow protocols/run_goal_tests.md with <goal-folder> = goals/02-usXX-<slug>
...
Follow protocols/run_goal_tests.md with <goal-folder> = goals/<NN-1>-<last-non-integration>
```

For each invocation, expect every TC `pass`. The protocol overwrites the goal's `test-status.json`, `test-results.md`, and `test-artifacts/`. Re-running is intentional — this is the regression sweep.

## 4. Run this goal's edge-case + cross-cutting test plan

```text
Follow protocols/run_goal_tests.md with <goal-folder> = goals/<NN>-integration
```

Expect every TC `pass`.

## 5. WP_DEBUG_LOG empty

```bash
npm run env:cli -- eval 'echo file_get_contents(WP_CONTENT_DIR . "/debug.log");'
```

Expect: empty output.

## 6. Non-flakiness check

Re-run step 3 <N-1> more times (<N> total runs, where <N> is the threshold from clarification #3). Expect identical pass results across all runs.

## 7. Uninstall hygiene check (disposable wp-env)

**Why this is its own section, not inside the main test plan or step 6 above:**

Running `wp plugin uninstall <slug>` deletes the plugin's tables, options, and code. Doing it against the dev wp-env that previous steps depend on tears down the database the next goal-replay would need and leaves wp-env in an unusable state. The check has to run against a **fresh, disposable** environment that gets discarded immediately after.

### Procedure

```bash
# 1. Tear down and rebuild a clean wp-env so any prior state is gone.
npm run env:clean
npm run env:start

# 2. Activate and configure the plugin to a representative state.
npm run env:cli -- plugin activate <slug>
# (Optional: seed minimal data so deactivation has something to clean up — e.g.,
# the smallest fixture set per `goals-plan.md` Settings catalog. Skip if the
# plugin works fully on defaults.)

# 3. Capture the pre-uninstall option/table count for the diff.
npm run env:cli -- option list --search='<slug>_*' > /tmp/pre-uninstall-options.txt
npm run env:cli -- eval 'global $wpdb; foreach ($wpdb->get_col("SHOW TABLES") as $t) { if (strpos($t, $wpdb->prefix . "<slug>_") === 0) echo $t . PHP_EOL; }' > /tmp/pre-uninstall-tables.txt

# 4. Deactivate, then uninstall.
npm run env:cli -- plugin deactivate <slug>
npm run env:cli -- plugin uninstall <slug>

# 5. Capture the post-uninstall state and diff.
npm run env:cli -- option list --search='<slug>_*' > /tmp/post-uninstall-options.txt
npm run env:cli -- eval 'global $wpdb; foreach ($wpdb->get_col("SHOW TABLES") as $t) { if (strpos($t, $wpdb->prefix . "<slug>_") === 0) echo $t . PHP_EOL; }' > /tmp/post-uninstall-tables.txt
```

**Expected:** `post-uninstall-options.txt` and `post-uninstall-tables.txt` are both empty (subject to clarification #4 carve-outs, if any).

```bash
# 6. Discard the disposable wp-env. This is the LAST step — the env is now
#    spoiled and must not be used for further goal verification.
npm run env:stop
```

After step 6, the dev wp-env that earlier `VERIFY.md` steps used is untouched. Re-running steps 1-6 of `VERIFY.md` does not require running step 7 again — uninstall hygiene is a separate evidence pass.

The protocol is **never** inlined into `tests/test_plan.md` as a TC. Test plans are executed against the dev wp-env by the verification protocol; uninstall is verified out-of-band by following the procedure above manually (or via a separate runner step in `run-goals.sh` that operates after the rest of the suite).

## Completion gate

- All 7 steps clean.
- `PROGRESS.md` maps every AC + edge case to evidence.
```

### `PROGRESS.md`

```md
# Progress — Goal <NN> Integration

## Status
Not started.

## Files changed
_none yet_

## Commands run
_none yet_

## AC → evidence

- [ ] AC1 — every previous goal's test plan green
- [ ] AC2 — this goal's test plan green
- [ ] AC3 — domain integration green
- [ ] AC4 — every edge case covered + passing
- [ ] AC5 — WP_DEBUG_LOG empty after suite run
- [ ] AC6 — uninstall hygiene
- [ ] (additional, e.g.) non-flakiness across <N> runs

## Edge case coverage

(Pull from `goals-plan.md` "Detected edge cases" — one row per edge case, with the goal that owns it.)

| Edge case | Owning goal | TC ID | Status |
|-----------|-------------|-------|--------|
| <edge case verbatim> | Goal 00 | TC-003 | TODO |
| <edge case verbatim> | Goal 05 | TC-XXX | TODO |
| ... | ... | ... | ... |

## Remaining risks / open questions
_(populated during execution)_
```

### `tests/test_plan.md`

This file holds **only** the cross-cutting / multi-goal TCs and any edge cases not already owned by a previous goal. Per-goal regression is handled by step 3 of `VERIFY.md` (re-running the verification protocol for each previous goal).

Generate one TC per cross-cutting concern. Use this template:

````md
# Test Plan — Goal <NN> Integration

**Goal:** goals/<NN>-integration
**Session:** goal-<NN>-integration
**Base URL:** `[DEV_URL]` — resolved at run time from `.wp-env.json` by `protocols/run_goal_tests.md` Step 7.5.

> **Forbidden inside this test plan:** any operation that uninstalls or destructively resets the running wp-env — `wp plugin uninstall`, `register_uninstall_hook` invocation, `wp db reset`, raw `DROP TABLE`, `register_deactivation_hook` with data-removal side effects. Uninstall hygiene is verified in the disposable-env protocol below (VERIFY.md § Uninstall hygiene check), never inside this test plan against the shared dev wp-env.

## TC-001: Smoke — full visitor flow on the homepage

**Priority:** Critical
**Depends on:** —

**Preconditions:**
- All previous goals' test plans passed
- Default settings (no overrides)
- At least 3 eligible products exist (or whatever fixture state requirements.md implies)

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `playwright-cli -s=goal-<NN>-integration goto [DEV_URL]/` | Homepage loads |
| 2 | Wait up to 15s; `playwright-cli -s=goal-<NN>-integration snapshot` | The plugin's main artifact is visible with real (not hardcoded) data |
| 3 | `playwright-cli -s=goal-<NN>-integration snapshot` (refresh refs) | Snapshot ready |
| 4 | `playwright-cli -s=goal-<NN>-integration click eN` (the dismiss/close ref, if applicable) | Artifact dismisses |
| 5 | Wait <interval>; `playwright-cli -s=goal-<NN>-integration snapshot` | (Documented post-dismiss behavior — e.g., session-suppressed, or a new artifact appears) |

**Expected outcome:** End-to-end visitor flow exercises rendering, dismiss, and the documented post-dismiss behavior simultaneously.

---

## TC-002: Cross-page state continuity

(Adapt this TC to whatever cross-page state the plugin actually maintains. The example below is for a plugin that tracks a session counter in `sessionStorage`. For other shapes — content-injection plugins that just need "settings change reflects on next page load", admin-tools that need "list state survives a page refresh", etc. — replace the steps with the equivalent assertion. Skip this TC entirely if the plugin has no meaningful cross-page state to assert.)

**Priority:** High
**Depends on:** —

**Preconditions:**
- Default settings; at least 2 distinct pages exist
- (Whatever per-page entry point the plugin operates on — homepage, single-post URL, admin list page, etc.)

**Steps (notification-style example — adapt to the plugin's shape):**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `playwright-cli -s=goal-<NN>-integration goto [DEV_URL]<first page path>` | Page loads, plugin's main artifact appears (or the relevant cross-page state is captured) |
| 2 | `playwright-cli -s=goal-<NN>-integration eval "<expression that reads the cross-page state>"` | Returns the expected first-page state value |
| 3 | `playwright-cli -s=goal-<NN>-integration goto [DEV_URL]<second page path>` | Second page loads |
| 4 | Re-read the same state expression | Returns the expected second-page state (showing whether the state persisted, advanced, or reset per the plugin's behavior) |

**Expected outcome:** The plugin's cross-page state behaves as documented in `requirements.md` when the visitor navigates between pages.

---

(Generate one TC per cross-cutting concern selected in clarification #1, plus one TC per unowned edge case from clarification #2. Cross-cutting concerns to consider:)

- Smoke — full visitor flow
- Cross-page session continuity
- Settings change takes effect on next page load
- Admin visibility + settings UI interaction (suppression while admin is logged in / on settings pages)
- Hybrid mode flag toggled mid-session (if hybrid feature exists)
- Plugin deactivation mid-page (gracefully removes artifacts)
- Empty edge cases: zero eligible products, empty location list, etc.
````

### Authoring rules

1. **No duplication.** If a TC fits naturally in a previous goal, it belongs there. This goal's `test_plan.md` is for things that genuinely span goals.
2. **Edge cases owned by a previous goal stay there.** This goal's "Edge case coverage" table in `PROGRESS.md` just *references* them.
3. **Snapshot before action**, same as per-US TCs (see `references/per-us-template.md`).
4. **Session name**: `goal-<NN>-integration` — same across all TCs in this file.
5. **No `close` step** — the orchestrator owns lifecycle.
6. **Cross-cutting TC selection** comes from clarification #1; do not invent TCs the user didn't approve.

### `tests/domain.eval.txt`

Cross-cutting domain checks that don't belong to any single goal:

```php
<?php
$failed = [];

// Check 1: every plugin-owned option uses the documented prefix
$prefix = '<slug>_';
$all = wp_load_alloptions();
$catalog_keys = [
    // populated from goals-plan.md Settings catalog
];
foreach ( $catalog_keys as $key ) {
    if ( ! array_key_exists( $key, $all ) ) {
        $failed[] = "missing catalog option: {$key}";
    }
    if ( strpos( $key, $prefix ) !== 0 ) {
        $failed[] = "option does not use prefix '{$prefix}': {$key}";
    }
}

// Check 2: plugin classes load via autoload
if ( ! class_exists( '\<Namespace>\Plugin' ) ) {
    $failed[] = "Plugin class did not autoload";
}

// Add cross-cutting integration checks here

if ( $failed ) {
    foreach ( $failed as $line ) echo "FAIL {$line}\n";
    exit( 1 );
}

echo "OK integration domain checks passed\n";
```

The `$catalog_keys` array must be populated with every option key from the Settings catalog before writing.

## Substitution rules

- `<NN>` — highest goal index from `goals-plan.md`
- `<slug>` — plugin slug
- `<Namespace>` — PascalCase namespace
- `<N>` — non-flakiness threshold from clarification #3 (default 3)
- The "Edge case coverage" table in `PROGRESS.md` — one row per edge case from `goals-plan.md`, paired with the goal that owns it (or this Integration goal if previously unowned per clarification #2)

## Sanitize + atomic write

Before printing the stop message, run the sanitizer (`references/sanitizer.md`) over the Phase 6 staging tree at `${TMPDIR}/wp-requirements-to-goals-phase6-XXXX/`. On clean pass, `mv` `goals/<NN>-integration/` into the project root. On any sanitizer hit, `rm -rf` the staging tree and abort with the violation table — the project root is unchanged.

## Stop after Integration

Print: `Goal <NN> Integration generated. Project scaffold complete.`

After this, the skill prints the final summary as documented in `SKILL.md` — total counts + next steps for running Codex `/goal` against the generated project.
