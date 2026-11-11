# codex-imagegen

Generate images with the Codex CLI's built-in $imagegen skill, save them into the project, and remove each run's generated_images cache folder so storage stays flat.

Version 1.1.1 · Works with: Needs Codex · [SKILL.md](skills/codex-imagegen/SKILL.md)

## What it does

**Generate images with Codex's built-in `$imagegen` and keep them out of your cache.**

Generates images (featured images, illustrations, thumbnails, blog visuals) through the Codex CLI and saves them into your project. With no `--dest` and no `dest` in a project config, images go to `.codex-imagegen/output/` under the nearest folder that has a `.codex-imagegen/` directory, or under the current directory when there is none. Once an image is confirmed at the destination, the run's `$CODEX_HOME/generated_images/<session-id>/` folder (named after that run's Codex session id) is removed. No other folder is touched. Runs into different destinations are safe; two runs into the same destination at the same time are not, so don't do that. `--report` and `--sweep` handle folders left over from past sessions.

No model ID ships with the skill. Model and reasoning effort resolve per key, highest priority first: `--model`/`--effort` flags, the `CODEX_IMAGEGEN_MODEL`/`CODEX_IMAGEGEN_EFFORT` environment variables, the nearest `<project>/.codex-imagegen/config.toml`, shallower configs up the tree, the machine profile `$CODEX_HOME/imagegen.config.toml`, then the Codex default. A project that sets only `model` keeps the effort, size and style it inherits from shallower files.

Every generation run prints a resolution trace that names the model, effort and destination and where each came from. `--dry-run` checks the model and effort against the Codex model catalog, prints the trace, the exact `codex exec` arguments and the composed prompt, then stops without creating any files or folders.

Project config is parsed line by line and never sourced. It accepts only a closed list of keys (`[codex]`: `model`, `model_reasoning_effort`, `model_verbosity`, `service_tier`; `[imagegen]`: `size`, `style`, `dest`) and stops with exit code 4 on anything else. A destination that comes from a config file or a marker must resolve inside its own project, so a cloned repository cannot redirect writes through a symlink. A path you pass with `--dest` is not restricted.

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

## Setup: a cheaper model for image generation

The text model only writes the prompt and calls Codex's built-in image tool. A small, cheap model is a good fit for that. Without a machine profile, runs use the Codex default model, which is usually the larger workhorse model.

The setting stays with image generation. The skill applies the profile with `codex exec -p imagegen`, so your other Codex work (`codex review`, `codex exec`) keeps its usual model.

### 1. Pick a model and an effort

Model names change, so check the current catalog:

```bash
codex debug models
```

Pick a small or fast model from the list, and an effort that this model lists under `supported_reasoning_levels`. In November 2026, for example, `gpt-6-luna` was in the catalog as "Fast and affordable model for easier tasks" and listed efforts up to `max`.

### 2. Create the machine profile

Create `~/.codex/imagegen.config.toml` (or `$CODEX_HOME/imagegen.config.toml` if you set `CODEX_HOME`). With the example model from step 1:

```toml
model = "gpt-6-luna"
model_reasoning_effort = "max"
```

The file is a regular Codex profile that Codex itself layers in via `-p imagegen`, so other Codex keys in it (for example `service_tier`, or `model_verbosity` = low|medium|high) take effect too.

Use double-quoted strings and keep the keys at the top of the file. The profile also accepts single quotes, but project config files accept only double quotes, so double quotes work everywhere. The script stops reading the profile at the first `[table]` header and skips unquoted values.

### 3. Check it with a dry run

Ask your agent for a dry run, or run the script yourself:

```bash
bash <skill-dir>/scripts/codex-imagegen.sh --dry-run "test image"
```

The trace should show the profile as the source:

```
MODEL=gpt-6-luna
MODEL_SOURCE=profile:/home/you/.codex/imagegen.config.toml
EFFORT=max
EFFORT_SOURCE=profile:/home/you/.codex/imagegen.config.toml
```

A misspelled file name, a misspelled key, an unquoted value or a key placed under a table header does not fail. The run falls back to the Codex default and the trace shows `MODEL_SOURCE=codex-default` or `EFFORT_SOURCE=codex-default`, so the trace is how you notice. A model the catalog does not know, or an effort that model does not support, stops the run with exit code 5 and lists the valid options. If `codex debug models` fails, times out after 20 seconds, or returns output the script cannot parse, validation is skipped with a warning.

### Overrides

The profile is the lowest layer above the Codex default. To use something else:

- **One project:** add `<project>/.codex-imagegen/config.toml` with a `[codex]` table. Values must be double-quoted.

  ```toml
  [codex]
  model = "your-model-slug"
  model_reasoning_effort = "high"
  ```

  The same file can set `[imagegen]` `size`, `style` and `dest`.
- **One shell:** `export CODEX_IMAGEGEN_MODEL=...` and `export CODEX_IMAGEGEN_EFFORT=...`.
- **One run:** pass `--model` and `--effort`, or ask your agent to use a given model for this image.

## Requirements

Requires the **Codex CLI**:

```bash
npm i -g @openai/codex
codex login
```

Auth is OpenAI/ChatGPT-account backed. The Claude Code codex plugin is not a runtime for this skill: it cannot apply a Codex profile or the `max` effort, and it calls the same CLI anyway. If the CLI is missing, the script exits with code 3 and prints the install steps. Model validation uses `python3` when it is available and is skipped with a warning when it is not.

In Claude Code, the skill runs the script outside the Bash sandbox because generation needs network access. A run usually takes 2 to 5 minutes.

Shared tools: see [Requirements](../../README.md#requirements).

## Supports

six-layer model and effort resolution, per-project image size and style, custom, config-set or marker-derived destinations, multiple variants, resolution traces, dry runs, leftover-cache reporting and sweeping.

Exit codes: `0` success or dry run, `1` no image reached the destination or `codex exec` itself failed, `2` invalid usage, `3` Codex CLI missing, `4` project config or destination refused, `5` unknown model or unsupported effort.

## Install

```
/plugin install codex-imagegen@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill codex-imagegen
```

More options: [docs/install.md](../../docs/install.md).
