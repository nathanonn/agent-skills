# Genre Templates

Per-genre goal decomposition sequences for the webg-spec-to-goal skill.

Used during:
- **Step 2 (Classify)** — determine which genre the game maps to
- **Step 5 (Plan)** — select the goal sequence and state bridge growth
- **Step 6 (Write)** — fill in per-goal ACs and data structures

---

## Universal Goal 00

Goal 00 is identical for all genres. It verifies the scaffold boots correctly and personalizes it for the specific game.

**Name**: `00-foundation`

**Description**: Verify scaffold boots, customize constants, confirm menu-to-game transition.

**ACs**:
- AC-00.1: Game canvas renders at configured dimensions without console errors
- AC-00.2: MenuScene displays the game title text
- AC-00.3: Pressing SPACE transitions from MenuScene to GameScene
- AC-00.4: State bridge reports `{ scene: 'MenuScene', ready: true }` on boot
- AC-00.5: `constants.ts` contains game-specific values (colors, dimensions, speeds)

**State bridge fields**: `scene`, `ready`

This goal is lightweight — the scaffold already does most of the work. Goal 00 just verifies and personalizes.

---

## Genre 1: Shoot-em-up (shmup)

### Metadata

| Field | Value |
|-------|-------|
| Genre | shoot-em-up |
| Variants | bullet hell, Raiden-type, vertical shooter, horizontal shooter, twin-stick shooter, space shooter |
| Physics | Arcade |
| Gravity | `{ x: 0, y: 0 }` |
| Typical goal count | 7-8 (00 through 07) |

**Key patterns**: bullet pools (Phaser Groups with `maxSize`), wave spawners, collision handlers

**Key data structures**:
- `BulletPool` — Phaser.Physics.Arcade.Group with maxSize, recycle pattern
- `EnemyConfig` — { type, hp, speed, sprite, scoreValue }
- `WaveConfig` — { enemies: EnemyConfig[], spawnDelay, count }

### Goal Sequence

#### 01-player-ship

**Description**: Render player sprite with WASD movement constrained to world bounds.

**ACs**:
- AC-01.1: Player sprite appears at bottom-center of the screen on GameScene start
- AC-01.2: Player x-position changes when A/D or LEFT/RIGHT keys are held
- AC-01.3: Player y-position changes when W/S or UP/DOWN keys are held
- AC-01.4: Player position is clamped to world bounds (cannot exit screen)
- AC-01.5: State bridge reports `playerPosition: { x, y }` updated each frame

**State bridge fields added**: `playerPosition: { x, y }`, `playerAlive`

---

#### 02-player-weapons

**Description**: Player fires projectiles upward using an object pool with configurable fire rate.

**ACs**:
- AC-02.1: Pressing SPACE spawns a bullet at the player's position moving upward
- AC-02.2: Bullets are managed by a Phaser Group with maxSize (pool pattern)
- AC-02.3: Fire rate limits shots to configured interval (holding SPACE does not spray every frame)
- AC-02.4: Bullets are killed/recycled when they exit the top of the screen
- AC-02.5: State bridge reports `playerBullets: { activeCount }` reflecting live bullets

**State bridge fields added**: `playerBullets: { activeCount }`

---

#### 03-enemies

**Description**: Enemies spawn from the top, move downward, and are destroyed by player bullets.

**ACs**:
- AC-03.1: Enemies spawn at random x-positions along the top edge at a configured interval
- AC-03.2: Enemies move downward at their configured speed
- AC-03.3: Bullet-enemy overlap destroys the enemy and deactivates the bullet
- AC-03.4: Enemies that exit the bottom of the screen are recycled
- AC-03.5: State bridge reports `enemies: { activeCount, totalDestroyed }`

**State bridge fields added**: `enemies: { activeCount, totalDestroyed }`

---

#### 04-scoring-health

**Description**: Track score on kills, player takes damage on enemy contact, game over on death.

**ACs**:
- AC-04.1: Score increases by enemy's scoreValue when an enemy is destroyed
- AC-04.2: Player-enemy overlap reduces playerHealth by 1 and grants invulnerability frames
- AC-04.3: During invulnerability, player sprite flashes and collisions are ignored
- AC-04.4: When playerHealth reaches 0, gameOver is set to true and scene pauses or transitions
- AC-04.5: State bridge reports `score`, `playerHealth`, `gameOver`

