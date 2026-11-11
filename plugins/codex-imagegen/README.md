# codex-imagegen

Generate images via Codex's built-in $imagegen skill, land them in the project, and auto-clean the generated_images cache so storage stays flat.

Version 1.0.0 · Works with: Needs Codex · [SKILL.md](skills/codex-imagegen/SKILL.md)

## What it does

**Generate images with Codex's built-in `$imagegen` and keep them out of your cache.**

Generate images (featured images, illustrations, thumbnails, blog visuals) through Codex's `$imagegen` skill and land them straight into your project — defaulting to a `.codex-image/` folder if you don't name a destination. A single bundled script handles everything: it survives codex plugin version bumps (globs for the companion, newest wins), falls back to the `codex exec` CLI when the plugin is absent, and auto-removes each run's `~/.codex/generated_images/<thread-id>/` folder after the image is safely placed so storage stays flat. Includes `--report` and `--sweep` for clearing leftover folders from past sessions.

## Say

- "generate an image of..."
- "create a featured image for this post"
- "make me an illustration"
- "$imagegen"
- "use codex to generate an image"
- "image for this blog post"

Slash command: `/codex-imagegen` (npx or manual install), `/codex-imagegen:codex-imagegen` (marketplace install).

## Example

```
/codex-imagegen A minimalist line-art lighthouse, square 1024x1024, as hero.png
```

With a marketplace install, use `/codex-imagegen:codex-imagegen` instead.

## Requirements

Requires either the **codex plugin** in Claude Code (`/plugin marketplace add openai/codex-plugin-cc` then `/plugin install codex@openai-codex`; [full guide](https://github.com/openai/codex-plugin-cc#install)) **or** the **Codex CLI** (`npm i -g @openai/codex` then `codex login`). Auth is OpenAI/ChatGPT-account backed.

Shared tools: see [Requirements](../../README.md#requirements).

## Supports

codex plugin runtime or Codex CLI fallback, custom or default destinations, multiple variants, leftover-cache reporting and sweeping.

## Install

```
/plugin install codex-imagegen@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill codex-imagegen
```

More options: [docs/install.md](../../docs/install.md).
