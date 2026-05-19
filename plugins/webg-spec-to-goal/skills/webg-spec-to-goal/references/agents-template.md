# AGENTS.md Template

This template produces the `AGENTS.md` file placed at the game project root during Step 4 (Scaffold). It is the sole agent instruction file for the project — there is no separate CLAUDE.md.

---

## Template

```markdown
# {{slug}}

## Stack

- **Engine**: Phaser 3.80+
- **Language**: TypeScript (strict)
- **Bundler**: Vite
- **Testing**: Playwright (browser-based, assertions via state bridge)
- **Genre**: {{genre}} — {{physics_note}}
- **Resolution**: {{width}} x {{height}}
- **Art style**: {{art_style}}

## Commands

| Action | Command |
|--------|---------|
| Dev server | `npm run dev` (localhost:8080) |
| Build | `npm run build` |
| Type check | `npx tsc --noEmit` |
| Test | `npm test` (Playwright) |

Always run type check and tests after completing a goal. Fix any failures before moving on.

## Project Structure

```
src/
  main.ts              — Game config + entry point
  state-bridge.ts      — Exposes game state to window.__GAME_STATE__
  scenes/              — One file per scene
  objects/             — Game object classes (pooled entities, player, etc.)
  types.ts             — Shared interfaces (including GameState)
public/
  assets/
    images/            — Sprite sheets and individual sprites
    audio/             — Sound effects and music
tests/
  game/
    helpers.ts         — Test utilities (getGameState, waitForScene, pressKey)
    *.spec.ts          — Goal verification tests
goals/                 — Goal definitions (GOAL.md, VERIFY.md, PROGRESS.md)
```

## Goal Workflow

Complete one goal at a time in numerical order. For each goal:

1. Read the goal's `GOAL.md` for requirements
2. Implement the feature
3. Run `npx tsc --noEmit` — fix all type errors
4. Run `npm test` — all tests must pass (including prior goals)
5. Update the goal's `PROGRESS.md` to mark completion
6. Move to the next goal

Never skip ahead. Never break tests from previous goals.

---

## Phaser Domain Knowledge

### Scene Lifecycle

Every scene follows this sequence:

1. **`init(data?)`** — Called each time the scene starts or restarts. Reset ALL mutable state here. Receives optional data from `scene.start('Key', data)`.
2. **`preload()`** — Load assets. Only runs once per scene (cached after first load).
3. **`create()`** — Instantiate game objects, set up physics colliders, configure input handlers. Runs after preload completes.
4. **`update(time, delta)`** — Game loop. Called every frame. Use `delta` (ms since last frame) for all movement calculations.

### CRITICAL: State Initialization

**Reset mutable state in `init()`, NEVER in the constructor.**

Scenes persist across restarts. The constructor only runs once when the scene is first added to the game. If you put `this.score = 0` in the constructor, it will NOT reset when the player dies and the scene restarts. Always use `init()` for resetting score, health, positions, timers, and any gameplay state.

```typescript
// WRONG — score persists across restarts
class GameScene extends Phaser.Scene {
  private score = 0; // constructor-time, only runs once
}

// CORRECT — score resets every time scene starts
class GameScene extends Phaser.Scene {
  private score!: number;
  init() {
    this.score = 0;
  }
}
```

### Object Pooling

For any entity that spawns repeatedly (bullets, enemies, collectibles, particles), use a physics group as a pool:

```typescript
// In create()
this.bullets = this.physics.add.group({
  classType: Bullet,
  maxSize: 30,
  runChildUpdate: true,
});

// To spawn
const bullet = this.bullets.get(x, y) as Bullet;
if (bullet) {
  bullet.fire(direction);
}

// To "destroy" (return to pool)
bullet.setActive(false).setVisible(false);
bullet.body?.stop();
```

Never create game objects in `update()`. It causes memory leaks and frame drops. Pool them in `create()`, activate when needed, deactivate when done.

### Cross-Scene Data

Use the scene registry for data that persists across scenes (score, health, level number):

```typescript
// Set
this.registry.set('score', this.score);