**State bridge fields added**: `score`, `playerHealth`, `gameOver`

---

#### 05-hud

**Description**: Parallel HUD scene displays score, health, and wave info — reads existing state.

**ACs**:
- AC-05.1: HUDScene runs in parallel with GameScene (scene.launch)
- AC-05.2: Score text updates in real-time as score changes
- AC-05.3: Health display (hearts, bar, or number) reflects current playerHealth
- AC-05.4: Wave number is displayed when wave system is active
- AC-05.5: HUD elements do not interfere with game input

**State bridge fields added**: (none — reads existing fields)

---

#### 06-wave-system

**Description**: Enemies spawn in configured waves with escalating difficulty; clearing all waves wins.

**ACs**:
- AC-06.1: Enemies spawn according to WaveConfig (type, count, delay per wave)
- AC-06.2: Wave advances when all enemies in the current wave are destroyed
- AC-06.3: Each successive wave has more or tougher enemies
- AC-06.4: Clearing the final wave sets gameWon to true
- AC-06.5: State bridge reports `currentWave`, `waveCount`, `gameWon`

**State bridge fields added**: `currentWave`, `waveCount`, `gameWon`

---

#### 07-polish

**Description**: Visual and audio polish — particles, screen shake, parallax background, sound effects.

**ACs**:
- AC-07.1: Particle emitter triggers on enemy destruction
- AC-07.2: Camera shakes briefly when player takes damage
- AC-07.3: Scrolling parallax background creates depth illusion
- AC-07.4: At least one sound effect plays (fire or explosion)
- AC-07.5: Game feels complete as a playable vertical slice

**State bridge fields added**: (none — visual/audio only)

---

### State Bridge Growth

| Goal | New Fields |
|------|-----------|
| 00 | `scene`, `ready` |
| 01 | `playerPosition: { x, y }`, `playerAlive` |
| 02 | `playerBullets: { activeCount }` |
| 03 | `enemies: { activeCount, totalDestroyed }` |
| 04 | `score`, `playerHealth`, `gameOver` |
| 05 | (none — HUD reads existing) |
| 06 | `currentWave`, `waveCount`, `gameWon` |
| 07 | (none — visual/audio only) |

### Variant Modifications

| Variant | Changes |
|---------|---------|
| **bullet hell** | Goal 03: enemies fire dense bullet patterns; add enemy bullet pool and pattern configs |
| **Raiden-type** | Goal 02: multiple weapon types, power-up cycling; Goal 07: add bomb/special weapon |
| **vertical shooter** | Default sequence (no changes) |
| **horizontal shooter** | Goal 01: player on left side, moves vertically; Goal 02: bullets fire rightward; Goal 03: enemies spawn from right |
| **twin-stick shooter** | Goal 01: add pointer/right-stick aiming; Goal 02: fire in aim direction (not just up); gravity stays 0 |
| **space shooter** | Goal 07: star field parallax; Goal 03: asteroid obstacles added |

### Optional Goals

- **Boss Fight**: Large enemy with phases, health bar, attack patterns (insert after Goal 06)
- **Power-ups/Pickups**: Dropped items (weapon upgrades, shields, speed boost) — adds pickup pool and effect system
- **High Score**: Persist best score in localStorage, display on menu

---

## Genre 2: Card Game

### Metadata

| Field | Value |
|-------|-------|
| Genre | card-game |
| Variants | deck-builder, Slay the Spire-type, solitaire, matching/memory, poker variant, blackjack |
| Physics | None |
| Gravity | N/A |
| Typical goal count | 7 (00 through 07) |

**Key patterns**: data-driven card definitions, array manipulation (deck/hand/discard), tween animations, turn state machine

**Key data structures**:
- `CardDef` — { id, name, cost, type, value, description }
- `GameState` — { deck: CardDef[], hand: CardDef[], discard: CardDef[], energy, maxEnergy }
- `EnemyDef` — { name, hp, maxHp, intentPool: Intent[] }
- `Intent` — { type: 'attack' | 'defend' | 'buff', value }

