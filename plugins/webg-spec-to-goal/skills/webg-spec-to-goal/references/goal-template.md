# GOAL.md template — Phaser 3 web game

Read this file when generating `goals/<NN>-<slug>/GOAL.md`. Substitute every `{{...}}` placeholder with values confirmed in Steps 2-3 of the skill flow. Do not delete sections that don't apply — write `Not applicable.` plus a one-line reason instead.

Game-specific notes:
- AC IDs use the goal number as prefix: `AC-00.1`, `AC-01.1`, `AC-02.3`, etc.
- Every goal after 00 includes "all previous goals' tests still pass" in Definition of Done.
- Art assets are placeholders for goals 00-04. Goal 05 (Polish) consolidates final art via `$imagegen`.
- State bridge fields accumulate — each goal adds new fields, never removes existing ones.

---

````md
# GOAL.md — {{Goal Name}}

## 1. Objective

{{One clear paragraph describing the outcome /goal must achieve for this goal.}}

By the end of this goal, the game should support:

- {{Outcome 1}}
- {{Outcome 2}}
- {{Outcome 3}}

## 2. Genre & Physics Config

- **Genre**: {{genre name}} ({{variant, e.g. "Raiden-type vertical shooter"}})
- **Physics system**: {{Arcade / None}}
- **Gravity**: {{e.g. "{ x: 0, y: 0 }" for shmup, "{ x: 0, y: 300 }" for platformer, "N/A" for no physics}}
- **World bounds**: {{e.g. "800x600, wrap: none" or "800x600, player clamped to bounds"}}

{{If this goal does not change physics config: "No changes to physics config in this goal."}}

## 3. Scope

### In scope

- {{Specific feature / behavior 1}}
- {{Specific feature / behavior 2}}
- {{Specific feature / behavior 3}}

### Out of scope

- {{Anything /goal must not touch}}
- {{Anything deferred to a later goal}}

### Do not touch

- {{Files or systems owned by other goals}}
- {{Anything the user explicitly excluded}}

## 4. Depends On

{{List previous goals that must be complete before this one starts, or "None — this is the first goal."}}

- `goals/{{NN}}-{{slug}}/` — {{one-line reason why it's a dependency}}

## 5. Allowed Files

/goal may create or modify:

- `src/game/scenes/{{SceneName}}.ts`
- `src/game/{{system-file}}.ts`
- `src/state-bridge.ts` (add new fields only — do not remove existing ones)
- `src/game/configs/constants.ts` (add new constants only)
- `tests/game/{{test-file}}.spec.ts`
- `goals/{{NN}}-{{slug}}/PROGRESS.md`
- {{Additional files specific to this goal}}

/goal must not edit:

- Goal folders belonging to other goals
- `package.json` (unless a new dependency is genuinely required — document why)
- `index.html` (unless this goal's scope explicitly requires it)
- `vite.config.ts`
- `AGENTS.md`
- {{Additional restrictions specific to this goal}}

## 6. Scene Architecture

{{List every Phaser scene this goal touches and what happens in each lifecycle method.}}

### {{SceneName}} ({{create / modify}})

- **`init()`**: {{What this method does, or "Not used."}}
- **`preload()`**: {{Assets loaded here, or "Not used — assets loaded in BootScene."}}
- **`create()`**: {{Objects, groups, colliders, input handlers created here.}}
- **`update(dt)`**: {{Per-frame logic: movement, collision checks, state updates.}}

{{Repeat for each scene this goal touches. If a scene is not touched: omit it entirely.}}

## 7. Game Systems

{{Classes, managers, or game patterns this goal implements. If none: "Not applicable. This goal modifies existing scenes only."}}

### {{SystemName}}

- **Purpose**: {{What this system does}}
- **Pattern**: {{e.g. "Object pool", "State machine", "Wave spawner", "Singleton manager"}}
- **Key methods**: {{List public methods /goal must implement}}
- **Owns**: {{What game objects or data this system manages}}

{{Repeat for each system.}}

## 8. State Bridge Additions

{{New fields to add to `window.__GAME_STATE__` in `src/state-bridge.ts`.}}

New fields added by this goal:

- `{{fieldName}}: {{type}}` — {{what it represents}}
- `{{fieldName}}: {{type}}` — {{what it represents}}

{{If no new fields: "No new state bridge fields in this goal. Existing fields are sufficient."}}

Cumulative state bridge after this goal:

```typescript
interface GameState {
  scene: string;
  ready: boolean;
  score: number;
  gameOver: boolean;
  {{all fields from previous goals}}
  {{new fields from this goal}}
}
```

## 9. Acceptance Criteria

- [ ] AC-{{NN}}.1 — {{Observable, testable behavior}}
- [ ] AC-{{NN}}.2 — {{Observable, testable behavior}}
- [ ] AC-{{NN}}.3 — {{Observable, testable behavior}}
- [ ] AC-{{NN}}.4 — {{Observable, testable behavior}}

{{Use direct behavioral statements. No "As a user, I want..." phrasing — games don't have user stories.}}

## 10. Asset Requirements

{{List sprites, sounds, data files this goal needs.}}

| Asset | Type | Size / Format | Source |
|-------|------|--------------|--------|
| {{asset name}} | {{sprite / spritesheet / audio / JSON}} | {{e.g. "32x32 PNG" or "WAV, <2s"}} | {{Placeholder rectangle / $imagegen in Polish / hand-authored}} |

{{For goals 00-04: "Placeholder OK — final art ships in Polish goal."}}
{{For goal 05 (Polish): include $imagegen guidelines — magenta background, 2x resolution, chromakey removal, art style from Round 3.}}

## 11. Definition of Done

The goal is complete only when:

- [ ] Every acceptance criterion (AC-{{NN}}.*) is implemented.
- [ ] Every verification command in `goals/{{NN}}-{{slug}}/VERIFY.md` passes or has a documented external blocker.
- [ ] All previous goals' tests still pass (run full test suite).
- [ ] New game systems have corresponding Playwright tests.
- [ ] State bridge fields are updated and report correct values.
- [ ] `goals/{{NN}}-{{slug}}/PROGRESS.md` contains final evidence.
- [ ] /goal has performed a completion audit mapping each AC to evidence.

## 12. Completion Audit Checklist

Before marking the goal complete, /goal must update `goals/{{NN}}-{{slug}}/PROGRESS.md` with this table:

| Requirement | Evidence | Status |
|-------------|----------|--------|
| AC-{{NN}}.1 | | |
| AC-{{NN}}.2 | | |
| AC-{{NN}}.3 | | |
| AC-{{NN}}.4 | | |

## 13. Stop Conditions

/goal must stop and ask for human review if:

- A game-design decision is ambiguous (e.g., unclear win condition, damage values, spawn rates).
- The implementation requires changing physics config or world bounds beyond this goal's scope.
- Tests from previous goals start failing for reasons unrelated to this goal.
- The implementation requires touching files outside the Allowed Files list.
- A new npm dependency is needed that wasn't anticipated in the scaffold.
- Placeholder art is insufficient to verify gameplay (e.g., collision shapes need specific dimensions).
- The state bridge interface would need breaking changes to existing fields.
````