// Get (in another scene)
const score = this.registry.get('score') as number;
```

Do not use global variables or module-level state for cross-scene data.

### Delta Time

Always multiply movement by `delta` from `update(time, delta)`:

```typescript
update(time: number, delta: number) {
  // CORRECT — frame-rate independent
  this.player.x += this.speed * (delta / 1000);

  // WRONG — moves faster on high-refresh displays
  this.player.x += this.speed;
}
```

### Colliders

Set up colliders and overlaps in `create()`, not `update()`:

```typescript
create() {
  this.physics.add.collider(this.player, this.platforms);
  this.physics.add.overlap(this.player, this.coins, this.collectCoin, undefined, this);
}
```

---

## State Bridge Rules

All test verification goes through `window.__GAME_STATE__`. Never pixel-compare screenshots for assertions.

### How it works

The state bridge (`src/state-bridge.ts`) runs every frame via the game's `step` event. It reads relevant game state and exposes it on `window.__GAME_STATE__` as a flat, serializable object.

### Rules

1. **Fields accumulate across goals** — never remove existing fields from the state bridge, only add new ones. Previous goals' tests still need them.
2. **New fields** require updates in two places: `src/state-bridge.ts` (the bridge logic) and `src/types.ts` (the `GameState` interface).
3. **Keep fields flat and primitive** — booleans, numbers, strings, and arrays of primitives. No nested objects, no class instances.

### Test Pattern

```typescript
import { getGameState, waitForScene, pressKey } from './helpers';

test('player collects coin and score increments', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await waitForScene(page, 'GameScene');

  const before = await getGameState(page);
  await pressKey(page, 'ArrowRight', 500);
  const after = await getGameState(page);

  expect(after.score).toBeGreaterThan(before.score);
  expect(after.coinsCollected).toBeGreaterThan(before.coinsCollected);
});
```

### Available Test Helpers (`tests/game/helpers.ts`)

- `getGameState(page)` — returns current `window.__GAME_STATE__` snapshot
- `waitForScene(page, sceneName)` — waits until the named scene is active
- `pressKey(page, key, durationMs?)` — simulates holding a key for a duration

Always verify behavior via state bridge assertions. Screenshots can be taken as supplementary evidence but must never be the sole verification method.

---

## $imagegen Pipeline

Art assets are generated using the `$imagegen` tool. This pipeline is only used in the Polish goal — goals 00 through 04 use colored placeholder rectangles.

### Generation Rules

1. **Magenta background** — ALWAYS use solid magenta (`#FF00FF`) as the background for any sprite that needs transparency. After generation, remove via chromakey processing.
2. **2x resolution** — Generate at double the target display size, then downscale. This produces cleaner edges and better detail.
3. **Art style lock** — Every asset in the game uses the same style prompt prefix to maintain visual cohesion. The prefix for this project is: `{{art_style}}`.
4. **Save location** — All generated images go to `public/assets/images/`.

### Sprite Sheets

For animated sprites:
- Generate each frame as an individual image with identical dimensions
- Combine frames into a horizontal strip (sprite sheet)
- Ensure consistent canvas size across all frames — padding if necessary
- Document frame dimensions in the asset loading code

### Chromakey Processing

After `$imagegen` produces an image with magenta background:
1. Load the image
2. Replace all `#FF00FF` pixels with transparent
3. Save as PNG with alpha channel
4. Verify no magenta fringing remains on edges

---

## Common Pitfalls

These are the most frequent mistakes in AI-generated Phaser code. Avoid them.

| # | Pitfall | Why it breaks | Fix |
|---|---------|---------------|-----|
| 1 | Creating objects in `update()` | Memory leak, frame drops within seconds | Pool objects in `create()`, activate/deactivate |
| 2 | Forgetting `refreshBody()` after teleporting a physics body | Collider uses stale position until next physics step | Call `sprite.refreshBody()` after setting x/y directly |
| 3 | Not using `delta` for movement | Game speed tied to frame rate — too fast on 144Hz, too slow on lag | Multiply all movement by `delta / 1000` |
| 4 | State init in constructor instead of `init()` | State never resets on scene restart | Move all mutable state initialization to `init()` |
| 5 | Using `destroy()` on pooled objects | Object gone permanently, pool shrinks to zero | Use `setActive(false).setVisible(false)` to return to pool |
| 6 | Missing `preserveDrawingBuffer: true` in game config | Playwright screenshots come back blank/black | Always include in the Phaser game config renderer options |
| 7 | Adding Arcade Physics to a non-physics game | "Cannot read properties of undefined (reading 'add')" | Only enable physics in game config if the genre requires it |
| 8 | Using `this.time.now` for cooldowns | Drifts on slow frames, cooldowns become unreliable | Accumulate delta in a counter variable instead |
```

---

## Notes for skill authors

- This template is rendered during Step 4 (Scaffold) by replacing `{{...}}` placeholders with values derived from the game spec and genre detection.
- The rendered file is placed at the project root as `AGENTS.md` — no other agent instruction files are generated.
- Codex reads this file before executing any goal, so it must be self-contained: stack info, domain knowledge, and pipeline rules all in one place.
