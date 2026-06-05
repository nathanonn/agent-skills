# VERIFY.md template — Phaser 3 web game (state bridge verification)

Read this file when generating `goals/<NN>-<slug>/VERIFY.md`. The verification approach is state bridge: the game exposes internal state via `window.__GAME_STATE__` every frame, and Playwright tests read it via `page.evaluate()`. Canvas games cannot be verified via DOM assertions — the state bridge is the primary verification mechanism.

Substitute every `{{...}}` placeholder with confirmed values. If a section doesn't apply, write `Not applicable.` plus a one-line reason and keep the section.

Key conventions:
- VERIFY.md DESCRIBES test scenarios. /goal writes the actual `.spec.ts` files in `tests/game/`.
- MUST tier checks use M-XXX IDs (e.g., M-001, M-002).
- SHOULD tier checks use S-XXX IDs (e.g., S-001, S-002).
- NICE tier checks use N-XXX IDs (e.g., N-001, N-002).
- Every check maps to one or more ACs from GOAL.md via `Maps to: AC-XX.X`.
- Evidence tables have EMPTY cells — /goal populates them at completion time.

---

````md
# VERIFY.md — {{Goal Name}}

## 1. Setup

Before running any checks:

1. Run `npm install` (dependencies must be present).
2. Confirm `src/state-bridge.ts` exists and exposes `window.__GAME_STATE__`.
3. Confirm `tests/game/helpers.ts` exists with `getGameState()`, `waitForScene()`, and `pressKey()` helpers.
4. Confirm `tests/playwright.config.ts` has `webServer` configured for `npm run dev` on port 8080.
{{5. Additional prerequisites specific to this goal, or remove this line.}}

If any prerequisite fails, fix it before proceeding — subsequent checks will produce misleading results.

## 2. Dev Server

The Vite dev server must be running for all checks.

- **Start command**: `npm run dev`
- **URL**: `http://localhost:8080`
- **Health check**: navigate to `http://localhost:8080` and confirm the Phaser canvas renders.
- **Auto-start**: Playwright's `webServer` config in `tests/playwright.config.ts` starts the dev server automatically during `npm test`. No manual start needed for automated checks.

If the dev server fails to start, check `vite.config.ts` for port conflicts and confirm `npm install` completed.

## 3. Verification Tiers

This goal uses three verification tiers:

| Tier | Label | Method | Required? |
|------|-------|--------|-----------|
| **MUST** | State bridge assertions | `page.evaluate(() => window.__GAME_STATE__)` in Playwright | Yes — goal fails without these |
| **SHOULD** | Visual screenshots | `page.screenshot()` for human review | Yes — but human judges pass/fail |
| **NICE** | Edge cases / polish | Optional checks for polish quality | No — bonus |

**MUST** checks are hard pass/fail gates. If any MUST check fails, the goal is not complete.

**SHOULD** checks capture visual evidence. A human reviews the screenshots — there is no automated assertion on pixel content. /goal must still capture them.

**NICE** checks cover edge cases and polish. They improve confidence but are not required for goal completion.

## 4. Automated Checks (MUST tier)

State bridge assertions via Playwright. Each check describes a test scenario that /goal must implement as a `.spec.ts` file in `tests/game/`.

Available helpers from `tests/game/helpers.ts`:

```typescript
getGameState(page)        // returns window.__GAME_STATE__
waitForScene(page, key)   // waits until __GAME_STATE__.scene === key
pressKey(page, key, ms)   // keyDown, wait, keyUp
```

{{Generate one check block per MUST-tier AC. Use M-XXX IDs starting at M-001.}}

### Check M-001 — {{AC ID}}: {{description}}

**Scenario**: {{What the test simulates.}}
**State bridge fields**: `{{field1}}`, `{{field2}}`
**Actions**:
1. Navigate to `http://localhost:8080`.
2. Wait for {{SceneName}} via `waitForScene(page, '{{SceneKey}}')`.
3. {{Action step — e.g., "Record initial playerPosition.x".}}
4. {{Action step — e.g., "Press D key for 500ms via pressKey(page, 'KeyD', 500)".}}
5. {{Action step — e.g., "Record final playerPosition.x via getGameState(page)".}}
**Expected**: {{Concrete assertion — e.g., "Final x > initial x".}}
**Maps to**: {{AC-XX.X}}

