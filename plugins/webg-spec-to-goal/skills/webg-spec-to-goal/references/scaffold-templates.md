# Scaffold Templates — Phaser 3 web game

Read this file when scaffolding a new Phaser 3 game project (Step 4 of the skill flow). Each section contains the exact file contents to write to disk. Substitute every `{{...}}` placeholder with values confirmed in Steps 2-3. Genre-conditional blocks are marked clearly — include the matching block and omit the others.

AGENTS.md is NOT in this file — it has its own template at `references/agents-template.md`.

After scaffolding, running `npm install && npm run dev` must produce a working title screen at `http://localhost:8080`. The scaffold must boot cleanly with zero errors.

---

## File Tree

```
{{slug}}/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .gitignore
├── public/
│   ├── style.css
│   └── assets/
│       ├── images/.gitkeep
│       ├── audio/.gitkeep
│       └── data/.gitkeep
├── src/
│   ├── main.ts
│   ├── state-bridge.ts
│   └── game/
│       ├── main.ts
│       ├── configs/
│       │   └── constants.ts
│       └── scenes/
│           ├── BootScene.ts
│           ├── MenuScene.ts
│           ├── GameScene.ts
│           └── GameOverScene.ts
└── tests/
    ├── playwright.config.ts
    └── game/
        ├── helpers.ts
        └── boot.spec.ts
```

---

## index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{title}}</title>
  <link rel="stylesheet" href="/public/style.css" />
</head>
<body>
  <div id="game-container"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

---

## package.json

```json
{
  "name": "{{slug}}",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 8080",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "npx playwright test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "phaser": "^3.80.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.4.0",
    "@playwright/test": "^1.44.0"
  }
}
```

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## vite.config.ts

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 8080,
    open: false,
  },
  build: {
    outDir: 'dist',
  },
});
```

---

## .gitignore

```
node_modules/
dist/
test-results/
goals/*/test-artifacts/
.DS_Store
```

---

## public/style.css

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #000;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  overflow: hidden;
}

#game-container {
  max-width: {{width}}px;
  max-height: {{height}}px;
}
```

---

## public/assets/images/.gitkeep

```
```

---

## public/assets/audio/.gitkeep

```
```

---

## public/assets/data/.gitkeep

```
```

---

## src/main.ts

```typescript
import { gameConfig } from './game/main';
import { updateGameState } from './state-bridge';

const game = new Phaser.Game(gameConfig);

// Update state bridge every frame
game.events.on('step', () => {
  updateGameState(game);
});

// Expose game instance for debugging
(window as any).__PHASER_GAME__ = game;
```

---

## src/state-bridge.ts

```typescript
/**
 * State Bridge — exposes game state to window.__GAME_STATE__ for Playwright testing.
 *
 * Each goal adds new fields to GameState as needed.
 * NEVER remove existing fields — only add new ones.
 */

export interface GameState {
  scene: string;
  ready: boolean;
  score: number;
  gameOver: boolean;
  // --- Goal 00 adds fields below this line ---
  // --- Goal 01 adds fields below this line ---
  // --- Goal 02 adds fields below this line ---
  // --- Goal 03 adds fields below this line ---
  // --- Goal 04 adds fields below this line ---
}

declare global {
  interface Window {
    __GAME_STATE__: GameState;
  }
}

/**
 * Returns the key of the currently active (running) scene.
 */
function getActiveSceneKey(game: Phaser.Game): string {
  const scenes = game.scene.getScenes(true);
  if (scenes.length > 0) {
    return scenes[0].scene.key;
  }
  return 'unknown';
}

/**
 * Called every frame via game.events 'step'.
 * Reads current game state and writes to window.__GAME_STATE__.
 */
export function updateGameState(game: Phaser.Game): void {
  const activeScene = getActiveSceneKey(game);
  const isReady = game.scene.getScenes(true).length > 0;

  const state: GameState = {
    scene: activeScene,
    ready: isReady,
    score: game.registry.get('score') ?? 0,
    gameOver: game.registry.get('gameOver') ?? false,
    // --- Goal 00 populates fields below this line ---
    // --- Goal 01 populates fields below this line ---
    // --- Goal 02 populates fields below this line ---
    // --- Goal 03 populates fields below this line ---
    // --- Goal 04 populates fields below this line ---
  };

  window.__GAME_STATE__ = state;
}
```

---

## src/game/main.ts

This file has genre-conditional physics configuration. Include only the matching block.

```typescript
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { GAME_WIDTH, GAME_HEIGHT } from './configs/constants';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#000000',
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    pixelArt: {{pixelArt}},
    preserveDrawingBuffer: true,
  },
  {{physics_block}}
};
```

### Genre-conditional: physics_block

**If shoot-em-up:**

```typescript
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
```

**If platformer:**

```typescript
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 300 },
      debug: false,
    },
  },
```

**If card-game / tower-defense / puzzle (no physics needed):**

Omit the `physics` key entirely from the config object.

---

## src/game/configs/constants.ts

```typescript
/**
 * Scene keys — use these everywhere instead of raw strings.
 */
export const SCENE_KEYS = {
  BOOT: 'BootScene',
  MENU: 'MenuScene',
  GAME: 'GameScene',
  GAME_OVER: 'GameOverScene',
  HUD: 'HUDScene',
} as const;

/**
 * Game dimensions.
 */
export const GAME_WIDTH = {{width}};
export const GAME_HEIGHT = {{height}};

/**
 * Placeholder colors for geometric shapes (used before final art arrives).
 * Values are hex numbers for Phaser graphics (0xRRGGBB).
 */
