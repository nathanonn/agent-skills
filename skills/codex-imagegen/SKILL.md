---
name: codex-imagegen
description: "Generate images such as featured images, illustrations, diagrams, thumbnails, and blog visuals with the Codex CLI built-in $imagegen skill, save them into the current project, and safely clean this run's generated-images cache. Use when the user asks to generate, create, or make an image, picture, illustration, featured image, thumbnail, visual asset, image variants, AI artwork, or explicitly asks to use Codex image generation. Do not use for screenshots, charts rendered from data, ASCII diagrams, or editing existing images."
---

# Codex Imagegen

Generate images with Codex's built-in `$imagegen` skill, land them in the
project, and keep `$CODEX_HOME/generated_images/` from silently growing. The
bundled script uses the Codex CLI directly and applies machine, workspace,
project, environment, and per-run configuration without shipping a fixed model.

## Prerequisites

The **Codex CLI is required**. The Claude Code codex plugin alone is not a
runtime for this skill.

```bash
npm i -g @openai/codex
codex login
```

Authentication is OpenAI/ChatGPT-account backed. If the CLI is absent, the
script exits with code 3 and prints these steps.

## Project folder and destination

The project marker and configuration folder is:

```text
<project>/.codex-imagegen/
├── config.toml
├── output/
└── refs/
```

`config.toml` is optional, `output/` is the default image destination, and
`refs/` is reserved for future style references. A bare `.codex-imagegen/`
directory is still a project marker.

Destination precedence is:

1. `--dest DIR`.
2. Merged `[imagegen] dest`, resolved relative to the project folder that
   holds the `.codex-imagegen/` directory.
3. `.codex-imagegen/output/` below the deepest marker found by walking upward.
4. `$PWD/.codex-imagegen/output/`.

The walk is anchored on the normalized `--dest` directory when supplied and on
`$PWD` otherwise. It visits ancestors up to `$HOME`, or up to the filesystem
root when the anchor lives outside `$HOME`. The script creates the destination
only for a real run; `--dry-run` creates nothing. Never overwrite an existing
project asset unless the user explicitly approved replacement.

A destination that comes from a config file or a marker must stay inside its
project folder. The script canonicalizes the path and refuses a destination
that resolves outside, so a symlink committed to a repository cannot redirect
writes or widen what `--add-dir` authorizes. A path you pass explicitly with
`--dest` is treated as deliberate and is not restricted.

## Layered configuration

Model and reasoning effort resolve independently, highest priority first:

1. `--model` and `--effort` for this run.
2. `CODEX_IMAGEGEN_MODEL` and `CODEX_IMAGEGEN_EFFORT`.
3. The nearest `.codex-imagegen/config.toml`.
4. Shallower `.codex-imagegen/config.toml` files up to `$HOME`.
5. `$CODEX_HOME/imagegen.config.toml`, applied with `-p imagegen`.
6. The normal Codex default, with no override passed.

Project files merge shallowest first and deepest last, per key. A deeper file
that sets only `model` therefore retains a shallower effort, size, or style.
Example project configuration:

```toml
[codex]
model = "your-current-model-slug"
model_reasoning_effort = "high"
model_verbosity = "low"
service_tier = "priority"

[imagegen]
size = "1200x630"
style = "flat editorial illustration, warm palette, no text"
dest = "assets/generated"
```

When the user names a model or effort for one run, pass `--model` or `--effort`.
Do not put a real model ID in this file or in any project configuration shipped
with the skill; model catalogs change. Put a standing machine default in the
machine profile and let users choose project values themselves.

Repository config is parsed line by line and never sourced or evaluated. It
accepts only the documented `[codex]` model-shaping keys and `[imagegen]` keys;
unknown sections, unknown keys, malformed TOML, and invalid values fail closed.
Project values must use double-quoted strings. The machine profile is your own
file, so it is parsed leniently and accepts either TOML quote style.

## Workflow

### 1. Compose the prompt