### Check M-002 — {{AC ID}}: {{description}}

**Scenario**: {{What the test simulates.}}
**State bridge fields**: `{{field1}}`
**Actions**:
1. Navigate to `http://localhost:8080`.
2. {{Action steps.}}
**Expected**: {{Concrete assertion.}}
**Maps to**: {{AC-XX.X}}

{{Repeat for each MUST-tier check. One check per AC minimum. Complex ACs may need multiple checks.}}

## 5. Manual Smoke (SHOULD tier)

Visual screenshots for human review. /goal captures these via `page.screenshot()` but does not make automated pass/fail assertions on them. A human reviews the images.

Screenshots are saved to `goals/{{NN}}-{{slug}}/test-artifacts/`.

{{Generate one check block per SHOULD-tier visual verification. Use S-XXX IDs.}}

### Check S-001 — Visual: {{description}}

**Scenario**: {{What should be visible on screen.}}
**Capture**: `page.screenshot({ path: 'goals/{{NN}}-{{slug}}/test-artifacts/{{filename}}.png' })`
**Human checks**: {{What a human should verify in the screenshot — e.g., "Player sprite is visible, positioned within game bounds, correct orientation."}}
**Maps to**: {{AC-XX.X}}

### Check S-002 — Visual: {{description}}

**Scenario**: {{What should be visible on screen.}}
**Capture**: `page.screenshot({ path: 'goals/{{NN}}-{{slug}}/test-artifacts/{{filename}}.png' })`
**Human checks**: {{What a human should verify.}}
**Maps to**: {{AC-XX.X}}

{{Repeat for each SHOULD-tier check.}}

## 6. Evidence Collection

/goal must collect and preserve verification evidence throughout the goal.

### Test output

Run all automated checks and capture output:

```bash
# Run all tests for this goal
npx playwright test tests/game/{{test-file}}.spec.ts

# Run full test suite (includes regression)
npm test
```

Save test output to `goals/{{NN}}-{{slug}}/test-artifacts/test-output.txt`.

### Screenshots

All SHOULD-tier screenshots are saved to `goals/{{NN}}-{{slug}}/test-artifacts/` by the test code.

### State bridge snapshots

For debugging, /goal can capture raw state bridge output:

```typescript
const state = await page.evaluate(() => (window as any).__GAME_STATE__);
console.log(JSON.stringify(state, null, 2));
```

Save snapshots to `goals/{{NN}}-{{slug}}/test-artifacts/state-snapshot.json` when useful for evidence.

## 7. Regression

**Run all previous goals' tests — they must still pass.**

```bash
# Full test suite — covers all goals
npm test
```

If any previous goal's test fails:

1. Determine whether this goal caused the regression.
2. If yes — fix it before marking this goal complete.
3. If no (pre-existing failure) — document in PROGRESS.md as external blocker.

/goal must not mark this goal complete if previous goals' tests are failing due to changes in this goal.

## 8. Evidence Format

/goal must add this section to `goals/{{NN}}-{{slug}}/PROGRESS.md` before marking complete. The tables below are **schema only** — leave the data cells empty. /goal populates them at completion time.

```md
## Final Verification Evidence

### Automated Check Evidence (MUST tier)

| Check ID | AC ID | Expected | Actual | Status |
| -------- | ----- | -------- | ------ | ------ |
|          |       |          |        |        |

### Screenshot Evidence (SHOULD tier)

| Check ID | Screenshot Path | Human Verdict | Notes |
| -------- | --------------- | ------------- | ----- |
|          |                 |               |       |

### Edge Case Evidence (NICE tier)

| Check ID | Expected | Actual | Status |
| -------- | -------- | ------ | ------ |
|          |          |        |        |

### Regression

| Test Suite | Result | Notes |
| ---------- | ------ | ----- |
|            |        |       |

### Acceptance Criteria Summary

| AC ID | Check IDs | Status |
| ----- | --------- | ------ |
|       |           |        |

### Files Changed

- _(populated by /goal)_

### Remaining Risks

- _(populated by /goal, "None known" if clean)_
```
````
