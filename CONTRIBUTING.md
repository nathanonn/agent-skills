# Contributing

## Layout

```txt
agent-skills/
  skills/                 # canonical Agent Skills (npx skills / Codex / Cursor / ...)
    <name>/SKILL.md       # generated mirror — do not hand-edit
  plugins/                # Claude Code plugin marketplace (single source of truth)
    <name>/skills/<name>/SKILL.md
    <name>/hooks/         # hooks plugins — Claude Code only, never mirrored
    <name>/README.md      # human-facing item page, not mirrored
  .claude-plugin/         # marketplace manifest
  skills.sh.json          # skills.sh page grouping (display only)
  sync-skills.sh          # regenerates skills/ from plugins/
```

## The mirror

`plugins/` is the **single source of truth**. The root `skills/` directory is a
generated mirror that exists so the Agent Skills CLI and non-Claude agents get a
clean `skills/<name>/SKILL.md` discovery path.

A plugin that ships `hooks/` rather than `skills/` is Claude-Code-only and has nothing to mirror,
so `sync-skills.sh` skips it by design — it globs `plugins/*/skills/*`. A hooks plugin missing
from `skills/` is correct, not a sync failure. The one exception is `context-alert`, which bundles
a copy of the `handoff-doc` skill; that copy mirrors to the same `skills/handoff-doc/` as the
standalone plugin, so the two copies must stay byte-identical. `sync-skills.sh` enforces this: when two plugins ship a same-named skill whose bytes differ, both `--check` and the regenerate run fail with an error instead of letting the last copy win.

## Editing a skill

Edit skills under `plugins/<name>/skills/<name>/`, then regenerate the mirror:

```bash
./sync-skills.sh            # rebuild skills/ from plugins/
./sync-skills.sh --check    # verify skills/ matches plugins/ and same-named skills are identical (CI-friendly)
```

Never hand-edit files under `skills/` — they are overwritten on every sync.

## Keeping the README in step

- A skill's description lives in three places: `.claude-plugin/marketplace.json`, its `plugin.json`, and its README catalogue row. Change all three together, word for word.
- Keep descriptions to 25 words or fewer.
- A new skill needs:
  - a `plugins/<name>/` plugin
  - a marketplace entry with a category from {workflow, codex-goal, wordpress, design, media, hooks}
  - a row in the README group that matches its category
  - a `plugins/<name>/README.md` item page, copied from [`plugins/ask-first/README.md`](plugins/ask-first/README.md)
  - an entry in `skills.sh.json`
- Bump the patch version (`plugin.json` and `marketplace.json`) when a description or SKILL.md text changes.