### Goal Sequence

#### 01-card-data-display

**Description**: Define CardDef interface and render cards as visual containers with text.

**ACs**:
- AC-01.1: CardDef interface exists with id, name, cost, type, value, description fields
- AC-01.2: At least 5 starter cards are defined in a data file
- AC-01.3: A card renders as a rectangle with name and cost visible
- AC-01.4: Cards can be created from CardDef data programmatically
- AC-01.5: State bridge reports `cardCount: { total }` reflecting defined cards

**State bridge fields added**: `cardCount: { total }`

---

#### 02-deck-hand-management

**Description**: Implement deck, hand, and discard piles with shuffle, draw, and hand layout.

**ACs**:
- AC-02.1: Game starts with a shuffled deck of starter cards
- AC-02.2: Drawing moves a card from deck to hand (hand visually fans out)
- AC-02.3: Turn start draws cards up to configured hand size
- AC-02.4: When deck is empty, discard pile reshuffles into deck
- AC-02.5: State bridge reports `deck: { count }`, `hand: { count }`, `discard: { count }`

**State bridge fields added**: `deck: { count }`, `hand: { count }`, `discard: { count }`

---

#### 03-card-play-energy

**Description**: Cards cost energy to play; clicking a card plays it if affordable, then discards it.

**ACs**:
- AC-03.1: Energy starts at maxEnergy each turn and is displayed
- AC-03.2: Clicking a card with sufficient energy plays it (triggers effect) and subtracts cost
- AC-03.3: Clicking a card with insufficient energy shows feedback (shake, flash red)
- AC-03.4: Played cards move to discard pile
- AC-03.5: State bridge reports `energy: { current, max }`

**State bridge fields added**: `energy: { current, max }`

---

#### 04-enemy-combat

**Description**: Enemy with HP, turn-based structure, and damage resolution.

**ACs**:
- AC-04.1: Enemy appears with visible HP bar
- AC-04.2: Attack cards reduce enemy HP by their value
- AC-04.3: Ending player turn triggers enemy action (damage to player)
- AC-04.4: Player has HP that decreases when enemy attacks
- AC-04.5: State bridge reports `enemy: { hp, maxHp }`, `player: { hp, maxHp }`, `turn`

**State bridge fields added**: `enemy: { hp, maxHp }`, `player: { hp, maxHp }`, `turn`

---

#### 05-defense-armor

**Description**: Block/armor cards absorb damage, armor resets each turn.

**ACs**:
- AC-05.1: Defense cards add armor value to player's armor pool
- AC-05.2: Enemy damage is absorbed by armor first, then HP
- AC-05.3: Armor resets to 0 at the start of each player turn
- AC-05.4: Armor value is displayed on the player character
- AC-05.5: State bridge reports `player: { armor }` (added to existing player fields)

**State bridge fields added**: `player: { armor }` (extends player object)

---

#### 06-enemy-ai-encounters

**Description**: Enemy decision tree with intents, multiple enemy types, encounter progression.

**ACs**:
- AC-06.1: Enemy displays intent icon showing next action before it acts
- AC-06.2: Enemy selects actions from an intent pool (attack, defend, buff)
- AC-06.3: At least 3 enemy types with different stat profiles exist
- AC-06.4: Defeating an enemy loads the next encounter
- AC-06.5: State bridge reports `encounter: { current, total }`, `enemy: { intent }`

**State bridge fields added**: `encounter: { current, total }`, `enemy: { intent }`

---

#### 07-ui-polish

**Description**: Visual polish — HP bars, energy orbs, floating damage numbers, hover effects.

**ACs**:
- AC-07.1: HP bars animate smoothly when values change
- AC-07.2: Energy is shown as discrete orbs (filled/empty)
- AC-07.3: Floating damage numbers appear on hit and fade out
- AC-07.4: Cards scale up and glow on hover
- AC-07.5: Turn transitions have brief tween animations

**State bridge fields added**: (none — visual only)

---

### State Bridge Growth

