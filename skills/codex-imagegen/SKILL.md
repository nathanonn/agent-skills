---
name: codex-imagegen
description: Generate images (featured images, illustrations, diagrams, test images, blog visuals) using Codex CLI's built-in $imagegen skill, triggered through the codex plugin or codex CLI. Use this skill whenever the user asks to generate, create, or make an image, picture, illustration, featured image, thumbnail, or visual asset — including "generate an image of...", "create a featured image for this post", "make me an illustration", "$imagegen", "use codex to generate an image", or "image for this blog post". Also use when the user wants image variants or wants AI-generated artwork saved into the project. Do NOT use for screenshots, charts rendered from data, ASCII diagrams, or editing existing images.
---

# Codex Imagegen

Generate images with Codex's built-in `$imagegen` skill and land them in the
project, keeping `~/.codex/generated_images/` from silently growing (it
accumulates ~10MB per generation and is never cleaned by Codex itself).

Everything is driven by one bundled script that survives plugin version bumps
and works on machines without the codex plugin (it falls back to `codex exec`).

## Prerequisites

Either of these (the script auto-detects which is present):

- **Codex plugin in Claude Code** — `/plugin marketplace add openai/codex-plugin-cc`, then `/plugin install codex@openai-codex` (Full guide: <https://github.com/openai/codex-plugin-cc#install>).
- **Codex CLI** (any agent) — `npm i -g @openai/codex`, then `codex login`.

Auth is OpenAI/ChatGPT-account backed. Without one of these the script exits with
code 3 and prints these install steps.

## Workflow

### 1. Determine the destination

- If the user named a destination folder, use it.
- Otherwise default to `.codex-image/` at the project root (the script creates it).
- If a file the user wants to create already exists at the destination (same
  intended name), ask the user before overwriting — never silently replace.

### 2. Compose the image prompt

Write plain prompt text — do NOT include the `$imagegen` token; the script
prepends it safely (a `$imagegen` typed into a double-quoted shell string gets
expanded to an empty string and the skill silently never triggers — the script
exists partly to make that mistake impossible).

Include in the prompt text:

- A clear description of the image (subject, style, mood, colors).
- Desired dimensions or aspect ratio. The raw model output is ~1254px square;
  Codex resizes/crops to what you ask, so always state it (e.g. "1200x630
  landscape" for a featured image).
- The exact output filename(s), e.g. "save it as featured-image.png".
- Number of variants if the user wants more than one.

The script appends the destination directory instruction automatically.

### 3. Run the script

```bash
bash <skill-dir>/scripts/codex-imagegen.sh --dest "<destination-dir>" "<prompt text>"
```

- The script needs network access (Codex calls OpenAI). **In Claude Code**, run
  it with `dangerouslyDisableSandbox: true` so the Bash sandbox doesn't block the
  call. In other agents/shells, run the bash command normally.
- Set a generous timeout (600000 ms / 10 min). A generation takes 2–5 minutes.
- Leave model/effort alone; Codex defaults handle imagegen fine.

The script resolves the runtime itself: it globs for the codex plugin's
`codex-companion.mjs` across all marketplaces and versions (newest wins), and
falls back to `codex exec --sandbox workspace-write` when the plugin is absent.
If neither exists it exits with install instructions — relay them to the user.

### 4. Read the output

The script prints:

- `RUNTIME=` — which path it used (plugin companion or codex CLI).
- `GENERATED_FILES:` followed by the new file path(s) at the destination. If
  Codex generated but forgot to copy to the destination, the script moves the
  files there itself.
- `CLEANUP=` — whether this run's `~/.codex/generated_images/<thread-id>/`
  folder was removed. It is only deleted after a file is confirmed at the
  destination; otherwise the originals are kept so nothing is ever lost.
- `LEFTOVER_THREAD_FOLDERS=` / `LEFTOVER_TOTAL_SIZE=` — pre-existing thread
  folders from past sessions (TUI runs, etc.) that the script never touches.

Show the user what was made — **in Claude Code**, view the file(s) with the Read
tool; other agents can open the path(s) printed under `GENERATED_FILES:`.

### 5. Offer a sweep when leftovers are piling up

If `LEFTOVER_THREAD_FOLDERS` is more than a handful (or the size is large),
tell the user the count and size the script reported (e.g. "there are N old
generation folders using X MB") and offer to clear them. Only after they confirm:

```bash
bash <skill-dir>/scripts/codex-imagegen.sh --sweep
```

Never sweep unprompted: old folders may hold originals from TUI sessions the
user hasn't copied out yet.

## Failure modes

- **Auth error** ("refresh token was revoked" / "log out and sign in again"):
  Codex needs an interactive re-login. Ask the user to run `! codex logout && codex login`.
- **No image at destination and no new thread folder**: the turn likely failed
  before generation — re-read the script output for the Codex error and report
  it. The prompt may also have been refused (content policy); rephrase and retry once.
- **Exit code 3**: no runtime found on this machine. Relay the script's install
  steps — either the codex plugin (`/plugin marketplace add openai/codex-plugin-cc`
  then `/plugin install codex@openai-codex`; Full guide:
  <https://github.com/openai/codex-plugin-cc#install>) or the Codex CLI
  (`npm i -g @openai/codex` then `codex login`).
