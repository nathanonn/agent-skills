# Per-User-Story Goal Template (Phase 4)

Read this file when generating each `goals/<NN>-<us-id>-<slug>/` folder. Iterate over every US in `goals-plan.md` "Proposed sequence" in the listed order; this file applies to each one.

## Inputs (per US)

- `./goals-plan.md` (mandatory)
- `./requirements.md` (mandatory — for verbatim AC text and edge case wording)
- The target US ID (e.g., `US-03`) and goal index (e.g., `03`) from the proposed sequence

## Clarification points (per US)

Resolve via `AskUserQuestion`. Some are asked once across the whole phase, not per US — see notes below.

| # | Decision | Recommendation pattern |
|---|----------|------------------------|
| 1 | **TC priority** for each AC and edge case in this US | Recommended: pull from `goals-plan.md` per-US priority if stated; otherwise `Critical` for AC1/the headline behavior, `High` for other ACs, `Medium` for edge cases. Always confirm. |
| 2 | **Test data values** for any AC placeholder | If `requirements.md` mentions concrete values (e.g., `display_duration: 5s`), use them. If the AC uses abstract terms ("a reasonable interval"), ask the user for concrete values. |
| 3 | **Ambiguous AC interpretation** | If an AC's text could be tested in two materially different ways (e.g., "the notification dismisses smoothly" — what counts as smooth?), ask the user to pick the interpretation. Provide 2 concrete test approaches as options. |
| 4 | **Fixture mechanism** (asked once, in the first US that needs sample data) | Recommended: `npm run env:cli -- import <path>` for any sample data. Alternates: REST helper endpoint, PHP fixture file, Playwright `route` mocking. After the first US settles this, reuse the answer for all later USes. |
| 5 | **Viewport behavior** (only for USes mentioning responsive / breakpoint) | Recommended: explicit `playwright-cli resize <w> <h>` step in TCs. Confirm breakpoint values from `requirements.md`; ask if not stated. |

## Outputs (per US)

```text
goals/<NN>-<us-id>-<slug>/
  GOAL.md
  VERIFY.md
  PROGRESS.md
  tests/
    test_plan.md
    domain.eval.txt
```

`<NN>` — zero-padded goal index from `goals-plan.md`.
`<us-id>` — US identifier in lowercase (e.g., `us03`).
`<slug>` — kebab-case slug derived from the US title.

Example: `goals/03-us03-dismiss-and-suppress/`.

## Session name

`goal-<NN>-<us-id>-<slug>` — e.g., `goal-03-us03-dismiss-and-suppress`.

## File contents

### `GOAL.md`

```md
# Goal <NN> — <US-ID>: <Title>

## Objective

Implement <US-ID> from `requirements.md` exactly.

## Source of truth

- `../../requirements.md` — section "<US-ID>: <Title>" (and any edge case rows owned by this US per `goals-plan.md`)
- `../../goals-plan.md` — Allowed paths and dependencies for this goal
- `./VERIFY.md` — completion gates

## Depends on

(Pull verbatim from `goals-plan.md` "Proposed sequence" → "Depends on" column for this goal's row.)

- Goal 00 Foundation (always)
- (other goals listed)

## Allowed paths

(Pull verbatim from `goals-plan.md` "Allowed paths per goal" → this goal's section.)

## Out of scope

List the USes / features that this goal must NOT modify. Pull from the "Owns" column of other goals in `goals-plan.md` "Proposed sequence". One bullet per other goal.

## Acceptance criteria

(Copy verbatim from `requirements.md` under <US-ID>'s Acceptance Criteria. Convert to checklist with `- [ ]`. Append edge cases owned by this US per `goals-plan.md` "Detected edge cases".)

- [ ] AC1: <verbatim text from requirements.md>
- [ ] AC2: <verbatim text>
- [ ] AC3: <verbatim text>

(Edge cases for this US, from `goals-plan.md`:)

- [ ] Edge: <verbatim edge case>

## Definition of done

- Every AC and edge case has evidence in `PROGRESS.md`.
- `tests/domain.eval.txt` prints `OK` (or is a no-op stub if the goal is pure-frontend).
- The verification protocol (`protocols/run_goal_tests.md`) reports every TC `pass` for `<goal-folder>` = `goals/<NN>-<us-id>-<slug>`.
- No regressions in earlier goals (verified at the Integration goal stage).
```

### `VERIFY.md`