| Goal | New Fields |
|------|-----------|
| 00 | `scene`, `ready` |
| 01 | `cardCount: { total }` |
| 02 | `deck: { count }`, `hand: { count }`, `discard: { count }` |
| 03 | `energy: { current, max }` |
| 04 | `enemy: { hp, maxHp }`, `player: { hp, maxHp }`, `turn` |
| 05 | `player: { armor }` |
| 06 | `encounter: { current, total }`, `enemy: { intent }` |
| 07 | (none — visual only) |

### Variant Modifications

| Variant | Changes |
|---------|---------|
| **deck-builder** | Goal 06: add card reward selection after each encounter; add `deckSize` to state bridge |
| **Slay the Spire-type** | Default sequence (matches closely); Goal 06 may add map/path selection |
| **solitaire** | Remove Goals 04-06 entirely; replace with: tableau layout, card stacking rules, win detection |
| **matching/memory** | Replace Goals 01-06: grid of face-down cards, flip mechanic, pair matching, move counter |
| **poker variant** | Replace Goals 03-06: hand evaluation, betting rounds, pot management, AI opponents |
| **blackjack** | Replace Goals 03-06: hit/stand/double, dealer AI, bet system, bust detection |

### Optional Goals

- **Card Rewards**: Choose 1 of 3 cards after each encounter to add to deck
- **Shop**: Spend gold to buy/remove cards between encounters
- **Relics/Passives**: Persistent buffs that modify rules
- **Map/Path**: Branching path with encounter types (fight, shop, rest, elite)

---

## Genre 3: Platformer

### Metadata

| Field | Value |
|-------|-------|
| Genre | platformer |
| Variants | endless runner, side-scroller, precision platformer, metroidvania-lite, Mario-type |
| Physics | Arcade |
| Gravity | `{ x: 0, y: 300 }` |
| Typical goal count | 6-7 (00 through 06) |

**Key patterns**: player body with gravity, tilemap/platform collision, one-way platforms, coyote time

**Key data structures**:
- `PlayerState` — { grounded, jumping, coyoteTimer, velocityX, velocityY }
- `LevelConfig` — { platforms: Platform[], collectibles: Pos[], hazards: Pos[], exit: Pos }
- `Platform` — { x, y, width, height, oneWay?: boolean, moving?: { dx, dy, speed } }

### Goal Sequence

#### 01-player-movement

**Description**: Player sprite with gravity, horizontal movement, and jump when grounded.

**ACs**:
- AC-01.1: Player spawns and falls under gravity until hitting a surface
- AC-01.2: A/D or LEFT/RIGHT moves player horizontally at configured speed
- AC-01.3: SPACE or UP makes player jump only when grounded (body.blocked.down or onFloor)
- AC-01.4: Jump height is consistent and feels responsive (tuned jumpVelocity)
- AC-01.5: State bridge reports `playerPosition: { x, y }`, `playerGrounded`

**State bridge fields added**: `playerPosition: { x, y }`, `playerGrounded`, `playerAlive`

---

#### 02-platforms-collision

**Description**: Static platforms or tilemap for the player to land on and traverse.

**ACs**:
- AC-02.1: Multiple platforms exist at various heights forming a traversable level
- AC-02.2: Player collides with platforms and lands on them (stops falling)
- AC-02.3: Player cannot pass through platform tops (solid collision)
- AC-02.4: At least one platform requires jumping to reach
- AC-02.5: State bridge reports `platforms: { count }` reflecting placed platforms

**State bridge fields added**: `platforms: { count }`

---

#### 03-collectibles

**Description**: Coins or gems that the player collects by overlapping, tracked as score.

**ACs**:
- AC-03.1: Collectible items are placed throughout the level
- AC-03.2: Player-collectible overlap removes the collectible and increments score
- AC-03.3: A visual/audio cue plays on collection
- AC-03.4: Score persists across the level (not reset on collection)
- AC-03.5: State bridge reports `score`, `collectibles: { collected, total }`

**State bridge fields added**: `score`, `collectibles: { collected, total }`

---

#### 04-hazards-enemies

**Description**: Patrol enemies and static hazards that damage or kill the player.

