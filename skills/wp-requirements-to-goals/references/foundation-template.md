# Goal 00 Foundation Template (Phase 3)

Read this file when generating `goals/00-foundation/`. The Foundation goal lands a **walking skeleton** — a plugin that activates cleanly, registers options with documented defaults, enqueues frontend assets, and renders one hardcoded artifact end-to-end. The hardcode is intentional: later USes replace it with real logic.

## Inputs

- `./goals-plan.md` (mandatory)
- `./requirements.md`
- `./<slug>/` (the plugin bootstrap from Phase 2)

## Clarification points

Resolve via `AskUserQuestion`. The walking-skeleton question (#1) is the most plugin-specific decision in the entire skill — derive 2-3 concrete scenarios from `requirements.md` and let the user pick.

| # | Decision | Recommendation pattern |
|---|----------|------------------------|
| 1 | **Walking-skeleton scenario** — what concrete artifact demonstrates the plugin works end-to-end? | Derive from `requirements.md`: notification-style → "one hardcoded fake notification renders on homepage"; content-injection → "a sample disclosure renders before/after a sample post"; widget → "a sample widget renders in a known sidebar"; admin-tool → "a sample row appears in the admin list page". Always offer 2-3 alternatives. |
| 2 | **Visible artifact's CSS class** | Recommended: `<slug>-<noun>` where `<noun>` is the artifact type (`notification`, `disclosure`, `widget`, etc.). Alternates: shorter / branded class names. |
| 3 | **Skeleton placeholder content** (text, names, locations, sample data) | Pull from `requirements.md` if it provides example values. If not, ask the user. Don't invent names/places silently. |
| 4 | **AC3 (dependency check) applicability** | If `goals-plan.md` lists no required plugin, AC3 is omitted. Otherwise it's included. Confirm if `goals-plan.md` is ambiguous. |
| 5 | **Initial domain.eval.txt option list** | Recommended: every option from `goals-plan.md` Settings catalog with its documented default. Confirm before committing. |

## Outputs

```text
goals/00-foundation/
  GOAL.md
  VERIFY.md
  PROGRESS.md
  tests/
    test_plan.md
    domain.eval.txt
```

## Session name

`goal-00-foundation` — used in playwright-cli invocations within this goal.

## File contents

### `goals/00-foundation/GOAL.md`

```md
# Goal 00 — Foundation

## Objective

Land a working WordPress plugin scaffold for `<Plugin Name>` that:

1. Activates cleanly with no PHP warnings or errors.
2. Verifies its dependencies (e.g., <required plugin>) and shows a clean admin notice if missing.
3. Registers all options listed in the **Settings catalog** (from `goals-plan.md`) with their documented defaults.
4. Enqueues frontend assets (CSS + JS) on the public site.
5. <walking-skeleton scenario from clarification #1> — so the test plan can verify the rendering pipeline end-to-end.

This is a **walking skeleton**. No real eligibility, no real product data, no real settings UI yet. Subsequent goals replace the hardcoded artifact with real logic.

## Source of truth

- `../../requirements.md` — sections covering activation, settings list (option keys + defaults only)
- `../../goals-plan.md` — Plugin metadata, Settings catalog, Allowed paths for Goal 00
- `./VERIFY.md` — completion gates

## Depends on

Nothing. This is the first goal.

## Allowed paths

(Pull verbatim from `goals-plan.md` "Allowed paths per goal" → "Goal 00 foundation". Typical:)

- `<slug>/<slug>.php`
- `<slug>/src/Plugin.php`
- `<slug>/src/Activator.php`
- `<slug>/src/Options.php`
- `<slug>/src/Public/Assets.php`
- `<slug>/src/Public/<ArtifactClass>.php`
- `<slug>/assets/js/<artifact>.js`
- `<slug>/assets/css/<artifact>.css`
- `goals/00-foundation/`

## Out of scope

- Real eligibility filtering / generation logic
- Real product data
- Settings page UI (admin)
- Admin visibility / suppression
- Mobile / responsive layout
- Click / dismiss / cap behavior
- Any cross-cutting non-US feature (those have their own goals)

## Acceptance criteria

(If `goals-plan.md` lists no required plugin, **omit AC3 entirely and renumber AC4-AC6 down to AC3-AC5**. The renumbering must also propagate to `PROGRESS.md` AC→evidence rows and to TC IDs in `tests/test_plan.md` so all three files agree on AC count.)

- [ ] AC1: `npm run env:cli -- plugin activate <slug>` succeeds with no warnings or errors in `WP_DEBUG_LOG`.
- [ ] AC2: After activation, every option in the Settings catalog exists with its documented default. Verifiable via `npm run env:cli -- option get <option_key>` for each option key.
- [ ] AC3: If a required plugin is declared in `goals-plan.md` and is inactive, the plugin self-disables gracefully and shows an admin notice. (Omit this AC entirely and renumber down if no required plugin.)
- [ ] AC4: Visiting the public site in a logged-out browser session loads the plugin's CSS and JS.
- [ ] AC5: <walking-skeleton scenario from clarification #1, with placeholder content from clarification #3 stated concretely. Phrase it in the artifact-shape's natural language — for a notification: "one hardcoded notification with name 'Sarah', location 'London', product 'Test Product' renders on the homepage"; for a content-injection: "a sample reading-time indicator '5 min read' renders below the title of a sample single post"; for a widget: "a sample widget renders in the primary sidebar"; for an admin-tool: "a sample row appears in the admin list page". Stay close to what the user picked in clarification #1 and reuse the placeholder names from #3 verbatim>.
- [ ] AC6: The artifact renders inside a container with a stable CSS class (`.<artifact-class>`) so future goals can target it.

## Definition of done

- All 6 ACs (or 5 if AC3 omitted) map to evidence in `PROGRESS.md`. After renumbering, the PROGRESS.md AC list and test_plan.md TC IDs must match GOAL.md exactly — no AC1, AC2, AC4, AC5, AC6 skip pattern.
- `tests/domain.eval.txt` prints `OK`.
- The verification protocol (`protocols/run_goal_tests.md`) reports every TC `pass` for `<goal-folder>` = `goals/00-foundation`.
- No PHP errors in `wp-content/debug.log`.
```

### `goals/00-foundation/VERIFY.md`

```md
# Verify — Goal 00 Foundation

Run these in order. All must succeed before marking the goal complete.

## 1. wp-env up

```bash
npm run env:start
```

## 2. Plugin activates cleanly

```bash
npm run env:cli -- plugin activate <slug>
npm run env:cli -- plugin list --status=active
```

Expect `<slug>` in the active list. No warnings printed.

## 3. Domain check (options registered with defaults)

```bash
npm run env:cli -- eval-file goals/00-foundation/tests/domain.eval.txt
```

Expect: `OK` printed at the end, no `FAIL` lines.

## 4. Browser test plan

Follow the verification protocol at `protocols/run_goal_tests.md` with `<goal-folder>` = `goals/00-foundation`.

The protocol opens session `goal-00-foundation`, executes every TC sequentially, and writes:
- `goals/00-foundation/test-status.json`
- `goals/00-foundation/test-results.md`
- `goals/00-foundation/test-artifacts/<TC>/recording.webm` + `console.log`

Expect: every TC `pass` (no `fail`, no `known_issue`).

## 5. Manual sanity (optional)

- Open the dev URL in incognito (see `_shared/project-config.md` § Environment → `DEV_URL`; defaults to `http://localhost:8888`).
- Within ~10 seconds, the hardcoded <artifact> appears.
- No JS console errors.

## Completion gate

- Steps 2, 3, and 4 all clean.
- `PROGRESS.md` updated with the ACs mapped to evidence (file paths, command output, links to recording.webm).
```

### `goals/00-foundation/PROGRESS.md`

If a required plugin is declared, use this 6-row form:

```md
# Progress — Goal 00 Foundation

## Status
Not started.

## Files changed
_none yet_

## Commands run
_none yet_

## AC → evidence

- [ ] AC1 — clean activation
- [ ] AC2 — options registered with defaults
- [ ] AC3 — dependency check
- [ ] AC4 — assets enqueued
- [ ] AC5 — walking skeleton renders
- [ ] AC6 — stable CSS hook

## Remaining risks / open questions
_(populated during execution)_
```

If no required plugin (AC3 omitted from GOAL.md), use this 5-row form — note the renumbering so PROGRESS.md matches GOAL.md:

```md
# Progress — Goal 00 Foundation

## Status
Not started.

## Files changed
_none yet_

## Commands run
_none yet_

## AC → evidence

- [ ] AC1 — clean activation
- [ ] AC2 — options registered with defaults
- [ ] AC3 — assets enqueued
- [ ] AC4 — walking skeleton renders
- [ ] AC5 — stable CSS hook

## Remaining risks / open questions
_(populated during execution)_
```

### `goals/00-foundation/tests/test_plan.md`

Generate one TC per AC (5 if AC3 omitted, 6 otherwise). **TC IDs must match the AC numbering after any renumbering** — if AC3 is omitted and the AC list is AC1-AC5, the TC IDs are TC-001 through TC-005 covering each AC in order. Never emit `TC-001, TC-002, TC-004, TC-005, TC-006` with a gap. Use exactly this format:

````md
# Test Plan — Goal 00 Foundation

**Goal:** goals/00-foundation
**Session:** goal-00-foundation
**Base URL:** `[DEV_URL]` — resolved at run time from `.wp-env.json` by `protocols/run_goal_tests.md` Step 7.5.
**Admin:** `[ADMIN_URL]` (credentials: `[ADMIN_USER]` / `[ADMIN_PASSWORD]` — see `_shared/project-config.md` § Test Credentials)

> **Forbidden inside this test plan:** any operation that uninstalls or destructively resets the running wp-env — `wp plugin uninstall`, `register_uninstall_hook` invocation, `wp db reset`, raw `DROP TABLE`. Uninstall hygiene belongs in the integration goal's disposable-env protocol, never here.

## TC-001: Plugin activates cleanly (AC1)

**Priority:** Critical
**Depends on:** —

**Preconditions:**
- wp-env running
- Plugin code present at `<slug>/<slug>.php`
- `WP_DEBUG_LOG` is empty

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `npm run env:cli -- plugin activate <slug>` | Command exits 0; plugin appears in active list |
| 2 | `npm run env:cli -- plugin list --status=active` | `<slug>` is listed |
| 3 | `npm run env:cli -- eval 'echo file_get_contents(WP_CONTENT_DIR . "/debug.log");'` | No PHP warnings or errors |

**Expected outcome:** Plugin active with no errors in debug log.

---

## TC-002: Options registered with defaults (AC2)

**Priority:** Critical
**Depends on:** TC-001

**Preconditions:**
- Plugin activated

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `npm run env:cli -- eval-file goals/00-foundation/tests/domain.eval.txt` | Prints `OK` followed by option count |

**Expected outcome:** Every Settings catalog option exists with the documented default.

---

## TC-003: Dependency check (AC3)

(Include only if `goals-plan.md` lists a required plugin. Otherwise skip and renumber subsequent TCs.)

**Priority:** High
**Depends on:** TC-001

**Preconditions:**
- Plugin activated
- `<required-plugin>` activated

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `npm run env:cli -- plugin deactivate <required-plugin>` | Required plugin deactivated |
| 2 | `playwright-cli -s=goal-00-foundation goto [ADMIN_URL]` | Admin loads |
| 3 | `playwright-cli -s=goal-00-foundation snapshot` | Snapshot shows the dependency-missing notice with text mentioning `<required-plugin>` |
| 4 | `npm run env:cli -- plugin activate <required-plugin>` | Restore for subsequent TCs |

**Expected outcome:** Plugin self-disables and surfaces an admin notice; reactivating the dependency restores normal operation.

---

## TC-004: Assets enqueued on the homepage (AC4)

**Priority:** High
**Depends on:** TC-001

**Preconditions:**
- Plugin activated

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `playwright-cli -s=goal-00-foundation goto [DEV_URL]/` | Homepage loads |
| 2 | `playwright-cli -s=goal-00-foundation network` | Network log includes a `<slug>` CSS file (200) and `<slug>` JS file (200) |

**Expected outcome:** Plugin CSS and JS load on the public homepage.

---

## TC-005: Walking skeleton renders (AC5)

**Priority:** Critical
**Depends on:** TC-004

**Preconditions:**
- Plugin activated, homepage in browser

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `playwright-cli -s=goal-00-foundation goto [DEV_URL]/` | Homepage loads |
| 2 | Wait up to 15s; `playwright-cli -s=goal-00-foundation snapshot` | Snapshot shows an element with class `<artifact-class>` containing the placeholder content from clarification #3 |
| 3 | `playwright-cli -s=goal-00-foundation eval "document.querySelector('.<artifact-class>').textContent"` | Returns a string containing each placeholder field |

**Expected outcome:** Hardcoded walking-skeleton artifact visible with the documented placeholder content.

---

## TC-006: Stable CSS hook (AC6)

**Priority:** Medium
**Depends on:** TC-005

**Preconditions:**
- Walking skeleton rendered

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `playwright-cli -s=goal-00-foundation eval "document.querySelectorAll('.<artifact-class>').length"` | Returns >= 1 |

**Expected outcome:** Future goals can reliably target the artifact via the documented CSS class.
````

### `goals/00-foundation/tests/domain.eval.txt`

```php
<?php
// Verify every option from the Settings catalog exists with its documented default.

$expected = [
    // 'option_key' => 'expected_default',
    // ← populated from goals-plan.md Settings catalog
];

$failed = [];
foreach ( $expected as $key => $default ) {
    $value = get_option( $key, '__MISSING__' );
    if ( $value === '__MISSING__' ) {
        $failed[] = "MISSING: {$key}";
        continue;
    }
    if ( $value !== $default ) {
        $failed[] = "MISMATCH: {$key} got " . var_export( $value, true ) . " expected " . var_export( $default, true );
    }
}

if ( $failed ) {
    foreach ( $failed as $line ) echo "FAIL {$line}\n";
    exit( 1 );
}

echo "OK " . count( $expected ) . " options verified\n";
```

The `$expected` array **must** be populated with every option from the Settings catalog before the file is written. An empty array passes vacuously and silently; that's a bug.

## Substitution rules

- `<Plugin Name>` — display name from `goals-plan.md`
- `<slug>` — slug from `goals-plan.md`
- `<Namespace>` — PascalCase namespace
- `<required-plugin>` — required plugin slug from `goals-plan.md` (omit AC3 + TC-003 entirely if none)
- `<artifact-class>` — clarification #2 answer (default `<slug>-<noun>`)
- `<artifact>` — the artifact type (`notification`, `disclosure`, `widget`, `row`, etc.)
- The walking-skeleton scenario in AC5 + TC-005 — clarification #1 answer with placeholder content from #3
- "Allowed paths" in `GOAL.md` — mirror per-goal paths from `goals-plan.md`

## Sanitize + atomic write

Before printing the stop message, run the sanitizer (`references/sanitizer.md`) over the Phase 3 staging tree at `${TMPDIR}/wp-requirements-to-goals-phase3-XXXX/`. On clean pass, `mv` `goals/00-foundation/` into the project root. On any sanitizer hit, `rm -rf` the staging tree and abort with the violation table — the project root is unchanged.

## Stop after Foundation

Print: `Goal 00 Foundation generated.`

In phased mode, do not stop — Phase 3 is not a checkpoint. In one-shot mode, continue to Phase 4 immediately with a one-line progress note.
