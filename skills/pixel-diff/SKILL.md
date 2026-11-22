---
name: pixel-diff
description: Compare two existing screenshots or raster images, highlight changed pixels, and report difference counts, regions, and optional acceptance limits. Use for screenshot verification or reference-versus-result image checks.
---

# Pixel diff

Use the bundled command to compare a reference image with a candidate. It produces a PNG comparison sheet, native-resolution masks and overlays, readable detail tiles, and JSON in a new run folder. The comparison and rendering run locally.

## Run a comparison

Identify the input paths and which is the reference. A prototype is normally the reference when checking an implementation. Use the caller's output directory, or a `pixel-diff-runs` directory inside the current task's artifact folder.

Resolve `scripts/pixel_diff.py` relative to this skill's location. With Python 3.11-3.13 available:

```bash
python3 /path/to/pixel-diff/scripts/pixel_diff.py reference.png candidate.png --output ./pixel-diff-runs
```

On Windows, use `py -3.11` instead of `python3`. The launcher installs pinned packages into its own environment on first use, subject to the environment's permissions. Later runs reuse them offline. For setup failures, read [runtime and setup](references/runtime.md).

The inputs must be equal-size PNG, JPEG, or still WebP, with 8-bit sRGB pixels and orientation already applied. Untagged images are assumed sRGB and reported as such. On dimension, color, orientation, or format errors, report the reason and the needed caller preparation. The command preserves original coordinates and does not resize or align inputs.

## Choose comparison settings

The default result is exact RGBA comparison with no pass/fail verdict. Every changed coordinate counts once, including hidden RGB in transparent pixels.

- For requested rendering-noise tolerance, add `--tolerant`. Keep and report the exact result alongside it. Read [comparison rules](references/comparison.md) when choosing a color threshold or the separate `--filter-antialiasing` option.
- For an explicit acceptance budget, use `--max-changed-pixels N`, `--max-changed-percent P`, or both. Percent units are 0 through 100. Both supplied limits must pass. A tolerant verdict additionally requires `--verdict-mode tolerant`.
- For caller-specified ignored areas, repeat `--exclude X,Y,W,H`. Exclusions affect verdict measurements only. Full-image masks and counts retain those changes.

Use the caller's settings. Never invent exclusions or adjust tolerance to get a pass. See [CLI and artifacts](references/cli-and-artifacts.md) for examples, JSON fields, coordinates, and exit codes.

## Inspect and explain

Read `report.json` in the run path printed by the command. Exit 1 is a completed comparison that exceeded its limits; its report remains usable. Exit 2 is an error. Use only reports whose status is `complete` for final measurements.

Open `comparison.png`. For small text, long pages, or crowded regions, inspect the relevant native-resolution tiles listed in JSON. If tolerance ran, also inspect `tolerant-comparison.png` and `filtered-out.png` where the modes disagree. A scaled mask preserves small changes, but can exaggerate their apparent area; take counts from JSON.

Return the report path, exact changed count/percentage, tolerant result if requested, and the explicit verdict or "not evaluated." Briefly describe observed changes and cite useful region IDs or tiles. Mention material input assumptions and exclusions. Keep observations separate from computed acceptance. A pixel pass does not establish usability or semantic correctness.

If image inspection is unavailable, provide the artifacts and measurements and state that the visual interpretation was not performed.
