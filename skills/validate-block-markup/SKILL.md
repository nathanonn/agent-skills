---
name: validate-block-markup
description: Validate, diagnose, or repair standalone serialized WordPress Gutenberg block markup built from core blocks, using a pinned Node.js runtime. Use when the user explicitly asks to validate, check, lint, or debug block markup or `<!-- wp:... -->` block comments, reports an invalid block, "unexpected or invalid content", or an "Attempt Block Recovery" prompt, or is about to paste markup into the WordPress Code Editor or assign it to post_content. Scope is standalone, cross-site-portable core block markup only; site-specific, theme-specific, dynamic, plugin, and third-party block content are out of scope. Do not trigger merely because another skill emits block markup - prototype-wp (offline WP plugin prototypes), wp-spec-to-goal and wp-requirements-to-goals (Codex goal bundles), and pressbridge (pushing code, CSS, or blocks to a live remote WP site) own their own workflows.
---

# Validate Block Markup

Check serialized block markup against the WordPress core block library running in Node.js. Treat structural validity and cross-site portability as separate verdicts, and treat review and repair as separate jobs.

Verdicts are produced against the core block definitions shipped with **WordPress 7.0.2**. Always tell the user which snapshot the verdict came from.

## Requirements

- Node.js 20.10 or newer, with `npm` on `PATH`.
- **First run installs a runtime into this skill's own directory**: `npm ci` of 350 packages, about 545 MB on disk, roughly 25 seconds, and it needs npm registry access. Later runs are offline and instant. `--help` and `--version` answer immediately and install nothing.
- The install never touches the user's project — no edits to their `package.json`, no lockfile changes, nothing written to a project-level `node_modules`. Everything lands in `<skill-directory>/node_modules/`.
- That distinction matters less than it sounds: the common `npx skills add` layout puts this skill *inside* the user's repository, so those 545 MB land in their repo tree. Say so before the first run. The skill ships a `.gitignore` covering `node_modules/` and rewrites it before installing if it went missing, so git stays clean without the user doing anything.
- Most of the installed bytes are `@wordpress/*` packages, licensed GPL-2.0-or-later. The skill's own code is MIT.
- No WordPress, PHP, wp-env, Docker, Playwright, or browser is required.
- Run validation only through `scripts/validate-block-markup.cjs`. Do not import the module into your own process.

## Dependency Bootstrap

The executable bootstraps itself. Before loading the validator it checks `<skill-directory>/node_modules/` for four pinned packages and, if any is absent or at a different version, runs this in the skill directory:

```bash
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
```

| Package | Pinned version |
| --- | --- |
| `@wordpress/blocks` | 15.13.1 |
| `@wordpress/block-library` | 9.40.2 |
| `@wordpress/block-serialization-default-parser` | 5.40.1 |
| `jsdom` | 26.1.0 |

The pins the executable enforces live in a hardcoded map inside `scripts/validate-block-markup.cjs`, duplicated from `package.json`. When bumping a version, change both — they are not read from each other.

Bootstrap progress goes to stderr. If npm, registry access, or a writable skill directory is unavailable, the command exits `2`; stop and report that validation could not run. Never run the install in the user's project.

## Command Surface

```bash
node <skill-directory>/scripts/validate-block-markup.cjs [options] [<file|directory|->...]
```

- Accepts any number of paths in one invocation.
- `-` reads stdin. Stdin is also the default when no path is given.
- A **directory** argument validates the `.html` files directly inside it, in sorted order. Scanning is **not recursive** and ignores every other extension, so pointing at a tree silently validates a subset. Pass files explicitly when the tree matters.
- `--` treats every following argument as a path.
- `-h` / `--help` prints usage. `-v` / `--version` prints the skill version and the pinned WordPress snapshot.
- On exit `0` and `1`, **stdout is nothing but a parseable JSON array** — one report per input source. Bootstrap noise and all diagnostics go to stderr. Parse stdout, ignore stderr.

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | Every input source passed. |
| `1` | Findings contain at least one error. |
| `2` | Usage or input error — unreadable path, unknown option, no input sources found (including a directory with no `.html` files), or no input given while stdin is a terminal. |

