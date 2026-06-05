---
name: webg-spec-to-goal
description: Convert a web game idea (even a vague one like "build a Raiden-type game" or "make a card game") into a complete Codex /goal-ready Phaser 3 project — runnable scaffold, goals-plan.md, and all goal folders (GOAL.md + VERIFY.md + PROGRESS.md) generated at once. Auto-detects genre (shoot-em-up, card game, platformer, tower defense, puzzle), asks clarifying questions in focused batches, scaffolds a runnable TypeScript + Vite + Phaser 3 skeleton with state bridge for automated verification via Playwright, decomposes into 5-7 goals following a universal build order, and emits tailored /goal commands. Handles bullet hell, endless runner, match-3, solitaire, shmup, side-scroller, defense, and other genre variants. For browser-based 2D Phaser 3 games only — not 3D, multiplayer, RPGs, or non-browser platforms.
disable-model-invocation: true
---

# webg-spec-to-goal — Vague Game Idea → Complete Codex /goal Project

Turn a rough web game idea into a runnable Phaser 3 project scaffold plus every goal folder Codex `/goal` needs to build it autonomously:

```
my-game/
├── AGENTS.md
├── goals-plan.md
├── goals/
│   ├── 00-foundation/    GOAL.md  VERIFY.md  PROGRESS.md
│   ├── 01-core-mechanic/ GOAL.md  VERIFY.md  PROGRESS.md
│   ├── ...
│   └── NN-polish/        GOAL.md  VERIFY.md  PROGRESS.md
├── src/                  runnable game skeleton
├── tests/                Playwright config + helpers
└── public/               assets directories
```

Games naturally decompose into 5-8 goals following a universal build order. This skill generates **all goals at once** — no checkpoint between plan and generation.

**Extend mode**: This skill also supports extending an existing game with new features. When the user explicitly states they want to extend an existing game, the skill reads the current project state and generates additional goals that continue the sequence.

## Why this skill exists

Games have a predictable build order: scaffold → core mechanic → enemies/content → progression → UI → polish. This skill exploits that pattern to collapse the entire "idea → goal bundle" pipeline into one conversation that:

- auto-detects genre from the description and tailors everything to it
- asks 2-3 rounds of clarifying questions (each with options + recommendation)
- writes a runnable scaffold (boots to a blank Phaser scene out of the box)
- generates all goal folders at once with genre-aware decomposition
- bakes in state bridge verification (`window.__GAME_STATE__` + Playwright)

## Genre system

Five base genres, each with known variants:

| Genre | Variants | Physics | Key Data Structures |
|-------|----------|---------|-------------------|
| **shoot-em-up** | bullet hell, shmup, Raiden-type, vertical/horizontal shooter | Arcade | bullet pools, wave spawners, hitboxes |
| **card-game** | solitaire, matching, deck-builder, poker variant | None | deck, hand, discard pile, card state |
| **platformer** | endless runner, side-scroller, precision platformer | Arcade | tilemap, player body, collectibles |
| **tower-defense** | lane defense, creep wave, placement strategy | None (path-based) | tower registry, enemy path, wave queue |
| **puzzle** | match-3, sliding, Tetris-type, word game | None or Arcade | grid state, match detection, gravity |

**Variant mapping**: Map the user's description to a base genre. "Bullet hell" → shoot-em-up. "Endless runner" → platformer. "Match-3" → puzzle. "Solitaire" → card-game. Confirm with the user.

**Unsupported types** — hard stop:
- RPG / JRPG (content-heavy, dialogue trees, save systems)
- Simulation (open-ended state)
- Racing (continuous physics, track design)
- 3D games (Phaser is 2D only)

Genre determines: Phaser physics config, data structures in scaffold, goal decomposition order, state bridge fields, and verification patterns in every VERIFY.md.

## Core flow — 7 steps

### New game mode (default)