```md
# Verify — Goal <NN> <US-ID>

Run these in order. All must succeed.

## 1. wp-env up

```bash
npm run env:start
```

(Skip if already running.)

## 2. Domain check (only if this goal touches PHP domain logic)

```bash
npm run env:cli -- eval-file goals/<NN>-<us-id>-<slug>/tests/domain.eval.txt
```

Expect `OK` at the end. If this goal is pure-frontend, the file is a no-op stub and still prints `OK`.

## 3. Browser test plan

Follow the verification protocol at `protocols/run_goal_tests.md` with `<goal-folder>` = `goals/<NN>-<us-id>-<slug>`.

The protocol opens session `goal-<NN>-<us-id>-<slug>`, executes every TC sequentially, and writes:
- `goals/<NN>-<us-id>-<slug>/test-status.json`
- `goals/<NN>-<us-id>-<slug>/test-results.md`
- `goals/<NN>-<us-id>-<slug>/test-artifacts/<TC>/recording.webm` + `console.log`

Expect: every TC `pass`.

## 4. Manual smoke (suggested, not gating)

- (One or two terse manual steps that mirror the highest-value AC.)
- Confirm no JS console errors in DevTools.

## Completion gate

- Steps 2 and 3 are clean.
- `PROGRESS.md` maps every AC and edge case to evidence.
- (If any AC mentions a viewport breakpoint, mention here that the relevant TCs in test_plan.md include a `playwright-cli resize` step.)
```

### `PROGRESS.md`

```md
# Progress — Goal <NN> <US-ID>

## Status
Not started.

## Files changed
_none yet_

## Commands run
_none yet_

## AC → evidence

- [ ] AC1 — <one-line restatement>
- [ ] AC2 — ...
- [ ] AC3 — ...

(Edge cases mirroring GOAL.md):
- [ ] Edge: <edge case> — ...

## Remaining risks / open questions
_(populated during execution)_
```

### `tests/test_plan.md`

Generate one TC per AC, plus one TC per edge case owned by this US (per `goals-plan.md` "Detected edge cases" with this US as owner).

````md
# Test Plan — Goal <NN> <US-ID> <Title>

**Goal:** goals/<NN>-<us-id>-<slug>
**Session:** goal-<NN>-<us-id>-<slug>
**Base URL:** `[DEV_URL]` — resolved at run time from `.wp-env.json` (`port` key, default 8888) by `protocols/run_goal_tests.md` Step 7.5.
**Admin:** `[ADMIN_URL]` (credentials: `[ADMIN_USER]` / `[ADMIN_PASSWORD]` — see `_shared/project-config.md` § Test Credentials)

> **Forbidden inside this test plan:** any operation that uninstalls or destructively resets the running wp-env — `wp plugin uninstall`, `register_uninstall_hook` invocation, `wp db reset`, raw `DROP TABLE`, `register_deactivation_hook` with data-removal side effects. Uninstall hygiene is verified in the disposable-env protocol referenced by the integration goal, never inside per-goal test plans against the shared dev wp-env.

## TC-001: <verbatim AC1 text condensed to a phrase> (AC1)

**Priority:** Critical | High | Medium | Low
**Depends on:** —

**Preconditions:**
- Goal 00 Foundation passed
- (any options that must be set before this TC, e.g., `npm run env:cli -- option update <slug>_enabled 1`)
- (any fixture state, e.g., "at least one in-stock product exists")

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `playwright-cli -s=<session-name> goto [DEV_URL]<path>` | Page loads |
| 2 | `playwright-cli -s=<session-name> snapshot` | Snapshot shows <expected DOM state> |
| 3 | `playwright-cli -s=<session-name> click eN` (use ref from prior snapshot) | <expected outcome> |
| 4 | `playwright-cli -s=<session-name> snapshot` | Snapshot confirms <state change> |
| 5 | `playwright-cli -s=<session-name> eval "<JS expression>"` | Returns <expected value> |

**Expected outcome:** <verbatim AC behavior>

**Constants from requirements.md:**
- (Any numeric values from this AC, e.g., `display_duration: 5s`, `mobile breakpoint: 768px`)

---

## TC-002: <verbatim AC2 text condensed> (AC2)

(Same shape, one TC per AC.)

---

## TC-EDGE-1: <edge case verbatim> (Edge)

**Priority:** Medium
**Depends on:** TC-001 (or whichever AC TC sets up the prior state)

**Preconditions:**
- (Edge-specific setup — e.g., "set `<option>` to 0", "deactivate <required plugin>")

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | (setup command) | (state confirmed) |
| 2 | `playwright-cli -s=<session-name> goto <url>` | Page loads |
| 3 | `playwright-cli -s=<session-name> snapshot` | Snapshot confirms documented edge behavior |

**Expected outcome:** <verbatim edge case behavior>
````

### TC examples are illustrative — adapt to the plugin's shape

The TC template above uses a generic shape that loosely matches a notification-style frontend plugin (visit a page, see an artifact, click something). For other plugin shapes:

- **Content-injection** (reading time, affiliate disclosure, schema markup): the entry-point URL is usually a single-post URL like `?p=<known-post-id>`, not the homepage. The artifact appears inside the post markup, not as a popup.
- **Admin-tool** (settings page, custom post-type list, bulk action): the entry-point URL is `/wp-admin/<page>`, the user is logged in as admin, and assertions usually check form fields, table rows, and option values via `npm run env:cli -- option get <key>`.
- **Block / widget** (Gutenberg block, sidebar widget): assertions inspect rendered block markup or widget area DOM at a known URL.
- **Background / cron** (scheduled tasks, batch jobs): the TC may need to trigger the cron event manually (`npm run env:cli -- cron event run <hook>`) and assert a side effect rather than a visible artifact.