**ACs**:
- AC-04.1: At least one enemy patrols between two points (back and forth)
- AC-04.2: Player touching an enemy from the side or below takes damage
- AC-04.3: Player landing on top of an enemy (bounce-kill) destroys it
- AC-04.4: Static hazards (spikes) kill or damage the player on contact
- AC-04.5: State bridge reports `playerHealth`, `enemies: { activeCount }`

**State bridge fields added**: `playerHealth`, `enemies: { activeCount }`

---

#### 05-level-progression

**Description**: Multiple levels with an exit condition and scene transitions.

**ACs**:
- AC-05.1: An exit object (door, flag, portal) exists in each level
- AC-05.2: Reaching the exit triggers transition to the next level
- AC-05.3: At least 2 distinct level layouts exist
- AC-05.4: Score carries over between levels
- AC-05.5: State bridge reports `currentLevel`, `levelCount`

**State bridge fields added**: `currentLevel`, `levelCount`

---

#### 06-hud-polish

**Description**: HUD display plus visual polish — death animation, parallax, particles.

**ACs**:
- AC-06.1: HUD shows current score and health/lives
- AC-06.2: Player death triggers a brief animation before respawn/game-over
- AC-06.3: Parallax scrolling background adds depth
- AC-06.4: Particle effects on collection or enemy defeat
- AC-06.5: Game over screen shown when lives/health reach 0

**State bridge fields added**: `lives`, `gameOver`

---

### State Bridge Growth

| Goal | New Fields |
|------|-----------|
| 00 | `scene`, `ready` |
| 01 | `playerPosition: { x, y }`, `playerGrounded`, `playerAlive` |
| 02 | `platforms: { count }` |
| 03 | `score`, `collectibles: { collected, total }` |
| 04 | `playerHealth`, `enemies: { activeCount }` |
| 05 | `currentLevel`, `levelCount` |
| 06 | `lives`, `gameOver` |

### Variant Modifications

| Variant | Changes |
|---------|---------|
| **endless runner** | Goal 01: auto-run (no left/right), jump only; Goal 02: procedurally generated platforms; Goal 05: no discrete levels, distance-based score |
| **side-scroller** | Default sequence with camera follow; Goal 02: wider levels with scrolling |
| **precision platformer** | Goal 01: add coyote time, variable jump height; Goal 04: one-hit death (no HP); Goal 02: tight precise platform placement |
| **metroidvania-lite** | Goal 05: interconnected map instead of linear levels; add ability unlock goal (double jump, dash) |
| **Mario-type** | Default sequence; Goal 03: add power-up items (grow, fire flower); Goal 04: stomp is primary attack |

### Optional Goals

- **Double Jump/Dash**: Unlock extra movement ability mid-game
- **Moving Platforms**: Platforms that translate on paths (adds to Goal 02)
- **Checkpoints**: Respawn at last checkpoint instead of level start
- **Wall Jump**: Slide on walls + jump off them

---

## Genre 4: Tower Defense

### Metadata

| Field | Value |
|-------|-------|
| Genre | tower-defense |
| Variants | lane defense, classic TD, creep wave, placement strategy |
| Physics | None |
| Gravity | N/A (path-based movement, manual grid collision) |
| Typical goal count | 7-8 (00 through 07) |

**Key patterns**: grid system, waypoint pathfinding (lerp between points), tower targeting (nearest/first), projectile spawning

**Key data structures**:
- `GridCell` — { row, col, type: 'path' | 'buildable' | 'blocked', tower?: TowerDef }
- `Waypoint` — { x, y } (world coordinates along the path)
- `TowerDef` — { type, damage, range, fireRate, cost, tier }
- `EnemyDef` — { type, hp, speed, goldValue }
- `WaveConfig` — { enemies: { type, count, interval }[], delay }

### Goal Sequence

#### 01-grid-system

**Description**: Render a grid world with path cells and buildable cells; implement coordinate conversion.

**ACs**:
- AC-01.1: Grid renders with visually distinct path and buildable cells
- AC-01.2: Grid-to-world and world-to-grid coordinate conversion functions work correctly
- AC-01.3: Path is defined as a series of waypoints through the grid
- AC-01.4: Clicking a cell identifies its type (path/buildable/blocked)
- AC-01.5: State bridge reports `grid: { rows, cols, pathLength }`

