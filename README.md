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