export const COLORS = {
  PLAYER: 0x00ff00,
  ENEMY: 0xff0000,
  BULLET: 0xffff00,
  BACKGROUND: 0x111111,
  UI_TEXT: 0xffffff,
  ACCENT: 0x00aaff,
} as const;

// --- Goal 00 adds constants below this line ---
// --- Goal 01 adds constants below this line ---
// --- Goal 02 adds constants below this line ---
// --- Goal 03 adds constants below this line ---
// --- Goal 04 adds constants below this line ---
```

---

## src/game/scenes/BootScene.ts

```typescript
import Phaser from 'phaser';
import { SCENE_KEYS } from '../configs/constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.BOOT });
  }

  preload(): void {
    // Shared assets are loaded here.
    // Future goals add asset loading in this method.
  }

  create(): void {
    // Initialize registry defaults
    this.registry.set('score', 0);
    this.registry.set('gameOver', false);

    // Transition to menu
    this.scene.start(SCENE_KEYS.MENU);
  }
}
```

---

## src/game/scenes/MenuScene.ts

```typescript
import Phaser from 'phaser';
import { SCENE_KEYS, GAME_WIDTH, GAME_HEIGHT, COLORS } from '../configs/constants';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.MENU });
  }

  create(): void {
    // Game title
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, '{{title}}', {
      fontSize: '48px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Start instruction
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50, 'Press SPACE to start', {
      fontSize: '20px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Listen for SPACE key to start game
    const spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    spaceKey.once('down', () => {
      this.scene.start(SCENE_KEYS.GAME);
    });
  }
}
```

---

## src/game/scenes/GameScene.ts

```typescript
import Phaser from 'phaser';
import { SCENE_KEYS } from '../configs/constants';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.GAME });
  }

  create(): void {
    // Reset score on new game
    this.registry.set('score', 0);
    this.registry.set('gameOver', false);

    // Goal 01 adds core mechanic here
  }

  update(_time: number, _delta: number): void {
    // Goal 01 adds game loop here
  }
}
```

---

## src/game/scenes/GameOverScene.ts

```typescript
import Phaser from 'phaser';
import { SCENE_KEYS, GAME_WIDTH, GAME_HEIGHT } from '../configs/constants';

export class GameOverScene extends Phaser.Scene {
  private finalScore: number = 0;

  constructor() {
    super({ key: SCENE_KEYS.GAME_OVER });
  }

  init(data: { score?: number }): void {
    this.finalScore = data.score ?? this.registry.get('score') ?? 0;
  }

  create(): void {
    // Mark game as over in registry
    this.registry.set('gameOver', true);

    // Game Over text
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, 'GAME OVER', {
      fontSize: '48px',
      color: '#ff0000',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Score display
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, `Score: ${this.finalScore}`, {
      fontSize: '28px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Restart instruction
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, 'Press SPACE to restart', {
      fontSize: '20px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Listen for SPACE key to restart
    const spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    spaceKey.once('down', () => {
      this.scene.start(SCENE_KEYS.GAME);
    });
  }
}
```

---

## tests/playwright.config.ts

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/game',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:8080',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 15000,
  },
});
```

---

## tests/game/helpers.ts

```typescript
import { Page } from '@playwright/test';

interface GameState {
  scene: string;
  ready: boolean;
  score: number;
  gameOver: boolean;
  [key: string]: unknown;
}

/**
 * Returns the current game state from window.__GAME_STATE__.
 */
export async function getGameState(page: Page): Promise<GameState> {
  return await page.evaluate(() => (window as any).__GAME_STATE__) as GameState;
}

/**
 * Waits until __GAME_STATE__.scene equals the given key.
 */
export async function waitForScene(
  page: Page,
  sceneKey: string,
  timeout: number = 10000
): Promise<void> {
  await page.waitForFunction(
    (key) => (window as any).__GAME_STATE__?.scene === key,
    sceneKey,
    { timeout }
  );
}

/**
 * Simulates a key press: keyDown, wait, keyUp.
 */
export async function pressKey(
  page: Page,
  key: string,
  duration: number = 100
): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(duration);
  await page.keyboard.up(key);
}

/**
 * Waits until the game is fully ready (__GAME_STATE__.ready === true).
 */
export async function waitForGameReady(
  page: Page,
  timeout: number = 15000
): Promise<void> {
  await page.waitForFunction(
    () => (window as any).__GAME_STATE__?.ready === true,
    undefined,
    { timeout }
  );
}
```

---

## tests/game/boot.spec.ts

```typescript
import { test, expect } from '@playwright/test';
import { getGameState, waitForGameReady, waitForScene, pressKey } from './helpers';

test.describe('Game Boot', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('game boots and reaches menu', async ({ page }) => {
    await waitForGameReady(page);
    await waitForScene(page, 'MenuScene');

    const state = await getGameState(page);
    expect(state.scene).toBe('MenuScene');
    expect(state.ready).toBe(true);
  });

  test('state bridge reports correct scene', async ({ page }) => {
    await waitForGameReady(page);
    await waitForScene(page, 'MenuScene');

    const state = await getGameState(page);
    expect(state.scene).toBe('MenuScene');
    expect(state.score).toBe(0);
    expect(state.gameOver).toBe(false);
  });

  test('space key starts game', async ({ page }) => {
    await waitForGameReady(page);
    await waitForScene(page, 'MenuScene');

    await pressKey(page, 'Space', 100);
    await waitForScene(page, 'GameScene');

    const state = await getGameState(page);
    expect(state.scene).toBe('GameScene');
  });
});
```
