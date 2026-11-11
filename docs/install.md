# Install

Use one route per agent. On Claude Code, the marketplace is the recommended route; `npx skills` also works there, but using both gives you every skill twice. Other agents use the Agent Skills CLI.

## Claude Code marketplace

Add the marketplace once, then install the plugins you want.

```bash
/plugin marketplace add nathanonn/agent-skills

/plugin install ask-first@nathanonn-agent-skills
/plugin install orchestrate@nathanonn-agent-skills
/plugin install handoff-doc@nathanonn-agent-skills
/plugin install cli-spec-to-goal@nathanonn-agent-skills
/plugin install webg-spec-to-goal@nathanonn-agent-skills
/plugin install wp-spec-to-goal@nathanonn-agent-skills
/plugin install wp-requirements-to-goals@nathanonn-agent-skills
/plugin install prototype-wp@nathanonn-agent-skills
/plugin install validate-block-markup@nathanonn-agent-skills
/plugin install wp-rest-api@nathanonn-agent-skills
/plugin install extract-design-md@nathanonn-agent-skills
/plugin install extract-design-system@nathanonn-agent-skills
/plugin install design-system-to-skill@nathanonn-agent-skills
/plugin install codex-imagegen@nathanonn-agent-skills
/plugin install wp-credential-guard@nathanonn-agent-skills
/plugin install context-alert@nathanonn-agent-skills
```

Marketplace skills are namespaced. Invoke them as `/<name>:<name>`, for example `/orchestrate:orchestrate`.

### Updating

In Claude Code, run `/plugin marketplace update nathanonn-agent-skills`. Then update or reinstall the plugin from the `/plugin` menu.

With npx, re-run the same `npx skills add … --skill <name>` command.

## Agent Skills CLI (npx skills)

The open [Agent Skills CLI](https://www.skills.sh) (`npx skills`) installs into any supported agent. It reads the canonical [`skills/`](../skills/) directory at the repo root.

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

## Manual copy

```bash
git clone https://github.com/nathanonn/agent-skills.git

# Claude Code: copy the skill folder into your project's skills directory
cp -r agent-skills/skills/ask-first .claude/skills/ask-first
# (or ~/.claude/skills/ask-first for every project)

# Other agents: copy the same folder into your agent's skills directory
# (e.g. Codex: ~/.codex/skills/; see your agent's docs for the path)
cp -r agent-skills/skills/ask-first <your-agent-skills-dir>/ask-first
```

Manual copy installs skills only. For the two hooks plugins, use the marketplace or `--plugin-dir` (see Hooks plugins below). A manually copied skill is invoked as `/ask-first`, with no namespace.

Claude Code reads project skills from `.claude/skills/<name>/SKILL.md` and user skills from `~/.claude/skills/`. Nothing loads a folder copied to `.claude/plugins/`.

## Hooks plugins

`wp-credential-guard` and `context-alert` ship hooks and work in Claude Code only. Two routes work:

- Marketplace install, which is the supported route. Choose user scope, then run `/reload-plugins`.
- Load the plugin directly for one session: `claude --plugin-dir agent-skills/plugins/<name>`.

Run `/hooks` afterwards to confirm the events are registered. For `context-alert`, run `/context-alert` instead, because function-hook mods may not show in `/hooks`.

Do not load `context-alert` twice. If you installed it from the marketplace, do not also start a session with `--plugin-dir` pointing at it.

See the [wp-credential-guard install section](../plugins/wp-credential-guard/README.md#install) for the detail.

## Requirements

See the [requirements table](../README.md#requirements) in the README.