1. **Probe** — inspect cwd for existing projects, conflicts, or extend intent.
2. **Classify** — auto-detect genre from description, ask user to confirm.
3. **Ask** — 2-3 rounds of clarifying questions (max 3 rounds).
4. **Scaffold** — write runnable game skeleton.
5. **Plan** — write `goals-plan.md` with goal sequence.
6. **Write** — generate all goal folders at once (including QC checkpoint as the final goal).
7. **Hand off** — print file paths + `/goal` commands.

### Extend mode (user explicitly states intent)

1. **Probe** — detect existing project, read `goals-plan.md` + state bridge to understand current state.
2. **Classify** — identify what genre the existing project is (from its goals-plan.md or AGENTS.md).
3. **Ask** — 1-2 rounds: what features to add, scope, whether to include QC checkpoint.
4. *(Skip scaffold — project already exists.)*
5. **Plan** — append new goals to existing `goals-plan.md`.
6. **Write** — generate new goal folders only (continuing goal numbering from highest existing).
7. **Hand off** — print new file paths + `/goal` commands for the new goals only.

Never write files until confidence is at 95%+.

## Step 1 — Probe

Before asking the user anything, inspect the cwd.

| Signal | What it tells us |
|--------|-----------------|
| `package.json` | Existing project — check for Phaser in deps |
| `package.json` → Phaser 3 in deps | Existing Phaser project → check if extend mode |
| `tsconfig.json` | TypeScript already configured |
| `vite.config.*` | Build tool already in place |
| `src/` with Phaser imports | Existing game code → check if extend mode |
| `goals/` folder | Previous goal runs; check for slug collision |
| `goals-plan.md` | Existing roadmap → strong signal for extend mode |
| `AGENTS.md` | Existing conventions to respect |
| `.gitignore` | Check coverage for node_modules, dist/ |
| `index.html` | Existing entry point |
| `tests/` with Playwright | Test infra already in place |

### New game mode

**Existing Phaser project detected AND user did NOT express extend intent?** Stop. Print:

> This directory already contains a Phaser project. Would you like to extend it with new features (extend mode), or should we scaffold a new game in a different directory?

### Extend mode detection

The user explicitly states they want to extend an existing game (e.g., "add a boss fight to my shmup", "extend the game with a new level", "add power-ups to the existing game"). When this happens:

1. Read `goals-plan.md` to determine: genre, variant, highest goal number, state bridge state.
2. Read `src/state-bridge.ts` to see current fields.
3. Read `AGENTS.md` for project conventions.
4. Note the highest existing goal number (e.g., 08) — new goals start at N+1.

If `goals-plan.md` doesn't exist but it's clearly a Phaser project made by this skill (has state-bridge.ts, goals/ folder), reconstruct the context from the goal folders.

## Step 2 — Classify

Read the user's game description and auto-detect the genre. The variant mapping table in `references/genre-templates.md` has the full mapping. Quick process:

1. Scan for genre keywords (see genre table above).
2. Map variants to base genre.
3. Present the detection to the user for confirmation:

> Based on your description, this sounds like a **shoot-em-up** (Raiden-type vertical shooter). Is that right, or should I classify it differently?

If the description is ambiguous, present 2-3 candidate genres with reasoning and ask the user to pick.

If the description maps to an unsupported type (RPG, simulation, racing, 3D), stop immediately with a clear explanation of why it's out of scope.

## Step 3 — Ask clarifying questions

Use the `AskUserQuestion` tool when available. Fall back to natural-language Q&A with the same shape: 2-4 questions per round, recommended option first and labeled `(Recommended)`, plus a one-line reason.

Aim for 2-3 rounds. Max 3 rounds. Skip questions already answered by the spec or probe.

### Round 1 — Identity + Resolution

- **Game name / slug**: Suggest kebab-case from the game description (e.g., "space-raiders"). Must be a valid npm package name and directory name.
- **Resolution**: 800x600 (Recommended — standard 4:3, works on most screens) / 1024x768 / 960x540 (16:9) / Custom.
- **Confirm genre**: "I detected [genre]. Correct? If not, which genre fits better?"

