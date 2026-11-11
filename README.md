# Agent Skills

14 skills and 2 Claude Code plugins for autonomous development workflows: planning, orchestration, Codex `/goal` bundles, WordPress, design systems and handoffs. The skills install into Claude Code, Codex, Cursor, GitHub Copilot and other agents; the plugins need Claude Code.

By [Nathan Onn](https://www.nathanonn.com)

[Skills](#skills) · [Install](#install) · [Requirements](#requirements)

## Skills

Pick a skill, then [install](#install) it. Each name links to its page with examples, requirements and limits.

| Label | Means |
|---|---|
| Any agent | Plain skill; installs and runs anywhere |
| Any agent, for Codex `/goal` | Runs anywhere; its output is a bundle for Codex `/goal` |
| Needs Codex | Calls the Codex CLI |
| Claude Code | Installs anywhere, but built for Claude Code |
| Claude Code plugin | Hooks; marketplace install only |

### Workflow
| Skill | What it does | Say | Works with |
|---|---|---|---|
| [ask-first](plugins/ask-first/README.md) | Ask clarifying questions before executing tasks. Reaches 95% confidence through structured Q&A, then executes. | "ask me questions first", or start a task with "ask:" | Any agent |
| [orchestrate](plugins/orchestrate/README.md) | Run the main Claude Code session as an orchestrator: a task list, sub-agents routed by model and effort, and verified checkpoint commits. | "orchestrate this", "use sub-agents" | Claude Code |
| [handoff-doc](plugins/handoff-doc/README.md) | Write or update a session handoff doc so a future session (Claude or human) can resume work without re-reading the whole transcript. | "write a handoff to &lt;path&gt;" | Any agent |

### Codex /goal
| Skill | What it does | Say | Works with |
|---|---|---|---|
| [cli-spec-to-goal](plugins/cli-spec-to-goal/README.md) | Convert a Node.js CLI tool specification into a Codex /goal-ready bundle with AI-agent-friendly patterns baked in. | "turn this CLI idea into a /goal bundle" | Any agent, for Codex `/goal` |
| [webg-spec-to-goal](plugins/webg-spec-to-goal/README.md) | Convert a web game idea into a complete Codex /goal-ready Phaser 3 project with scaffold, goals-plan, and all goal folders. | `/webg-spec-to-goal <idea>` (slash command only) | Any agent, for Codex `/goal` |

### WordPress
| Skill | What it does | Say | Works with |
|---|---|---|---|
| [wp-spec-to-goal](plugins/wp-spec-to-goal/README.md) | Convert a WordPress plugin or feature idea into a Codex /goal-ready bundle with wp-env + Playwright verification. | `/wp-spec-to-goal <idea>` (slash command only) | Any agent, for Codex `/goal` |
| [wp-requirements-to-goals](plugins/wp-requirements-to-goals/README.md) | Convert a full WordPress plugin requirements.md into a complete Codex /goal-ready project: goals-plan.md, root scaffold, and a layered goals/ tree (foundation, per-US, non-US, integration). | `/wp-requirements-to-goals requirements.md` (slash command only) | Any agent, for Codex `/goal` |
| [prototype-wp](plugins/prototype-wp/README.md) | Prototype a WordPress or WooCommerce plugin spec as a runnable offline browser simulation, to judge it as a product before writing any PHP. | "prototype this WordPress plugin", "do these plugin requirements hold together?" | Any agent |
| [validate-block-markup](plugins/validate-block-markup/README.md) | Validate, diagnose or repair serialized WordPress block markup against the core block library in Node.js, with separate verdicts for validity and portability. | "validate this block markup", "why does this block say invalid content" | Any agent |
| [wp-rest-api](plugins/wp-rest-api/README.md) | Push block markup, CSS and JS into a WordPress site over the core REST API with an admin Application Password. Uses curl and jq only. | "push this block markup to WordPress", "make this my front page" | Any agent |

### Design
| Skill | What it does | Say | Works with |
|---|---|---|---|
| [extract-design-md](plugins/extract-design-md/README.md) | Extract a website's design system into a DESIGN.md file (google-labs-code format): colors, typography, spacing, components and brand feel, checked by the official linter. | "make a DESIGN.md from &lt;site&gt;" | Any agent |
| [extract-design-system](plugins/extract-design-system/README.md) | Extract a website's tokens and component catalog (variants, states, section patterns) into a bundle a coding agent uses to build pages native to that brand. | "clone the design system of &lt;site&gt;", "make new pages that look like &lt;site&gt;" | Any agent |
| [design-system-to-skill](plugins/design-system-to-skill/README.md) | Convert an extract-design-system output bundle into a self-contained, auto-triggering per-brand Claude Code skill that later agents use to build pages native to that brand. | "turn this design system into a skill" | Claude Code |

### Media
| Skill | What it does | Say | Works with |
|---|---|---|---|
| [codex-imagegen](plugins/codex-imagegen/README.md) | Generate images with the Codex CLI's built-in $imagegen skill, save them into the project, and remove each run's generated_images cache folder so storage stays flat. | "create a featured image for this post" | Needs Codex |

### Claude Code plugins (hooks)
These run code on Claude Code's events, so they install through the marketplace only.

| Plugin | What it does | Say | Works with |
|---|---|---|---|
| [wp-credential-guard](plugins/wp-credential-guard/README.md) | Masks WordPress usernames and Application Passwords in prompts with session-scoped placeholders, and restores them into Bash commands at execution time. | (automatic) | Claude Code plugin |
| [context-alert](plugins/context-alert/README.md) | Opens a question dialog when the context window passes a threshold (40% by default) and offers a handoff doc, without blocking background agents. | (automatic); `/context-alert` for settings | Claude Code plugin |

## Install

Use one route per agent. On Claude Code, using both gives you every skill twice.

**Claude Code**
```bash
/plugin marketplace add nathanonn/agent-skills
/plugin install ask-first@nathanonn-agent-skills
```

**Codex, Cursor, GitHub Copilot and other agents**
```bash
npx skills add nathanonn/agent-skills --list
npx skills add nathanonn/agent-skills --skill ask-first
```

The two hooks plugins install through the Claude Code marketplace (or load for one session with `--plugin-dir`, see [docs/install.md](docs/install.md#hooks-plugins)).

Try it: start a task with `ask:`, for example "ask: add dark mode to the settings page".

Per-agent flags, global installs, manual copy, hooks setup and updating: [docs/install.md](docs/install.md).

## Requirements

| Tool | Needed by | Install |
|---|---|---|
| Codex `/goal` | running the output of cli-spec-to-goal, webg-spec-to-goal, wp-spec-to-goal, wp-requirements-to-goals | [Codex](https://docs.openai.com/codex) |
| [playwright-cli](https://github.com/microsoft/playwright-cli) | wp-spec-to-goal, wp-requirements-to-goals, extract-design-md, extract-design-system | `npm install -g @playwright/cli@latest`, then `playwright-cli install --skills` (Node 18+) |
| Codex CLI | codex-imagegen | `npm i -g @openai/codex`, then `codex login` (see [its page](plugins/codex-imagegen/README.md)) |
| Node.js 20.10+ | validate-block-markup (first run downloads ~545 MB into the skill folder) | |
| Node.js 18+ | design-system-to-skill | |
| `curl`, `jq` 1.6+, an admin Application Password | wp-rest-api | |
| Claude Code with hooks support | wp-credential-guard, context-alert | |

Optional tools (Firecrawl for extract-design-\*, a static server and browser driver for prototype-wp) are listed on the item pages.

## Credits and licence

- MIT, see [LICENSE](LICENSE).
- prototype-wp is derived from [Matt Pocock's `prototype` skill](https://github.com/mattpocock/skills) (MIT).
- orchestrate's reviewer/verifier split and finding grading are adapted from Ray Amjad's [task-lifecycle skill](https://github.com/ray-amjad/skills/tree/main/skills/task-lifecycle) (MIT).
- validate-block-markup installs GPL-2.0-or-later `@wordpress/*` packages at run time; none are distributed here.
- Details: [NOTICE](NOTICE).

## Contributing

Maintainers: see [CONTRIBUTING.md](CONTRIBUTING.md) for the mirror rules and `sync-skills.sh`.
