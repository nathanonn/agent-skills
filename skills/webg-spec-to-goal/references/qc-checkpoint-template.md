# QC Checkpoint Goal Template

The QC (Quality Control) checkpoint is a universal final goal that validates the overall game as a cohesive experience. It runs after all other goals are complete.

Unlike regular goals that build new features, this goal:
- **Validates** that all prior goals integrate correctly
- **Identifies** gaps, dead-end states, or broken transitions
- **Fixes** any inconsistencies found during validation
- **Re-runs** the full test suite as a regression gate

The QC goal is always the LAST goal in the sequence. Its goal number is always the highest (e.g., if the last feature goal is 07, QC is 08).

## When to include

- **New game (default)**: Always included. The user can opt out if they want.
- **Extend mode (3+ new goals)**: Recommended. The skill should suggest it.
- **Extend mode (<3 new goals)**: Optional. Mention it's available but default to skipping.

---

````md
# GOAL.md — QC Checkpoint (Final Validation)

## 1. Objective

Validate the entire game as a cohesive, playable experience. Ensure all prior goals integrate correctly, scene transitions form a complete loop, the gameplay loop is engaging from start to finish, and no technical regressions exist. Fix any gaps or inconsistencies found.

By the end of this goal:

- Every scene transition forms a complete, reachable loop (no dead ends)
- The full gameplay loop works end-to-end (boot → menu → play → win/lose → restart)
- All state bridge fields report correctly throughout the entire session
- The difficulty curve progresses smoothly (not too easy, not too hard, no sudden spikes)
- No orphaned code, unused assets, or broken references remain

## 2. Genre & Physics Config

- **Genre**: {{genre name}} ({{variant}})
- **Physics system**: {{Arcade / None}}
- **Gravity**: {{same as established in prior goals}}
- **World bounds**: {{same as established in prior goals}}

No changes to physics config in this goal. This goal validates existing configuration.

## 3. Scope

### In scope

- Full gameplay loop validation (menu → game → win/loss → restart)
- Scene transition completeness (every scene reachable, no dead ends)
- State bridge regression (all fields from all goals report correctly)
- Difficulty/balance review (progression feels intentional)
- Input responsiveness check (no lag, no missed inputs)
- Game over / win condition flows correctly to end screen
- End screen offers restart that cleanly resets all state
- Fix any integration issues found during validation

### Out of scope