**State bridge fields added**: `grid: { rows, cols, pathLength }`

---

#### 02-enemies-paths

**Description**: Enemies follow the waypoint path using lerp; reaching the end costs a life.

**ACs**:
- AC-02.1: Enemies spawn at the path start point
- AC-02.2: Enemies lerp between waypoints at their configured speed
- AC-02.3: Enemies face their direction of movement
- AC-02.4: An enemy reaching the final waypoint is removed and reduces player lives by 1
- AC-02.5: State bridge reports `enemies: { activeCount }`, `lives`

**State bridge fields added**: `enemies: { activeCount }`, `lives`

---

#### 03-tower-placement

**Description**: Select a tower type and place it on a valid buildable cell, spending gold.

**ACs**:
- AC-03.1: Tower type selector UI allows choosing from available tower types
- AC-03.2: Clicking a buildable cell places the selected tower if player has enough gold
- AC-03.3: Placing a tower deducts its cost from player gold
- AC-03.4: Cannot place on path cells, blocked cells, or cells with existing towers
- AC-03.5: State bridge reports `towers: { count }`, `gold`

**State bridge fields added**: `towers: { count }`, `gold`

---

#### 04-tower-shooting

**Description**: Towers detect enemies in range, fire projectiles, and deal damage.

**ACs**:
- AC-04.1: Towers detect enemies within their configured range radius
- AC-04.2: Towers fire projectiles at the targeted enemy at their configured fire rate
- AC-04.3: Projectile hitting an enemy reduces its HP
- AC-04.4: Enemies with 0 HP are destroyed and award gold
- AC-04.5: State bridge reports `enemies: { totalDestroyed }`, updates `gold` on kill

**State bridge fields added**: `enemies: { totalDestroyed }`

---

#### 05-wave-system

**Description**: Enemies spawn in configured waves; player initiates waves; difficulty escalates.

**ACs**:
- AC-05.1: Waves are defined with enemy types, counts, and spawn intervals
- AC-05.2: Player clicks a button to start the next wave (not auto-start)
- AC-05.3: Each successive wave has more or tougher enemies
- AC-05.4: Clearing all waves triggers a win condition
- AC-05.5: State bridge reports `currentWave`, `waveCount`, `waveActive`, `gameWon`

**State bridge fields added**: `currentWave`, `waveCount`, `waveActive`, `gameWon`

---

#### 06-upgrades-economy

**Description**: Towers can be upgraded in tiers; sell towers for partial refund; gold from kills.

**ACs**:
- AC-06.1: Clicking an existing tower shows upgrade option with cost
- AC-06.2: Upgrading increases tower stats (damage, range, or fire rate) and changes appearance
- AC-06.3: Towers have a max tier (cannot upgrade beyond it)
- AC-06.4: Selling a tower returns a percentage of total investment
- AC-06.5: State bridge reports `towers: { maxTier }` or per-tower tier info

**State bridge fields added**: `towers: { maxTier }`

---

#### 07-polish

**Description**: Tower variety, visual effects, improved UI, and audio.

**ACs**:
- AC-07.1: At least 3 distinct tower types with different behaviors (e.g., splash, slow, sniper)
- AC-07.2: Range indicator shown on hover/selection
- AC-07.3: Enemy health bars visible above each enemy
- AC-07.4: Visual effects on projectile impact
- AC-07.5: Game over screen when lives reach 0

**State bridge fields added**: `gameOver`

---

### State Bridge Growth

| Goal | New Fields |
|------|-----------|
| 00 | `scene`, `ready` |
| 01 | `grid: { rows, cols, pathLength }` |
| 02 | `enemies: { activeCount }`, `lives` |
| 03 | `towers: { count }`, `gold` |
| 04 | `enemies: { totalDestroyed }` |
| 05 | `currentWave`, `waveCount`, `waveActive`, `gameWon` |
| 06 | `towers: { maxTier }` |
| 07 | `gameOver` |

### Variant Modifications