### Round 2 — Mechanics + Scope

- **Acceptance criteria**: Draft 4-6 AC bullets from the spec, then ask the user to confirm, edit, or add. Don't make them write ACs from scratch.
- **Out of scope**: Suggest boundaries (multiplayer, mobile-specific controls, save/load, procedural generation, online leaderboards).
- **Genre-specific mechanics**: Tailor to the genre:
  - shoot-em-up: weapon types, power-up system, boss fights?
  - card-game: hand size, draw rules, win condition?
  - platformer: jump physics, wall-jump, double-jump?
  - tower-defense: tower types, upgrade tiers, enemy variety?
  - puzzle: grid size, match rules, scoring?

### Round 3 — Art + Audio + Optional Goals

- **Art style**: Pixel art (Recommended for most games — clear at small sizes, fast to generate) / Flat vector / Painted / Placeholder-only (colored rectangles).
- **Audio**: Include sound effects + music goal (Recommended) / Skip audio entirely.
- **Optional goals**: Any extra goals beyond the standard decomposition? (e.g., "add a tutorial level", "add screen shake effects").

### Confidence check after each round

After each round: "If I started writing files now, what could go wrong?" If "not much" → proceed. If meaningful unknowns → ask one more focused round. If 3 rounds done and still under 95% → tell the user rather than guessing.

### Recommendation heuristics

| Area | Heuristic |
|------|-----------|
| Name/slug | Kebab-case from game description; short and memorable |
| Resolution | 800x600 unless user specifies widescreen or mobile |
| Genre | Trust the variant mapping; ask only when ambiguous |
| Scope | Narrowest scope that achieves the spec. Out-of-scope wins ties |
| Art style | Pixel art default — fast to generate, scales cleanly |
| Goal count | 5-7 goals; fewer for simple games, more for complex ones |
| Mechanics | Genre defaults first; only add mechanics the user explicitly mentions |

## Step 4 — Scaffold

