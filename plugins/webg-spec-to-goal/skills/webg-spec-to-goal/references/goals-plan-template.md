# goals-plan.md Template

Read this file when generating `<slug>/goals-plan.md` during Step 5 (Plan). This is the master roadmap for the entire game build. Substitute every `{{...}}` placeholder with confirmed values.

---

````md
# Goals Plan — {{Game Title}}

## Game Metadata

- **Name**: {{Game Title}}
- **Slug**: {{slug}}
- **Genre**: {{genre}} ({{variant, e.g. "Raiden-type vertical shooter"}})
- **Resolution**: {{width}} x {{height}}
- **Physics**: {{Arcade / None}} — {{gravity note}}
- **Art Style**: {{pixel art / flat vector / painted / placeholder-only}}
- **Audio**: {{yes / skip}}

## Goal Sequence

Execute goals in order. Each goal depends on all previous goals being complete.

| # | Folder | Name | Description | Depends On |
|---|--------|------|-------------|------------|
| 00 | `goals/00-foundation/` | Foundation | Verify scaffold boots, customize constants, confirm state bridge | None |
| 01 | `goals/01-{{slug-01}}/` | {{Goal 01 Name}} | {{1-2 sentence description}} | 00 |
| 02 | `goals/02-{{slug-02}}/` | {{Goal 02 Name}} | {{1-2 sentence description}} | 01 |
| 03 | `goals/03-{{slug-03}}/` | {{Goal 03 Name}} | {{1-2 sentence description}} | 02 |
| 04 | `goals/04-{{slug-04}}/` | {{Goal 04 Name}} | {{1-2 sentence description}} | 03 |
| 05 | `goals/05-polish/` | Polish | Art via $imagegen, particles, screen shake, audio | 04 |
{{| 06 | `goals/06-{{slug-06}}/` | {{Bonus Goal Name}} | {{Optional goal description}} | 05 |}}
| {{NN}} | `goals/{{NN}}-qc-checkpoint/` | QC Checkpoint | Full gameplay loop validation, state bridge regression, difficulty balance | All previous |

## State Bridge Growth

Each goal adds fields to `window.__GAME_STATE__`. Fields accumulate — never removed.

| Goal | New Fields | Cumulative |
|------|-----------|-----------|
| 00 | `scene`, `ready` | scene, ready |
| 01 | {{fields from genre template}} | scene, ready, {{...}} |
| 02 | {{fields from genre template}} | {{...}} |
| 03 | {{fields from genre template}} | {{...}} |
| 04 | {{fields from genre template}} | {{...}} |
| 05 | (no new fields — polish reads existing state) | {{all fields}} |

## Key Acceptance Criteria Per Goal

### Goal 00 — Foundation
- AC-00.1: Game boots without console errors
- AC-00.2: MenuScene displays game title
- AC-00.3: SPACE transitions to GameScene
- AC-00.4: State bridge reports { scene, ready }
- AC-00.5: constants.ts has game-specific values

### Goal 01 — {{Goal 01 Name}}
{{- AC-01.1: ...}}
{{- AC-01.2: ...}}
{{- AC-01.3: ...}}

### Goal 02 — {{Goal 02 Name}}
{{- AC-02.1: ...}}
{{- AC-02.2: ...}}
{{- AC-02.3: ...}}

### Goal 03 — {{Goal 03 Name}}
{{- AC-03.1: ...}}
{{- AC-03.2: ...}}
{{- AC-03.3: ...}}

### Goal 04 — {{Goal 04 Name}}
{{- AC-04.1: ...}}
{{- AC-04.2: ...}}
{{- AC-04.3: ...}}

### Goal 05 — Polish
- AC-05.1: All placeholder rectangles replaced with generated art
- AC-05.2: Art style is consistent across all assets ({{art_style}})
- AC-05.3: Particle effects on key interactions (hits, collects, deaths)
{{- AC-05.4: Sound effects for key actions}}
{{- AC-05.5: Background music plays during GameScene}}
- AC-05.6: No visual regressions — previous gameplay still works

### Goal {{NN}} — QC Checkpoint
- AC-{{NN}}.1: Full gameplay loop completes without errors (boot → menu → play → win → end → restart)
- AC-{{NN}}.2: Loss path completes without errors (boot → menu → play → lose → game over → restart)
- AC-{{NN}}.3: State bridge reports correct values at every stage
- AC-{{NN}}.4: No console errors or warnings during a full play session
- AC-{{NN}}.5: Scene restart cleans all state (no leaks from previous run)
- AC-{{NN}}.6: Difficulty progression is smooth
- AC-{{NN}}.7: All prior goals' tests still pass (full regression)

## Out of Scope (entire project)

- {{Boundaries confirmed in Step 3}}
- Multiplayer / networking
- Mobile-specific touch controls
- Save/load game state to disk
- Online leaderboards
- Deployment / hosting

## How to Execute

For each goal in sequence:

```
/goal Complete <slug>/goals/<NN>-<name>/GOAL.md. Use VERIFY.md as the verification contract. Update PROGRESS.md continuously. Treat uncertainty as incomplete.
```

After each goal completes:
1. Run `npm test` to confirm all tests pass
2. Run `npx tsc --noEmit` to confirm no type errors
3. Commit the changes
4. Move to the next goal
````