| Variant | Changes |
|---------|---------|
| **lane defense** | Goal 01: grid is lanes (rows) with enemies in each lane; Goal 03: towers placed in specific lane slots |
| **classic TD** | Default sequence (no changes) |
| **creep wave** | Goal 02: enemies come in tight groups; Goal 05: waves auto-start with short break between |
| **placement strategy** | Goal 03: limited tower slots, emphasis on positioning; Goal 06: add tower synergies/combos |

### Optional Goals

- **Maze Building**: Players create the path by placing towers (enemies pathfind around them)
- **Special Abilities**: Player-activated powers (freeze all, airstrike) on cooldown
- **Boss Waves**: Every Nth wave has a boss enemy with high HP and special behavior
- **Fast Forward**: 2x speed toggle for experienced players

---

## Genre 5: Puzzle

### Metadata

| Field | Value |
|-------|-------|
| Genre | puzzle |
| Variants | match-3, Tetris-type, sliding puzzle, word game, Bejeweled-type |
| Physics | None (or minimal Arcade for drop animation) |
| Gravity | N/A (manual grid gravity simulation) |
| Typical goal count | 6-7 (00 through 06) |

**Key patterns**: 2D grid state matrix, match detection algorithm, gravity/cascade, chain combos, input validation (valid moves only)

**Key data structures**:
- `Grid` — 2D array `GemType[][]` (number or enum for each gem color)
- `Position` — { row, col }
- `Match` — { positions: Position[], length }
- `SwapAction` — { from: Position, to: Position }

### Goal Sequence

#### 01-grid-gems

**Description**: Render a grid filled with random gem types as colored shapes.

**ACs**:
- AC-01.1: Grid renders as an NxM matrix of colored shapes (circles, squares, or sprites)
- AC-01.2: Each cell contains one of K gem types (represented by distinct colors)
- AC-01.3: Grid is randomly filled on scene start with no initial matches (or matches are pre-cleared)
- AC-01.4: Grid state is stored in a 2D array data structure
- AC-01.5: State bridge reports `grid: { rows, cols, gemTypes }`

**State bridge fields added**: `grid: { rows, cols, gemTypes }`

---

#### 02-input-swap

**Description**: Click two adjacent gems to swap them; reject invalid swaps.

**ACs**:
- AC-02.1: Clicking a gem selects it (visual highlight)
- AC-02.2: Clicking an adjacent gem (up/down/left/right) swaps the two
- AC-02.3: Clicking a non-adjacent gem changes selection to the new gem
- AC-02.4: Swap animates (tween) the two gems to their new positions
- AC-02.5: State bridge reports `selectedGem: { row, col } | null`, `swapCount`

**State bridge fields added**: `selectedGem: { row, col } | null`, `swapCount`

---

#### 03-match-detection

**Description**: Detect 3+ in a row/column after a swap, remove matches, and award score.

**ACs**:
- AC-03.1: After a swap, the grid is scanned for 3+ consecutive same-type gems in rows and columns
- AC-03.2: Matched gems are removed (visually disappear) from the grid
- AC-03.3: If a swap creates no matches, the swap is reversed (invalid move)
- AC-03.4: Score increases based on number of gems matched
- AC-03.5: State bridge reports `score`, `matches: { lastMatchCount }`

**State bridge fields added**: `score`, `matches: { lastMatchCount }`

---

#### 04-gravity-cascade

**Description**: After matches are removed, gems fall to fill gaps; new gems spawn at the top.

**ACs**:
- AC-04.1: After match removal, gems above empty cells fall down (gravity simulation)
- AC-04.2: Falling gems animate smoothly to their new positions
- AC-04.3: Empty cells at the top are filled with new random gems
- AC-04.4: After settling, the grid is re-scanned for new matches (chain/cascade)
- AC-04.5: State bridge reports `cascadeDepth` (number of chain reactions in current turn)

**State bridge fields added**: `cascadeDepth`

---

#### 05-scoring-combos

**Description**: Points scale with match size and cascade depth; combo multiplier and UI feedback.

**ACs**:
- AC-05.1: Larger matches (4+, 5+) award more points than 3-matches
- AC-05.2: Cascade chains multiply the score (combo multiplier increases per cascade level)
- AC-05.3: Combo counter or multiplier displays during cascades
- AC-05.4: Floating score numbers appear where matches occur
- AC-05.5: State bridge reports `comboMultiplier`, `highestCombo`