- New features or mechanics (this goal only fixes and validates)
- Art asset changes (that was the Polish goal's job)
- Performance optimization beyond fixing obvious hitches
- Adding new state bridge fields (existing fields only)

### Do not touch

- Package.json dependencies
- Vite/TypeScript config
- AGENTS.md
- Goal folders for completed goals (do not modify their GOAL.md/VERIFY.md)

## 4. Depends On

All previous goals must be complete:

{{- List all prior goals as dependencies}}

## 5. Allowed Files

/goal may create or modify:

- `src/game/scenes/*.ts` (fix integration issues only — not new features)
- `src/state-bridge.ts` (fix reporting bugs only — not new fields)
- `src/game/configs/constants.ts` (balance tuning only)
- `tests/game/integration.spec.ts` (new — full loop integration test)
- `goals/{{NN}}-qc-checkpoint/PROGRESS.md`

/goal must not edit:

- Goal folders belonging to other goals
- `package.json`
- `index.html`
- `vite.config.ts`
- `AGENTS.md`

## 6. Scene Architecture

This goal does not create new scenes. It validates transitions between ALL existing scenes:

### Validation checklist for scene transitions

- **BootScene → MenuScene**: Assets load, progress shown, auto-transitions
- **MenuScene → GameScene**: Input triggers transition, GameScene initializes cleanly
- **GameScene → GameOverScene**: Win/loss condition triggers correctly, score passes through
- **GameOverScene → MenuScene (or GameScene)**: Restart resets ALL state cleanly
- **GameScene restart (if applicable)**: Scene restart via `init()` resets everything

### Key validation: Scene restart state leak

The most common integration bug: state from a previous run leaking into a restart. Check that:
- `init()` resets all scene-local state (not just constructor)
- Registry values are cleared on restart
- Object pools are properly reset
- State bridge reports fresh values after restart

## 7. Game Systems

Not applicable. This goal validates existing systems, not implements new ones.

### Validation targets

- **Object pools**: All pools recycle correctly, no leaked sprites
- **State bridge**: Every field from every goal reports accurately at all times
- **Input handling**: No stuck keys, no missed inputs, no conflict between scenes
- **Score/progression**: Values accumulate correctly across the full session
- **Collision system**: All overlap/collide handlers fire correctly

## 8. State Bridge Additions

No new state bridge fields in this goal. This goal validates ALL existing fields report correctly throughout the full game lifecycle.

### State bridge regression checklist

Verify these fields maintain correct values:

{{List ALL state bridge fields from all prior goals — copy from the State Bridge Growth table in goals-plan.md}}

Key regression patterns to check:
- Fields reset correctly on scene restart
- Fields update in real-time during gameplay
- Fields don't report stale values after transitions
- `gameOver` and `gameWon` flags clear on restart

## 9. Acceptance Criteria

- [ ] AC-{{NN}}.1 — Full gameplay loop completes without errors: boot → menu → play → win → end screen → restart → play again
- [ ] AC-{{NN}}.2 — Full gameplay loop completes the loss path: boot → menu → play → lose → game over → restart → play again
- [ ] AC-{{NN}}.3 — State bridge reports correct values at every stage (validated by integration test)
- [ ] AC-{{NN}}.4 — No console errors or warnings during a full play session
- [ ] AC-{{NN}}.5 — Scene restart cleans all state (no leaks from previous run)
- [ ] AC-{{NN}}.6 — Difficulty progression is smooth (no sudden spikes or trivial sections)
- [ ] AC-{{NN}}.7 — All prior goals' tests still pass (full regression)

## 10. Asset Requirements

No new assets. This goal uses existing assets only.

| Asset | Type | Size / Format | Source |
|-------|------|--------------|--------|
| (none) | — | — | All assets already exist from prior goals |

## 11. Definition of Done

The goal is complete only when:

- [ ] Every acceptance criterion (AC-{{NN}}.*) is implemented.
- [ ] An integration test (`tests/game/integration.spec.ts`) exercises the full gameplay loop.
- [ ] ALL prior goals' tests still pass (run full test suite with `npm test`).
- [ ] A human-verifiable play session demonstrates the game is cohesive and enjoyable.
- [ ] No console errors or warnings exist during normal gameplay.
- [ ] State bridge fields report correctly throughout the entire session lifecycle.
- [ ] `goals/{{NN}}-qc-checkpoint/PROGRESS.md` contains final evidence including screenshots of the full loop.
- [ ] /goal has performed a completion audit mapping each AC to evidence.

## 12. Completion Audit Checklist

Before marking the goal complete, /goal must update `goals/{{NN}}-qc-checkpoint/PROGRESS.md` with this table:

| Requirement | Evidence | Status |
|-------------|----------|--------|
| AC-{{NN}}.1 — Win path loop | | |
| AC-{{NN}}.2 — Loss path loop | | |
| AC-{{NN}}.3 — State bridge regression | | |
| AC-{{NN}}.4 — No console errors | | |
| AC-{{NN}}.5 — Clean restart | | |
| AC-{{NN}}.6 — Difficulty balance | | |
| AC-{{NN}}.7 — Full test suite pass | | |

## 13. Stop Conditions

/goal must stop and ask for human review if:

- A bug found during validation would require changing game design decisions (not just fixing wiring).
- Multiple prior goals' tests are failing simultaneously (indicates a deeper architectural issue).
- The gameplay loop has a fundamental design gap (e.g., no way to win, no way to restart) that prior goals should have addressed.
- Balance tuning requires changing constants so drastically that gameplay would differ from what prior goals tested.
- The game is technically correct but not fun — this is a design decision for the human.
````