Use the shape that fits the spec. Don't force a homepage-and-popup pattern onto a content-injection plugin or an admin-tool plugin — it'll create TCs that exercise the wrong code path.

### Authoring rules for `test_plan.md`

1. **One TC per AC.** Always. No grouping, no skipping.
2. **One TC per edge case — unless functionally already covered by an AC TC.** If an edge case row is just a more-specific phrasing of an AC's behavior (e.g., AC says "session cap caps at N" and the edge says "session cap = 0 means no notifications"), and the AC TC's preconditions can already exercise the edge state via a parameter change, you may merge: list the edge case in the AC TC's "Edge variants" sub-list and add a final step that re-runs the assertion under the edge precondition. When you merge, note in `PROGRESS.md` AC→evidence that the edge maps to the same TC. Never silently drop an edge case — it must show up in either its own TC or an AC TC's Edge variants list.
3. **AC text and edge case text are verbatim** from `requirements.md`. Do not paraphrase.
4. **Snapshot before every interactive command.** Refs (`e1`, `e5`) come from the most recent snapshot. Always include a `snapshot` step before `click`/`fill`/`select`/`check`/`hover`/`dblclick`/`drag`/`upload`.
5. **Use `playwright-cli eval` for DOM assertions** when a snapshot ref-based assertion isn't precise enough (counts, `textContent`, computed styles).
6. **Use `playwright-cli network` for asset / request assertions** (e.g., "plugin CSS loaded").
7. **Use `playwright-cli resize <w> <h>` and `playwright-cli eval` for viewport-dependent ACs** (e.g., mobile breakpoint behavior). Don't assume a Playwright projects config exists — it doesn't.
8. **WP option setup** uses `npm run env:cli -- option update <key> <value>` in the preconditions section, not in the steps.
9. **Fixture loading** uses `npm run env:cli -- import <path>` in the preconditions, with a `// TODO: load fixtures` note if the fixture file isn't yet generated.
10. **Session name** is the same across all TCs in this file: `goal-<NN>-<us-id>-<slug>`.
11. **Dependencies** (`Depends on`) reflect TC ordering within this goal. TCs that share preconditions can declare them.
12. **No close** — do not include a `playwright-cli close` step. The orchestrator owns session lifecycle.

### `tests/domain.eval.txt`

Generate this file **only if this US touches PHP domain logic** (eligibility, generation, hybrid, etc.). If pure-frontend (e.g., a click/dismiss/mobile US), still create the file as a no-op:

```php
<?php
echo "OK no domain checks for this US\n";
```

Otherwise, structure it as discrete checks, each printing `OK <check_name>` or `FAIL <reason>`. The script must `exit(1)` on any failure. Example:

```php
<?php
$failed = [];

// Check 1: eligible product pool is non-empty when products exist
$pool = call_user_func( [ '\<Namespace>\Eligibility', 'pool' ] );
if ( ! is_array( $pool ) || count( $pool ) === 0 ) {
    $failed[] = "eligible pool empty when it should not be";
}

// Check 2: out-of-stock products are excluded
// ... etc

if ( $failed ) {
    foreach ( $failed as $line ) echo "FAIL {$line}\n";
    exit( 1 );
}

echo "OK domain checks passed\n";
```

## Substitution rules

For every file generated:

- `<NN>` — zero-padded goal index
- `<US-ID>` — uppercase form (e.g., `US-03`)
- `<us-id>` — lowercase form (e.g., `us03`)
- `<Title>` — US title from `goals-plan.md`
- `<slug>` — plugin slug
- `<Namespace>` — PascalCase namespace
- `<session-name>` — `goal-<NN>-<us-id>-<slug>`
- AC text — copy **verbatim** from `requirements.md`. Do not paraphrase.
- Edge cases — pull rows where this US is the owner from `goals-plan.md` "Detected edge cases"
- Allowed paths — copy verbatim from `goals-plan.md` "Allowed paths per goal"
- Depends on — copy from `goals-plan.md` "Proposed sequence" "Depends on" column

## Sanitize + atomic write (per US)

After staging each US's goal folder to `${TMPDIR}/wp-requirements-to-goals-phase4-<NN>-XXXX/`, run the sanitizer (`references/sanitizer.md`). On clean pass, `mv` `goals/<NN>-<us-id>-<slug>/` into the project root. On any sanitizer hit, `rm -rf` the staging tree and abort with the violation table — the project root is unchanged for that US (USes already shipped earlier in this phase remain).

## Stop after each US

After each US, print: `Goal <NN> <US-ID> generated.`

After running for every US, in phased mode do not stop — continue to Phase 5. In one-shot mode, continue with a one-line progress note.
