# pixel-diff

Compare two screenshots or images pixel by pixel: highlight changed pixels, count and locate differences, and check optional acceptance limits.

Version 1.0.0 · Works with: Any agent · [SKILL.md](skills/pixel-diff/SKILL.md)

## What it does

**Compare two screenshots or images pixel by pixel.**

Takes a reference image and a candidate image of the same size and produces a comparison sheet, masks and overlays of the changed pixels, and a JSON report with counts and regions. By default it makes an exact comparison with no pass/fail verdict. You can add a tolerance for rendering noise, ignored areas, and acceptance limits (a maximum number or percentage of changed pixels). It never invents exclusions or loosens tolerance to get a pass. The comparison runs locally.

## Say

- "compare these two screenshots"
- "pixel diff the prototype against the build"
- "what changed between these two images?"

Slash command: `/pixel-diff` (npx or manual install), `/pixel-diff:pixel-diff` (marketplace install).

## Example

```
Pixel diff the prototype screenshot against the build screenshot and tell me what changed.
```

The skill runs the bundled command, then reads the report and the comparison sheet:

```
python3 scripts/pixel_diff.py reference.png candidate.png --output ./pixel-diff-runs
```

With a marketplace install, use `/pixel-diff:pixel-diff` as the slash command.

## Requirements

- Python 3.11 to 3.13 with `venv` and `pip`. On first run the skill installs Pillow and NumPy into its own environment, which needs network access once; later runs work offline.
- Inputs must be equal-size PNG, JPEG or still WebP images; the skill does not resize or align them.
- Verified on Linux ARM64 with CPython 3.11 only. Other platforms are untested.

Shared tools: see [Requirements](../../README.md#requirements).

## Install

```
/plugin install pixel-diff@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill pixel-diff
```

More options: [docs/install.md](../../docs/install.md).
