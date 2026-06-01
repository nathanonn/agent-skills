# Non-US Feature Goal Template (Phase 5)

Read this file when generating each `goals/<NN>-<feature-slug>/` folder. Iterate over every non-US feature in `goals-plan.md` "Detected non-US features", in the order listed under "Proposed sequence".

If `goals-plan.md` lists no non-US features, **skip Phase 5 entirely** and go to Phase 6.

Common non-US features:

- Alternate data sources (e.g., hybrid mode pulling real orders)
- Optional integration toggles
- Privacy / compliance controls
- Settings groups with their own logic (not just UI)
- Background sync / cron jobs
- Bulk import / export

## Inputs (per feature)

- `./goals-plan.md` (mandatory)
- `./requirements.md` (mandatory)
- The target feature ID (e.g., `FEAT-hybrid-mode`) and goal index (e.g., `09`) from the proposed sequence

## Clarification points (per feature)

Non-US features have ACs **derived from prose** (not copied verbatim from a tagged AC list), so the agent has more interpretive latitude here. That latitude is exactly where wrong assumptions creep in. Resolve via `AskUserQuestion` before writing any file.

| # | Decision | Recommendation pattern |
|---|----------|------------------------|
| 1 | **AC list derived from prose** — confirm before locking | Read the relevant `requirements.md` section. Synthesize 2-6 testable ACs. Show the proposed list to the user with `(Recommended)` on the most critical, ask: "Are these the ACs for this feature, or should I add/remove/reword anything?" |
| 2 | **Cross-cutting behavior signals** — how the feature exposes "real vs simulated" / "feature-on vs feature-off" / "primary vs fallback" to tests | Recommended: a `data-` attribute on the visible artifact (e.g., `data-source="real"` vs `data-source="simulated"`). Alternates: separate CSS classes, separate selectors. Ask the user to pick — the test plan needs to disambiguate somehow. |
| 3 | **Fixture data source** | If the feature needs sample data (e.g., real WC orders for hybrid mode), ask for the source: ship a fixtures CSV/JSON in `fixtures/`, generate via wp-cli on demand, or rely on the user's existing test data. |
| 4 | **TC priority** for derived ACs | Recommended: `High` for primary feature behavior, `Medium` for fallback/edge cases. Always confirm. |

## Outputs (per feature)

```text
goals/<NN>-<feature-slug>/
  GOAL.md
  VERIFY.md
  PROGRESS.md
  tests/
    test_plan.md
    domain.eval.txt
```

`<feature-slug>` — the feature ID stripped of `FEAT-` prefix (e.g., `hybrid-mode`).

Example: `goals/09-hybrid-mode/`.

## Session name

`goal-<NN>-<feature-slug>` — e.g., `goal-09-hybrid-mode`.

## File contents

The structure mirrors per-US goals (read `references/per-us-template.md` for the base shape). Differences below.

### `GOAL.md` — differences from per-US

- **Title** uses the feature name, not a US ID. Example: `# Goal 09 — Hybrid Mode (Real Orders)`
- **Source of truth** points to the `requirements.md` section(s) describing the feature
- **Acceptance criteria** are derived from the prose description, not copied from a tagged AC list. Read the section carefully and synthesize a checklist where each item is testable. Each AC should reference the source paragraph for traceability.

Example AC derivation pattern:

> Source paragraph: *"Real orders are intermixed with simulated notifications. There is no fixed ratio. If no eligible real orders exist, fall back to 100% simulated."*

```md
- [ ] AC1: Real and simulated notifications are intermixed in a single visitor session (no consecutive run of one type beyond a small natural variance). [Source: <section>, paragraph 3]
- [ ] AC2: When zero eligible real orders exist, all notifications shown are simulated, and the visitor sees no admin warning or error. [Source: <section>, paragraph 3]
```

The `[Source: ...]` reference is part of the AC text — it travels with the AC into `PROGRESS.md`'s evidence table.

### `VERIFY.md` — differences from per-US

Step 3 invokes the verification protocol with this goal's path:

```text
Follow protocols/run_goal_tests.md with <goal-folder> = goals/<NN>-<feature-slug>.
```

Add a fixtures setup step **before** step 3 if the feature requires sample data:

````md
## 2.5 Load fixtures (one-time per environment)

```bash
npm run env:cli -- import goals/<NN>-<feature-slug>/tests/fixtures/orders.csv --type=woocommerce_order
```

Or if fixtures live in the project-root `fixtures/` directory (mounted into wp-env at `/wp-content/uploads/fixtures/`):