Always scaffold. This is mandatory (unlike WP/CLI skills where it's optional). Templates live in `references/scaffold-templates.md` (file contents) and `references/agents-template.md` (AGENTS.md content). Read both when scaffolding.

### Generated file tree

```
<slug>/
├── index.html              Vite entry, mounts #game-container
├── package.json            phaser@3, typescript, vite, playwright
├── tsconfig.json           strict, es2022, DOM lib
├── vite.config.ts          dev server on port 8080
├── .gitignore              node_modules, dist/, test-results/
├── AGENTS.md               stack + Phaser conventions + state bridge docs
├── public/
│   ├── style.css           minimal reset, #game-container centered
│   └── assets/
│       ├── images/         sprite sheets, backgrounds
│       ├── audio/          sfx, music
│       └── data/           level JSON, wave definitions
├── src/
│   ├── main.ts             Vite entry → creates Phaser.Game
│   ├── state-bridge.ts     exposes window.__GAME_STATE__ for Playwright
│   └── game/
│       ├── main.ts         Phaser.Types.Core.GameConfig (genre-aware physics)
│       ├── configs/
│       │   └── constants.ts  resolution, colors, physics tuning
│       └── scenes/
│           ├── BootScene.ts      asset loading + progress bar
│           ├── MenuScene.ts      title screen + "Press Start"
│           ├── GameScene.ts      main gameplay (empty shell)
│           └── GameOverScene.ts  score display + restart
└── tests/
    ├── playwright.config.ts  baseURL: localhost:8080, webServer config
    └── game/
        ├── helpers.ts        waitForGameState(), getState() utilities
        └── boot.spec.ts      verifies game boots + scenes registered
```

### State bridge

The state bridge is the key verification mechanism. `src/state-bridge.ts` exposes a typed `window.__GAME_STATE__` object that Playwright tests read via `page.evaluate()`.

Base fields (always present):
```typescript
interface GameState {
  scene: string;       // current active scene key
  ready: boolean;      // true after BootScene completes
  score: number;
  gameOver: boolean;
}
```

Genre-specific fields are added by each goal (documented in the goal's "State Bridge Additions" section).

### Genre-aware physics config

The scaffold sets the Phaser physics config based on genre:

- **shoot-em-up / platformer**: `arcade` physics, gravity per genre (0 for shmup, tuned for platformer)
- **card-game / tower-defense / puzzle**: no physics (or minimal arcade for drag-and-drop)

### Collision handling

Never overwrite existing files without explicit user confirmation. If `<slug>/` already exists as a directory, stop and ask.

## Step 5 — Plan

Write `goals-plan.md` at `<slug>/goals-plan.md`. Template lives in `references/goals-plan-template.md`. Read it when generating. This is the master roadmap.

### Universal build order

Every game follows this progression (some goals may be merged for simple games):

| # | Goal | Purpose |
|---|------|---------|
| 00 | **Foundation** | Verify scaffold boots, customize constants, confirm state bridge works |
| 01 | **Core Mechanic** | The one thing that makes this game this game (shooting, card play, jumping, placing towers, matching) |
| 02 | **Enemies / Content** | Opposition or challenge content (enemy waves, card decks, level layouts, creep waves, puzzle boards) |
| 03 | **Progression** | Scoring, levels, difficulty curve, win/lose conditions |
| 04 | **UI / HUD** | Health bars, score display, menus, pause screen |
| 05 | **Polish** | Art assets via $imagegen, sound effects, screen shake, particles, juice |
| 06 | *(Optional)* **Bonus** | Tutorial, extra levels, achievements — only if user requested |
| NN | **QC Checkpoint** | Final validation — gameplay loop cohesion, state bridge regression, difficulty balance, integration test |

Goal 00 is always lightweight: verify the scaffold boots, tweak constants, confirm the state bridge reports correctly. The real work starts at Goal 01.

**QC Checkpoint** is always the last goal (whatever number that ends up being). It validates the entire game as a cohesive experience: complete gameplay loop, clean restarts, state bridge correctness, and difficulty balance. Template lives in `references/qc-checkpoint-template.md`.

The plan file includes: goal number, goal name, 1-2 line description, key ACs for that goal, and dependencies.

## Step 6 — Write all goal folders

Generate all goal folders at once under `<slug>/goals/`. Each folder contains GOAL.md + VERIFY.md + PROGRESS.md.

Templates live in:
- `references/goal-template.md` — full GOAL.md template (13 sections)
- `references/verify-template.md` — full VERIFY.md template (tiered verification)
- `references/progress-template.md` — initial PROGRESS.md skeleton
- `references/genre-templates.md` — per-genre goal decomposition sequences, ACs, state bridge fields, and variant mappings
- `references/qc-checkpoint-template.md` — QC checkpoint goal (always last)

Read these reference files when generating. Substitute placeholders with everything confirmed in Steps 2-3. Use `references/genre-templates.md` to determine the goal sequence, ACs, and state bridge fields for the detected genre. Always generate the QC checkpoint as the final goal (use `references/qc-checkpoint-template.md`).

### GOAL.md — 13 sections

Every GOAL.md contains these sections:

1. **Objective** — one-paragraph summary of what this goal achieves.
2. **Genre & Physics Config** — genre name, physics system, relevant Phaser config.
3. **Scope** — in-scope and out-of-scope bullets.
4. **Depends On** — which previous goals must be complete.
5. **Allowed Files** — explicit list of files this goal may create or modify.
6. **Scene Architecture** — which scenes this goal touches and how.
7. **Game Systems** — classes, managers, or patterns to implement.
8. **State Bridge Additions** — new fields to add to `window.__GAME_STATE__`.
9. **Acceptance Criteria** — numbered AC list (AC-XX.1, AC-XX.2, ...).
10. **Asset Requirements** — sprites, sounds, data files needed (placeholders OK for non-Polish goals).
11. **Definition of Done** — checklist including "all previous tests still pass."
12. **Completion Audit Checklist** — table mapping each AC to evidence.
13. **Stop Conditions** — when to stop and ask instead of guessing.

### Filling rules

- Replace every `{{placeholder}}` with concrete values. Never leave one in.
- Leave audit evidence cells empty — `/goal` fills those at completion time.
- If a section doesn't apply, write `Not applicable.` plus a one-line reason. Don't delete the section.
- Give every AC a stable ID: `AC-00.1`, `AC-01.1`, `AC-01.2`, etc.
- Match the user's stated scope literally.
- Before writing, scan for any remaining `{{` — fix before emitting.

### Art strategy — hybrid

- **Goals 00-04**: use placeholder assets (colored rectangles, simple shapes). Note in each goal's Asset Requirements: "Placeholder OK — final art ships in Polish goal."
- **Goal 05 (Polish)**: consolidated art goal. Include general `$imagegen` guidelines:
  - Use magenta (#FF00FF) background for sprites that need transparency
  - Remove magenta via chromakey after generation
  - Generate at 2x target resolution for downscale quality
  - Specify art style consistent with Round 3 answer (pixel art / flat vector / painted)
- `AGENTS.md` also documents the art pipeline so `/goal` knows the convention.

### Verification — tiered

Every VERIFY.md uses a three-tier system:

| Tier | Label | Method | Required? |
|------|-------|--------|-----------|
| MUST | Automated | State bridge assertions via `page.evaluate()` in Playwright | Yes — goal fails without these |
| SHOULD | Screenshot | `page.screenshot()` for human review | Yes — but human judges pass/fail |
| NICE | Edge case | Polish and edge-case checks | No — bonus quality |

Each VERIFY.md describes the test scenarios. `/goal` writes the actual `.spec.ts` files in `tests/game/`.

**Regression rule**: every goal's VERIFY.md includes "Run all previous goals' tests — they must still pass."

### Sandbox rule

The dev server runs on localhost:8080. Playwright connects to it. If the harness sandboxes shell access, it needs:
- localhost:8080 for the Vite dev server
- Network access for `npm install` (one-time)

No Docker, no container filesystem, no external services.

## Step 7 — Hand off

After writing all files, print:

```
Scaffolded:
  <slug>/index.html
  <slug>/package.json
  <slug>/tsconfig.json
  <slug>/vite.config.ts
  <slug>/.gitignore
  <slug>/AGENTS.md
  <slug>/public/style.css
  <slug>/public/assets/{images,audio,data}/
  <slug>/src/main.ts
  <slug>/src/state-bridge.ts
  <slug>/src/game/main.ts
  <slug>/src/game/configs/constants.ts
  <slug>/src/game/scenes/{Boot,Menu,Game,GameOver}Scene.ts
  <slug>/tests/playwright.config.ts
  <slug>/tests/game/helpers.ts
  <slug>/tests/game/boot.spec.ts

Goals plan:
  <slug>/goals-plan.md

Goal folders:
  <slug>/goals/00-foundation/   GOAL.md  VERIFY.md  PROGRESS.md
  <slug>/goals/01-core-mechanic/ GOAL.md  VERIFY.md  PROGRESS.md
  ...
  <slug>/goals/NN-polish/       GOAL.md  VERIFY.md  PROGRESS.md

To run goals sequentially with Codex /goal:
  /goal Complete <slug>/goals/00-foundation/GOAL.md. Use VERIFY.md as the verification contract. Update PROGRESS.md continuously. Treat uncertainty as incomplete.

  (after each goal completes, run the next:)
  /goal Complete <slug>/goals/01-core-mechanic/GOAL.md. Use VERIFY.md as ...

How to run:
  1. cd <slug> && npm install
  2. npm run dev              # boots game at localhost:8080
  3. npm test                 # runs Playwright tests
  4. Open Codex and paste the first /goal command.
  5. Review changes via `git diff` before committing.
```

## Stop conditions

### Hard stops — refuse and explain

| Condition | Reason |
|-----------|--------|
| Multiplayer / networked gameplay | Requires server infrastructure, netcode, latency handling |
| 3D game (Three.js, Babylon, etc.) | Phaser is 2D only |
| Non-browser platform (mobile app, desktop exe) | Skill targets browser-only Phaser 3 |
| Content-heavy RPG (dialogue, quests, save system) | Too many interlocking systems for goal decomposition |

### Soft stops — warn and offer alternatives

| Condition | Response |
|-----------|----------|
| Unsupported genre variant | Explain which genres are supported; ask user to reframe |
| Very complex (>10 distinct mechanics) | Suggest trimming to MVP; offer to scope-cut |
| Mobile-only (touch controls, portrait mode) | Warn about Phaser mobile performance; proceed if user confirms |
| Phaser 4 / other engine requested | This skill targets Phaser 3; suggest manual setup for other engines |

### Standard stops — ask instead of guessing

| Condition | Action |
|-----------|--------|
| Slug collision with existing directory | Ask user to rename or confirm overwrite |
| >3 question rounds and confidence < 95% | Tell user the spec needs more detail |
| Probe contradicts spec (e.g., existing Phaser project) | Surface the conflict; ask user to clarify |

## Extend mode — detailed behavior

When the user explicitly says they want to extend an existing game:

### Step 1 (Probe) — Read existing project

Read these files to understand current state:
- `goals-plan.md` — genre, variant, goal count, state bridge growth
- `src/state-bridge.ts` — current GameState interface fields
- `AGENTS.md` — project conventions
- `goals/` folder listing — highest goal number

### Step 3 (Ask) — Extend-specific questions

Round 1:
- **What to add**: "What features or content do you want to add?" (draft suggestions based on the genre's Optional Goals in `references/genre-templates.md`)
- **Scope**: "How large is this extension?" (1-2 new goals / 3-5 new goals / 6+ new goals)

Round 2 (if 3+ new goals):
- **QC checkpoint**: "Since this extension adds 3+ goals, I recommend including a QC checkpoint as the final goal to validate everything integrates well. Include it?" (Yes, include QC checkpoint (Recommended) / No, skip it)

For extensions with <3 new goals, mention QC is available but default to skipping:
> "This is a small extension (1-2 goals). I'll skip the QC checkpoint by default — let me know if you'd like to include it anyway."

### Step 5 (Plan) — Append to existing plan

- Read the existing `goals-plan.md`
- Determine highest goal number (e.g., 08 if QC checkpoint was 08)
- New goals continue from N+1 (e.g., 09, 10, 11...)
- Append new goal rows to the Goal Sequence table
- Append new state bridge fields to the State Bridge Growth table
- If QC checkpoint is included, it's always the last goal in the new sequence

### Step 6 (Write) — New folders only

- Only generate goal folders for the new goals
- AC IDs continue the sequence: if last existing AC was AC-08.7, new goals start at AC-09.1
- State bridge additions build on the current cumulative state
- Dependencies reference the last existing goal (or a specific existing goal if relevant)

### Step 7 (Hand off) — New goals only

Print only the new goal folders and `/goal` commands. Don't re-list existing files.

## What this skill does not do

- It does not implement the game. That's `/goal`'s job.
- It does not run tests. That's `/goal`'s job.
- It does not work for 3D games, multiplayer games, or non-browser platforms.
- It does not work for non-Phaser engines (Unity, Godot, Pixi.js, etc.).
- It does not generate actual art assets. It sets up the pipeline for `/goal` to use `$imagegen`.
- It does not fix bugs. For bug fixes, use `/goal` directly.
- It does not handle deployment (hosting, CDN, itch.io upload). That's post-goal work.
