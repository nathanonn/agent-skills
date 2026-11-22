# CLI and artifacts

## Examples

Resolve the script inside the skill folder.

```bash
# Exact report, without a verdict
python3 scripts/pixel_diff.py reference.png candidate.png --output ./reports

# Require exact equality outside an explicitly selected clock rectangle
python3 scripts/pixel_diff.py reference.png candidate.png --output ./reports --max-changed-pixels 0 --exclude 100,20,80,30

# Preserve exact evidence; judge the requested tolerant result
python3 scripts/pixel_diff.py reference.png candidate.png --output ./reports --tolerant --color-threshold 2 --verdict-mode tolerant --max-changed-percent 0.1

# Opt in to the separate edge heuristic
python3 scripts/pixel_diff.py reference.png candidate.png --output ./reports --tolerant --filter-antialiasing
```

`--help` lists the full interface. Settings that require tolerant mode are rejected without `--tolerant`. Repeat `--exclude` for multiple rectangles.

| Exit | Meaning |
| --- | --- |
| 0 | Completed, verdict passed or not evaluated. |
| 1 | Completed, requested limit failed. All artifacts retained. |
| 2 | Invalid input/configuration, setup problem, or execution error. |
| 130 | Interrupted. Partial run remains incomplete. |

Setup messages go to stderr. A completed or failed worker run prints one JSON object with its absolute run directory and summary to stdout. Argument/setup failures can occur before a run exists. The shell process receiving an external termination may report its own signal exit status.

## Run contents

Each invocation uses a UTC timestamp plus a random suffix. Prior runs remain intact.

| Path | Content |
| --- | --- |
| `inputs/reference.*`, `inputs/candidate.*` | Original byte-preserving copies. |
| `report.json` | Versioned results, inputs, metadata, settings, paths, regions, and verdict. |
| `settings.json` | Effective settings. |
| `comparison.png` | Exact reference/candidate/mask/overlay overview. |
| `exact/diff.png` | Native RGB mask. Magenta means changed; black means unchanged. |
| `exact/overlay.png` | Native candidate view, highlights, boxes, exclusions. |
| `exact/tiles/*.png` | Native four-panel details when image exceeds 768x600. |
| `exact/regions-*.png` | Complete region index when there are over 40 regions. |
| `tolerant-comparison.png`, `tolerant/*` | Corresponding requested tolerant views. |
| `filtered-out.png` | Cyan pixels counted by exact but filtered by tolerant mode. |

Artifact paths in JSON are relative, using forward slashes. The folder can be moved. Absolute source paths are provenance only. Tiles cover the complete image, including unchanged areas; coordinates refer to the original image.

## JSON schema 1

- `status`: `complete`, `error`, or `incomplete`. An initial incomplete report exists before processing. Errors include `error.type` and `error.message`.
- `tool`: version, source hash, runtime, OS, pinned packages, and codec versions.
- `inputs.reference` / `inputs.candidate`: source and copy paths, SHA-256, byte count, dimensions, original mode, format, alpha presence, color/orientation metadata.
- `settings`: metric, effective thresholds, antialiasing classifier, rectangles, grouping, presentation, limits, and verdict configuration.
- `measurements.exact` and optional `.tolerant`: `full` and `included`, each with `changed_pixels`, `total_pixels`, `changed_percent`.
- `regions.<mode>`: ordered objects with `id`, `x`, `y`, `width`, `height`, `changed_pixels`, and `box_pixels`.
- `verdict`: state, mode, limits, denominator, and individual Boolean checks. The percent limit is a decimal string to preserve the entered boundary.
- `artifacts.<mode>`: overview, diff, overlay, tile coordinate objects, region-page paths. Optional `filtered_out` points to the tolerance filter mask.
- `exclusion_pixels`, optional `filtered_pixels`, `notes`, and `elapsed_seconds`.

Dimensions mismatch produces both input sizes and an error without measurements or a verdict. If generation fails after comparison, partial measurements may exist, but the report remains incomplete/error and has no final verdict.
