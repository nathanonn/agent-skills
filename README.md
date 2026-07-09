# Agent Skills

Curated collection of agent skills for autonomous development workflows. Install them into **Claude Code**, **Codex**, **Cursor**, **GitHub Copilot**, and other agents — via the Claude Code plugin marketplace or the open Agent Skills CLI.

By [Nathan Onn](https://www.nathanonn.com)

---

## Skills

### ask-first

**Ask clarifying questions before executing tasks.**

Turns Claude into a thoughtful collaborator that asks the right questions before jumping into work. Uses structured Q&A batches (2-4 questions per round with recommendations) to reach 95% confidence, then executes. Prevents assumptions, surfaces ambiguities, and respects your time by only asking what actually matters.

**Trigger:** `/ask-first`, "ask me questions first", "clarify before doing", prefix tasks with "ask:"

### cli-spec-to-goal

**Convert a Node.js CLI tool spec into a Codex /goal-ready bundle.**

Turn a rough CLI tool idea (even a vague one) into the three files Codex `/goal` needs to drive autonomous implementation: GOAL.md, VERIFY.md, and PROGRESS.md. Bakes in six AI-agent-friendly patterns (--json, stdout/stderr separation, exit codes, structured errors, TTY detection, --dry-run) into every goal. Optionally scaffolds a complete CLI project (bin/, src/, package.json, AGENTS.md, CLAUDE.md).

**Supports:** JavaScript (default) and TypeScript, commander.js, Vitest, conditional SQLite and cosmiconfig.

> **Prerequisite:** This skill generates goal bundles for the [Codex /goal](https://docs.openai.com/codex) autonomous coding workflow. The generated GOAL.md, VERIFY.md, and PROGRESS.md files are designed to be consumed by an AI agent running Codex `/goal` commands to implement the CLI tool autonomously.

### webg-spec-to-goal

**Convert a web game idea into a complete Codex /goal-ready Phaser 3 project.**

Turn a rough game idea (like "build a Raiden-type game" or "make a card game") into a runnable Phaser 3 scaffold plus every goal folder needed for autonomous implementation. Auto-detects genre (shoot-em-up, card game, platformer, tower defense, puzzle), decomposes into 5-7 goals following a universal build order, and bakes in state bridge verification (window.**GAME_STATE** + Playwright).

**Supports:** shoot-em-up, card-game, platformer, tower-defense, puzzle genres and their variants. Also supports extending existing games with new features.

> **Prerequisite:** This skill generates goal bundles for the [Codex /goal](https://docs.openai.com/codex) autonomous coding workflow. The generated scaffold and goal folders are designed to be consumed by an AI agent running sequential Codex `/goal` commands to build the game autonomously.

### wp-spec-to-goal

**Convert a WordPress plugin idea into a Codex /goal-ready bundle.**

Turn a rough WordPress plugin or feature idea into the three files Codex `/goal` needs: GOAL.md, VERIFY.md, and PROGRESS.md with wp-env + Playwright + wp-eval verification baked in. Optionally scaffolds a missing plugin folder, .wp-env.json, package.json, and AGENTS.md.

**Supports:** New plugins and features for existing plugins, wp-env development environment, Playwright browser testing, wp-eval PHP verification.

> **Prerequisite:** This skill generates goal bundles for the [Codex /goal](https://docs.openai.com/codex) autonomous coding workflow. The generated goal trio is designed to be consumed by an AI agent running Codex `/goal` commands to implement the WordPress plugin autonomously.
>
> **Also requires [playwright-cli](https://raw.githubusercontent.com/microsoft/playwright-cli/refs/heads/main/README.md):** the generated `VERIFY.md` performs browser-visible verification through playwright-cli. Install it once with `npm install -g @playwright/cli@latest` then `playwright-cli install --skills` (needs Node.js 18+).

### wp-requirements-to-goals

**Convert a full WordPress plugin requirements.md into a complete Codex /goal-ready project.**

The full-workflow counterpart to `wp-spec-to-goal`: where that skill handles a single vague spec, this one takes a complete `requirements.md` (multiple user stories, edge cases, settings catalog, cross-cutting features) and decomposes it into an entire multi-goal project — a `goals-plan.md`, a root scaffold (.wp-env.json, package.json, AGENTS.md, plugin bootstrap, run-goals.sh, protocols), and a layered `goals/` tree (foundation → per-user-story → non-US features → integration). Probes the repo to skip clarifications the filesystem already answers, asks the rest in ≤3 rounds, and supports phased or one-shot runs plus a resume and an extend mode.

**Supports:** Multi-goal full requirements, phased (checkpoint after plan) or one-shot mode, resume from an existing goals-plan.md, extend mode for completed projects, wp-env + Playwright + wp-eval verification.

> **Prerequisite:** This skill generates goal bundles for the [Codex /goal](https://docs.openai.com/codex) autonomous coding workflow. The generated project and goal folders are designed to be consumed by an AI agent running sequential Codex `/goal` commands to implement the WordPress plugin autonomously.
>
> **Also requires [playwright-cli](https://raw.githubusercontent.com/microsoft/playwright-cli/refs/heads/main/README.md):** every goal's `VERIFY.md` performs browser-visible verification through playwright-cli. Install it once with `npm install -g @playwright/cli@latest` then `playwright-cli install --skills` (needs Node.js 18+). Phase 2 also bundles a host-installed playwright-cli skill into the generated project's `.codex/skills/`.

### codex-imagegen

**Generate images with Codex's built-in `$imagegen` and keep them out of your cache.**

Generate images (featured images, illustrations, thumbnails, blog visuals) through Codex's `$imagegen` skill and land them straight into your project — defaulting to a `.codex-image/` folder if you don't name a destination. A single bundled script handles everything: it survives codex plugin version bumps (globs for the companion, newest wins), falls back to the `codex exec` CLI when the plugin is absent, and auto-removes each run's `~/.codex/generated_images/<thread-id>/` folder after the image is safely placed so storage stays flat. Includes `--report` and `--sweep` for clearing leftover folders from past sessions.

**Supports:** codex plugin runtime or Codex CLI fallback, custom or default destinations, multiple variants, leftover-cache reporting and sweeping.

> **Prerequisite:** Requires either the **codex plugin** in Claude Code (`/plugin marketplace add openai/codex-plugin-cc` then `/plugin install codex@openai-codex`; [full guide](https://github.com/openai/codex-plugin-cc#install)) **or** the **Codex CLI** (`npm i -g @openai/codex` then `codex login`). Auth is OpenAI/ChatGPT-account backed.

### handoff-doc

**Write a session handoff doc so the next session can pick up cold.**

Distills the current session into one tight handoff doc — what was done, where things live, what's verified, and what's still open — so a future session (Claude or human) can resume without re-reading the whole transcript. You give the destination path; the skill supplies the content. It matches the destination folder's existing filename convention, asks before overwriting an existing handoff (overwrite / append / sequel), flags filename-date typos, and stays honest about what was *not* verified.

**Trigger:** "write a handoff", "create a handoff doc", "update the handoff", "hand this off", or point at a path and say to capture where things stand.

### xquik

**Plan and implement Xquik REST API, MCP, webhook, and X data automation workflows.**

Use this skill when a user wants to build with Xquik's public REST API, MCP server, webhooks, or X automation tools. It keeps endpoint, request, response, and setup guidance tied to Xquik's public API reference, MCP docs, MCP manifest, and OpenAPI document.

**Trigger:** "use Xquik", "Xquik MCP", "Xquik API", "X data automation", "monitor an X account", "send Xquik webhooks", or related REST API and MCP integration requests.

### extract-design-md

**Extract a website's design system into a DESIGN.md file.**

Point it at a live URL and it compiles a [DESIGN.md](https://github.com/google-labs-code/design.md) — YAML design tokens (colors, typography, `rounded`/`spacing` scales, components) plus prose in canonical section order — good enough to hand a coding agent so it builds new UI matching the source site. Instead of eyeballing a screenshot, it samples 3–5 real pages with playwright-cli and reads each one's CSS custom properties + computed styles (precise and cheap), takes light screenshots for the prose only, detects light/dark themes, and validates every file with the official `@google/design.md` linter as a quality gate.

**Supports:** single- or dual-theme sites (emits `DESIGN.light.md` + `DESIGN.dark.md` when both exist), Tailwind and non-Tailwind token systems, auto page-selection with override, and graceful fallbacks (no design system, Firecrawl down, lint skipped).

**Trigger:** `/extract-design-md <url>`, "extract the design system from &lt;url&gt;", "make a DESIGN.md from &lt;site&gt;", "get the design tokens off &lt;site&gt;", "I want my UI to look like &lt;site&gt;".

> **Prerequisites:** [playwright-cli](https://github.com/microsoft/playwright-cli) on `PATH` (`npm install -g @playwright/cli@latest` then `playwright-cli install --skills`, needs Node.js 18+), a reachable [Firecrawl](https://github.com/mendableai/firecrawl) instance for page discovery (falls back to playwright link discovery if absent), and `npx` for the on-demand `@google/design.md` linter (skipped gracefully if unavailable).

### extract-design-system

**Extract a website's full design system — tokens *and* a component catalog — as a bundle for building native-looking pages.**

The superset of `extract-design-md`. Where that skill hands you a token-only `DESIGN.md`, this one captures the whole system a coding agent needs to generate pages that reuse the source's *actual* components: a `DESIGN.md`, a component catalog (per-component anatomy, variants, and hover/focus states), reference snippets, section patterns, DTCG design tokens, and an emitted eval harness. It samples real pages with playwright-cli, reads CSS custom properties + computed styles, and packages everything under `.design_systems/<domain>-YYYYMMDD/`. This fixes the "same skin, different skeletons" failure of token-only extraction — new pages come out with the same buttons, cards, and sections as the source, not just the same colors and fonts.

**You don't run `extract-design-md` first.** This skill is self-contained — it extracts the tokens and produces the `DESIGN.md` itself, then continues into the catalog. Just point it at a URL. (The optional `--components-only` flag can reuse a prior same-domain bundle's tokens + `DESIGN.md` to skip re-extraction, but that's an optimization, not a required step.)

**Supports:** full-bundle output (DESIGN.md + component catalog + reference snippets + section patterns + DTCG tokens + eval harness), single- or dual-theme sites, Tailwind and non-Tailwind token systems, auto page-selection with override, and graceful fallbacks.

**Trigger:** `/extract-design-system <url>`, "clone the design system", "extract components from &lt;url&gt;", "make new pages that look like &lt;site&gt;", "same buttons/cards/sections as &lt;site&gt;".

> **Prerequisites:** [playwright-cli](https://github.com/microsoft/playwright-cli) on `PATH` (`npm install -g @playwright/cli@latest` then `playwright-cli install --skills`, needs Node.js 18+), a reachable [Firecrawl](https://github.com/mendableai/firecrawl) instance for page discovery (falls back to playwright link discovery if absent), and `npx` for the on-demand `@google/design.md` linter (skipped gracefully if unavailable).

---

## Installation

These skills install two ways. Pick whichever matches your agent.

### Agent Skills CLI — Codex, Cursor, GitHub Copilot, Claude Code, and others

The open [Agent Skills CLI](https://www.skills.sh) (`npx skills`) installs into any
supported agent. It reads the canonical [`skills/`](skills/) directory at the repo root.

```bash
# List the available skills
npx skills add nathanonn/agent-skills --list

# Install one skill for your auto-detected agents
npx skills add nathanonn/agent-skills --skill ask-first

# Install one skill for a specific agent
npx skills add nathanonn/agent-skills --skill ask-first --agent codex
npx skills add nathanonn/agent-skills --skill ask-first --agent cursor
npx skills add nathanonn/agent-skills --skill ask-first --agent github-copilot
npx skills add nathanonn/agent-skills --skill ask-first --agent claude-code

# Install globally instead of into the current project
npx skills add nathanonn/agent-skills --skill ask-first --agent codex --global

# Install every skill into all supported detected agents
npx skills add nathanonn/agent-skills --all
```

### Claude Code plugin marketplace

For Claude Code, you can also install the packaged plugin versions:

```bash
# Add the marketplace
/plugin marketplace add nathanonn/agent-skills

# Install individual plugins
/plugin install ask-first@nathanonn-agent-skills
/plugin install cli-spec-to-goal@nathanonn-agent-skills
/plugin install webg-spec-to-goal@nathanonn-agent-skills
/plugin install wp-spec-to-goal@nathanonn-agent-skills
/plugin install wp-requirements-to-goals@nathanonn-agent-skills
/plugin install codex-imagegen@nathanonn-agent-skills
/plugin install handoff-doc@nathanonn-agent-skills
/plugin install xquik@nathanonn-agent-skills
/plugin install extract-design-md@nathanonn-agent-skills
/plugin install extract-design-system@nathanonn-agent-skills
```

### Manual installation

```bash
# Clone the repo
git clone https://github.com/nathanonn/agent-skills.git

# Claude Code: copy a plugin into your project's .claude directory
cp -r agent-skills/plugins/ask-first .claude/plugins/ask-first

# Other agents: copy a skill folder into your agent's skills directory
# (e.g. Codex: ~/.codex/skills/ — see your agent's docs for the path)
cp -r agent-skills/skills/ask-first <your-agent-skills-dir>/ask-first
```

---

## Usage

Once installed, invoke a skill by describing the task. In Claude Code, skills are
also available as slash commands:

```bash
# Ask-first: prefix any task with the skill
/ask-first Build a REST API for user authentication

# Spec-to-goal skills: describe what you want to build
/cli-spec-to-goal A CLI tool that converts CSV files to JSON with filtering
/webg-spec-to-goal Build a bullet hell shooter with power-ups
/wp-spec-to-goal A WordPress plugin that adds custom post type for recipes

# Requirements-to-goals: point it at a full requirements doc
/wp-requirements-to-goals Build the plugin described in requirements.md

# Codex-imagegen: describe the image you want
/codex-imagegen A minimalist line-art lighthouse, square 1024x1024, as hero.png

# Handoff-doc: give it a destination path to capture where things stand
/handoff-doc Write a handoff to notes/handoff/20260623_01_auth-refactor.md

# Xquik: plan an API, MCP, or webhook workflow
/xquik Build an X account monitoring workflow with webhooks

# Extract-design-md: point it at a site URL for a token-only DESIGN.md
/extract-design-md https://linear.app

# Extract-design-system: point it at a site URL for the full component bundle
/extract-design-system https://linear.app
```

---

## Repository layout

```txt
agent-skills/
  skills/                 # canonical Agent Skills (npx skills / Codex / Cursor / ...)
    <name>/SKILL.md       # generated mirror — do not hand-edit
  plugins/                # Claude Code plugin marketplace (single source of truth)
    <name>/skills/<name>/SKILL.md
  .claude-plugin/         # marketplace manifest
  skills.sh.json          # skills.sh page grouping (display only)
  sync-skills.sh          # regenerates skills/ from plugins/
```

`plugins/` is the **single source of truth**. The root `skills/` directory is a
generated mirror that exists so the Agent Skills CLI and non-Claude agents get a
clean `skills/<name>/SKILL.md` discovery path.

### Contributing — keep the mirror in sync

Edit skills under `plugins/<name>/skills/<name>/`, then regenerate the mirror:

```bash
./sync-skills.sh            # rebuild skills/ from plugins/
./sync-skills.sh --check    # verify skills/ matches plugins/ (CI-friendly)
```

Never hand-edit files under `skills/` — they are overwritten on every sync.

---

## License

[MIT](LICENSE)
