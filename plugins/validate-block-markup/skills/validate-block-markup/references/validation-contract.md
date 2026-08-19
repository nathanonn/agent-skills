# Validation contract

## Snapshot

The pinned runtime is tested against the core block definitions shipped with WordPress 7.0.2:

- `@wordpress/blocks` 15.13.1
- `@wordpress/block-library` 9.40.2
- `@wordpress/block-serialization-default-parser` 5.40.1
- `jsdom` 26.1.0

This is a versioned approximation of the editor's client-side block validation. A future WordPress release can change block schemas or saved markup, so a verdict is only ever "valid against 7.0.2". Report `wordpressVersion` with every result.

## Invocation

The only supported entry point is the CLI:

```bash
node <skill-directory>/scripts/validate-block-markup.cjs [options] [<file|directory|->...]
```

There is no supported in-process API. The validator installs jsdom globals into whatever process loads it, so it must run as a subprocess.

Input sources, in one invocation:

- one or more file paths;
- one or more directory paths — every `*.html` file **directly inside** the directory, sorted by name. Not recursive; other extensions are ignored;
- `-` for stdin, which is also the default when no path is given;
- `--` to force every following argument to be read as a path.

`-h` / `--help` prints usage. `-v` / `--version` prints the skill version and the pinned WordPress snapshot.

Exit codes:

- `0` — every input source is valid.
- `1` — findings contain at least one error-level entry.
- `2` — usage or input error: unreadable path, unknown option, no input sources found (a directory argument containing no `*.html` files counts), no input given while stdin is a terminal, or a failed dependency bootstrap.

On exit `0` and `1`, stdout carries a JSON array and nothing else. Bootstrap messages and all diagnostics go to stderr.

## Result

One report object per source, in input order:

- `source`: the path exactly as supplied on the command line, `<stdin>`, or a caller-provided label.
- `wordpressVersion`: the tested WordPress snapshot.
- `blockCount`: all parsed blocks, including nested blocks.
- `registeredCoreBlockTypes`: registered `core/*` block types in the snapshot.
- `valid`: `true` only when `findings` contains no `level: "error"` entry.
- `findings`: ordered errors and warnings. See below.
- `canonicalMarkup`: the WordPress parse-then-serialize output. Present **only** when it differs from the supplied text — exactly the condition that emits `noncanonical-serialization`.
- `notChecked`: guarantees that require a real destination WordPress site.

## Finding shape

Every finding carries `level` (`error` or `warning`), `code`, `block`, and `message`. `block` is the block name, or `null` for document-level findings. The remaining fields are conditional:

| Field | Type | Present on |
| --- | --- | --- |
| `path` | array of zero-based indices | block-scoped findings, tracing the block from the top level down through `innerBlocks` — `[0]` is the first top-level block, `[2, 1]` is the second child of the third top-level block |
| `line` | number | `malformed-attribute-json` only, in place of `path` |
| `issues` | array of strings | `invalid-saved-content` only — the flattened Gutenberg validation diagnostics, naming the exact attribute or node mismatch and printing both the generated and the stored HTML. This is the most actionable field in the report |

`root-relative-url`, `missing-fragment-target`, `no-blocks`, `noncanonical-serialization`, and `non-idempotent-serialization` carry neither `path` nor `line`.

Findings are emitted in a fixed order: attribute-JSON findings first, then `no-blocks`, then per-block findings in depth-first order, then link findings, then the two serialization findings.

## Finding codes

Errors:

| Code | Meaning |
| --- | --- |
| `no-blocks` | The input produced zero blocks. |
| `malformed-attribute-json` | The JSON in an opening block delimiter does not parse. |
| `freeform-html` | Content fell through as freeform/classic HTML. |
| `unregistered-block` | The block name is not registered in the pinned core library. |
| `missing-block` | The markup contains a `core/missing` placeholder, meaning the editor that produced it did not recognize a block. `originalName`, when present in the attributes, is named in the message. |
| `invalid-saved-content` | Saved HTML does not match the block's registered `save` implementation. This is what triggers "Attempt Block Recovery". |
| `nonportable-core-block` | A registered core block that is not standalone — it depends on post, query, comment, taxonomy, template, authentication, or site-setting context. |
| `site-entity-id` | An attribute holds a destination-site database or media ID. |
| `root-relative-url` | An `href` or `src` beginning with a single `/`. |
| `missing-fragment-target` | A `#` fragment link with no matching `id` in the same input. |
| `non-idempotent-serialization` | A second parse-then-serialize pass changed the canonical markup — the markup is unstable across editor round-trips. |

Warnings:

| Code | Meaning |
| --- | --- |
| `noncanonical-serialization` | Parse-then-serialize canonicalized the supplied markup. Always warning level; it never escalates to an error. |
| `theme-dependent-style` | Style or preset attributes whose appearance depends on the destination theme. |
| `custom-class` | A custom CSS class that may not exist on the destination site. |

## Portability policy

The validator accepts only registered `core/*` blocks that can be represented as standalone post content. It rejects:

- unknown and third-party blocks;
- freeform/classic HTML and `core/missing` placeholders;
- dynamic blocks that depend on post, query, comment, taxonomy, authentication, or template context;
- blocks that reference reusable blocks, navigation entities, attachments, users, posts, or terms by database ID;
- Custom HTML and shortcodes, whose safety or meaning depends on the destination site;
- root-relative URLs and fragment links without a matching anchor in the supplied content.

It warns about custom CSS classes and theme preset attributes because their appearance can change with the destination theme.

## What `valid: true` does not cover

Structural validity is not publication safety.

- Link checking is limited to `href`/`src` values starting with a single `/` and `#` fragments without a matching `id`. Dangerous URL schemes (`javascript:`, `data:`), event-handler attributes (`onclick` and friends), and inline `<script>` are **not** rejected and do not affect `valid`.
- KSES filtering, user capabilities, and destination-site sanitization are not evaluated at all. Markup can pass here and still be stripped, altered, or unsafe on a real site.
- Editor insertion behavior, migrations beyond the bundled snapshot, and save behavior in a particular WordPress installation are not exercised. These limits are real but do not appear in the report's `notChecked` array.

## Not checked

The `notChecked` array returned in every report:

- server-side rendering and destination-site plugin filters;
- WordPress capabilities, KSES filtering, and sanitization;
- remote URL availability and destination-site attachment existence;
- destination theme CSS, `theme.json`, templates, patterns, and block supports;
- visual layout, responsive behavior, accessibility, and semantic quality.

Report every entry verbatim alongside the verdict. Do not describe any of them as verified.