```bash
npm run env:cli -- import fixtures/orders.csv --type=woocommerce_order
```
````

### `tests/test_plan.md` — differences from per-US

The same uninstall-safety contract that `references/per-us-template.md` documents applies here: the `Forbidden inside this test plan` header must be present at the top of every non-US `test_plan.md`. Banned operations (`wp plugin uninstall`, `register_uninstall_hook`, `wp db reset`, `DROP TABLE`) belong to the integration goal's disposable-env protocol, not to any per-feature test plan. The Base URL line uses the `[DEV_URL]` placeholder for the same reason — runtime port resolution via `protocols/run_goal_tests.md` Step 7.5.


For a hybrid-mode-style feature, TCs typically need:

- A precondition that **enables the feature flag** (e.g., `npm run env:cli -- option update <slug>_mode hybrid`)
- A precondition that **seeds real data** (fixtures) — referenced by file path
- An assertion across **multiple notification cycles** to catch blending behavior

Use a TC pattern like:

````md
## TC-001: Real and simulated notifications intermix (AC1)

**Priority:** High
**Depends on:** —

**Preconditions:**
- Feature flag enabled: `npm run env:cli -- option update <slug>_mode hybrid`
- Sample real orders loaded (see VERIFY.md step 2.5)
- At least 5 eligible products

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `playwright-cli -s=goal-<NN>-<feature-slug> goto [DEV_URL]/` | Homepage loads |
| 2 | Loop the next 4 actions 8 times to collect a sample of notifications: | |
| 2a | `playwright-cli -s=goal-<NN>-<feature-slug> snapshot` | Snapshot taken (used for waits, not artifact) |
| 2b | `playwright-cli -s=goal-<NN>-<feature-slug> eval "document.querySelector('.<slug>-notification')?.dataset.source"` | Returns either `real` or `simulated` (collect the value) |
| 2c | Wait for the notification to dismiss before the next cycle | Notification element disappears |
| 3 | After collecting 8 values, assert at least 1 `real` and at least 1 `simulated` appeared | Both data sources represented |

**Expected outcome:** Across multiple cycles, the visitor sees a mix of real and simulated notifications with no fixed ratio.

**Notes for the implementer:** the code should expose a `data-source` attribute on each notification (`real` or `simulated`) so this TC can disambiguate without inspecting full content. If the implementer chooses a different mechanism, this TC's eval step needs to be updated accordingly.
````

Each TC must follow the playwright-cli rules from `references/per-us-template.md` (snapshot before action, no `close`, etc.).

### `tests/domain.eval.txt` — differences from per-US

Non-US features almost always have a domain-logic component. Write `wp eval` checks that exercise the feature's pure-PHP entry points:

```php
<?php
$failed = [];

// Check: eligible_orders() returns only orders matching the documented filters
$orders = call_user_func( [ '\<Namespace>\<FeatureClass>', 'eligible_orders' ] );
if ( ! is_array( $orders ) ) {
    $failed[] = "eligible_orders() did not return an array";
}

// Add per-rule checks pulled from requirements.md prose

if ( $failed ) {
    foreach ( $failed as $line ) echo "FAIL {$line}\n";
    exit( 1 );
}

echo "OK <feature-slug> domain checks passed\n";
```

If the feature is purely a UI toggle with no PHP entry point of its own (rare for non-US features), still create `domain.eval.txt` as a no-op:

```php
<?php
echo "OK no domain checks for this feature\n";
```

## Substitution rules

Same as per-US, plus:

- `<Feature Name>` — display name from `goals-plan.md` "Detected non-US features"
- `<feature-slug>` — feature ID stripped of `FEAT-` prefix
- `<FeatureClass>` — PascalCase form for the implementing class (e.g., `HybridMode`)
- `<session-name>` — `goal-<NN>-<feature-slug>`
- AC list — derived by reading the relevant `requirements.md` section, not copied verbatim. Each AC must reference its source paragraph.

## Sanitize + atomic write (per feature)

After staging each feature's goal folder to `${TMPDIR}/wp-requirements-to-goals-phase5-<NN>-XXXX/`, run the sanitizer (`references/sanitizer.md`). On clean pass, `mv` `goals/<NN>-<feature-slug>/` into the project root. On any sanitizer hit, `rm -rf` the staging tree and abort with the violation table — features already shipped earlier in this phase remain in the project root.

## Stop after each non-US feature

After each feature, print: `Goal <NN> <Feature Name> generated.`

After running for every non-US feature, continue to Phase 6.