**State bridge fields added**: `comboMultiplier`, `highestCombo`

---

#### 06-polish

**Description**: Special gems, animations, audio, and particle effects.

**ACs**:
- AC-06.1: Matching 4+ creates a special gem (line clear, bomb, or color bomb)
- AC-06.2: Special gems have unique destruction patterns when matched
- AC-06.3: Particle effects play on gem destruction
- AC-06.4: Sound effects for swap, match, and cascade
- AC-06.5: Game has a win/loss condition (timer, move limit, or target score)

**State bridge fields added**: `specialGems: { count }`, `gameOver`, `gameWon`

---

### State Bridge Growth

| Goal | New Fields |
|------|-----------|
| 00 | `scene`, `ready` |
| 01 | `grid: { rows, cols, gemTypes }` |
| 02 | `selectedGem: { row, col } | null`, `swapCount` |
| 03 | `score`, `matches: { lastMatchCount }` |
| 04 | `cascadeDepth` |
| 05 | `comboMultiplier`, `highestCombo` |
| 06 | `specialGems: { count }`, `gameOver`, `gameWon` |

### Variant Modifications

| Variant | Changes |
|---------|---------|
| **match-3** | Default sequence (no changes) |
| **Tetris-type** | Replace all goals: falling pieces, rotation, line clear, speed increase, game over on stack overflow |
| **sliding puzzle** | Replace Goals 02-04: one empty cell, slide tiles into empty space, no matching — solve to win |
| **word game** | Replace Goals 01-04: letter grid, word selection by path, dictionary validation, word scoring |
| **Bejeweled-type** | Default sequence (match-3 is the Bejeweled pattern) |

### Optional Goals

- **Power-ups**: Activatable abilities (shuffle board, destroy color, hint)
- **Level Goals**: Per-level objectives (collect N blue gems, reach X score in Y moves)
- **Timed Mode**: Countdown timer adds urgency
- **Endless Mode**: No win condition, play for high score

---

## Universal QC Checkpoint Goal

The QC checkpoint is always the LAST goal in the sequence for any genre. Its goal number is the highest (e.g., if the last feature/polish goal is 07, QC is 08).

**Name**: `{{NN}}-qc-checkpoint`

**Description**: Final validation — full gameplay loop, state bridge regression, difficulty balance, integration test.

**ACs** (same for all genres):
- AC-{{NN}}.1: Full gameplay loop completes without errors: boot → menu → play → win → end screen → restart → play again
- AC-{{NN}}.2: Full gameplay loop completes the loss path: boot → menu → play → lose → game over → restart → play again
- AC-{{NN}}.3: State bridge reports correct values at every stage (validated by integration test)
- AC-{{NN}}.4: No console errors or warnings during a full play session
- AC-{{NN}}.5: Scene restart cleans all state (no leaks from previous run)
- AC-{{NN}}.6: Difficulty progression is smooth (no sudden spikes or trivial sections)
- AC-{{NN}}.7: All prior goals' tests still pass (full regression)

**State bridge fields**: (none — validates existing fields only)

**Key output**: `tests/game/integration.spec.ts` — a Playwright test that exercises the full gameplay loop via state bridge assertions.

See `references/qc-checkpoint-template.md` for the full GOAL.md template.

---

## AC Format Reference

All ACs use the stable ID format `AC-XX.Y`:
- `XX` = two-digit goal number (00, 01, 02, ...)
- `Y` = AC number within that goal (1, 2, 3, 4, 5)

ACs must be **testable via state bridge** wherever possible:
- GOOD: "Player x-position increases when D key is held for 500ms"
- GOOD: "Enemies.activeCount decreases by 1 when a bullet overlaps an enemy"
- GOOD: "Score increases by enemy's scoreValue when an enemy is destroyed"
- BAD: "The game feels responsive" (not testable)
- BAD: "The UI looks good" (subjective)
- BAD: "Performance is acceptable" (vague)

Visual/audio ACs (typically in polish goals) are acceptable even though they cannot be verified through state bridge alone — they are verified by human observation during the polish phase.