## Validation Workflow

Use this whenever the request is to validate, check, review, or diagnose. **Do not modify the user's markup in this mode.**

1. Put the markup in a temporary `.html` file, or pipe it on stdin.
2. Run the command.
3. Read the JSON report from stdout.
4. Report `valid`, every error, every warning, and every entry in `notChecked`. Never describe a `notChecked` item as verified.
5. Name the WordPress snapshot (`wordpressVersion`) the verdict applies to.
6. `canonicalMarkup` appears when parse-then-serialize changed the input. Offer it as a suggestion. Never silently substitute it for what the user supplied.
7. Stop there. Suggest fixes in prose; do not apply them unless asked.

## Repair Workflow

Use this only when the user asked for markup to be fixed, or when you generated the markup yourself.

1. Fix the errors at their source in the markup.
2. Rerun the validator after each round of edits.
3. Repeat until `valid` is `true`.
4. Warnings may remain if the user accepts them. State which ones you left and why.
5. Return the repaired markup, and say what changed.
6. Substitute the validator's canonical serialization only when the user explicitly asked for normalization.

## Interpret Findings

Errors — these make `valid` false:

- `no-blocks`: the input produced zero blocks. Check the file is not empty and actually contains block comments.
- `malformed-attribute-json`: the JSON in an opening delimiter does not parse. Fix the JSON. Carries `line`, not `path`.
- `freeform-html`: content fell through as freeform/classic HTML. Wrap it in a core block.
- `unregistered-block`: the block is not in the pinned core library. Replace it with a core block.
- `missing-block`: the markup already contains a `core/missing` placeholder, so the editor that produced it did not recognize the original block. Rebuild that section from core blocks; the original block cannot be recovered here.
- `invalid-saved-content`: the saved HTML does not match the registered core save implementation — this is what produces "Attempt Block Recovery" in the editor. Read the `issues` array for the exact mismatch, then fix the opening attributes and the saved HTML together.
- `nonportable-core-block`: a core block that depends on post, query, comment, taxonomy, template, authentication, or site-setting context. Replace it with static content.
- `site-entity-id`: an attachment, author, post, term, navigation, or reusable-block database ID. Remove the ID and any class derived from it.
- `root-relative-url`: an `href` or `src` starting with a single `/`. Use a genuinely portable URL, or disclose the destination-site dependency.
- `missing-fragment-target`: a `#anchor` link with no matching `id` in the same input. Add the anchor or drop the link.
- `non-idempotent-serialization`: a second parse-then-serialize pass changed the canonical markup, so the markup is unstable across editor round-trips and will keep drifting every time it is opened and saved. There is no patch for this — rebuild the affected blocks from scratch.

Warnings — these do not affect `valid`:

- `noncanonical-serialization`: WordPress canonicalized the input. Always emitted at warning level; it never escalates. Compare against `canonicalMarkup` and let the user decide.
- `theme-dependent-style`: preset or style attributes whose appearance depends on the destination theme. Keep only if the user accepts that.
- `custom-class`: a custom CSS class that may not exist on the destination site. Same call.

## What `valid: true` Does Not Mean

`valid: true` means the markup parses, matches the core save implementations, and carries no cross-site portability error. It is **not** a publication-safety verdict.

- Link checks only flag `href`/`src` values beginning with a single `/`, and `#` fragments with no matching `id`. `javascript:` and `data:` URLs, event-handler attributes such as `onclick`, and inline `<script>` all pass unflagged.
- KSES filtering, user capabilities, and destination-site sanitization are never evaluated. Markup that passes here can still be stripped — or still be dangerous — on a real site.
- Report the whole `notChecked` array with every verdict, not just when something fails.

See [references/validation-contract.md](references/validation-contract.md) for the full report schema, finding field shapes, portability policy, and limitations.