Write plain prompt text without the `$imagegen` token; the script prepends the
literal token safely. Include the subject, mood, colors, exact filename, and
number of variants. If project config supplies `size` or `style`, do not restate
that size or style in the prompt because the script appends it automatically.

### 2. Run the script

```bash
bash <skill-dir>/scripts/codex-imagegen.sh "<prompt text>"
```

Pass `--dest DIR` only when the user names a folder. Otherwise omit it and let
the script resolve the destination (config `dest`, then the marker's
`.codex-imagegen/output/`, then the current directory's). Passing `--dest`
unasked overrides a project's `dest` and skips the containment check.

Flags may appear in any order before the prompt:

```text
codex-imagegen.sh [--dest DIR] [--model M] [--effort E] [--dry-run] "prompt text"
codex-imagegen.sh --sweep
codex-imagegen.sh --report
```

The script needs network access during a real generation. **In Claude Code**,
run it with `dangerouslyDisableSandbox: true` so the Bash sandbox does not block
the call. In other agents or shells, run the command normally. Use a 600000 ms
(10 minute) timeout; generation commonly takes 2–5 minutes.

`--dry-run` still validates the resolved model and effort against the local
Codex model catalog, then prints the exact argument vector and composed prompt.
It does not create directories or files and does not invoke `codex exec`.

### 3. Read the output

Every generation invocation begins with a resolution trace:

- `RUNTIME=codex-cli`
- `CONFIG_FILES=` in shallowest-to-deepest merge order, or `none`
- `MODEL=`, `MODEL_SOURCE=`, `EFFORT=`, and `EFFORT_SOURCE=`
- `DEST=` and `DEST_SOURCE=`
- `SIZE=` and `SIZE_SOURCE=` when set, `STYLE=set` and `STYLE_SOURCE=` when set

Sources identify `flag`, `env`, `config:<absolute-path>`,
`profile:<absolute-path>`, or `codex-default`. Destination sources identify
`flag`, `config:<absolute-path>`, `marker`, or `cwd-default`.

After a real run, the script retains the established output keys:

- `GENERATED_FILES:` followed by new destination files. If Codex leaves images
  in its cache folder, the script moves them only when nothing new reached the destination. That folder is the one
  named after this run's Codex session id: `$CODEX_HOME/generated_images/<session-id>/`.
- `SESSION_ID=` is that id, or `unknown` when the script could not read it.
- `CLEANUP=` reports whether this run's own session folder was removed. Cleanup
  only occurs after a destination file is confirmed, and never touches any other
  folder under `generated_images/`. When the id cannot be read, nothing there is
  touched. Caution: runs into different destinations are safe, but two runs into
  the same destination at the same time are not, so do not do that.
- `LEFTOVER_THREAD_FOLDERS=` and `LEFTOVER_TOTAL_SIZE=` report older folders.

Show the result to the user. In Claude Code, view the generated file with the
Read tool; other agents can open the paths listed under `GENERATED_FILES:`.

### 4. Offer a sweep when leftovers accumulate

If the leftover count or size is high, report it and offer to clear it. Only
after the user confirms:

```bash
bash <skill-dir>/scripts/codex-imagegen.sh --sweep
```

`--sweep` touches only `$CODEX_HOME/generated_images/`; it never touches a
project's `.codex-imagegen/` folder. Never sweep unprompted because old folders
may contain originals from other sessions.

## Exit codes and failure modes

- `0` means success or a completed dry run.
- `1` means Codex ran but no image reached the destination.
- `2` means invalid CLI usage.
- `3` means the Codex CLI is missing; install it and run `codex login`.
- `4` means project configuration failed closed during parsing or validation.
- `5` means the model is unknown or its reasoning effort is unsupported.

For an authentication error such as a revoked refresh token, ask the user to
run `! codex logout && codex login` interactively. If no image and no cache folder
for the run's session appear, inspect the Codex error; the turn may have failed before image
generation or the prompt may have been refused. Rephrase and retry once when
appropriate.
