# Plan Decomposition Reference (Phase 1)

Read this file before generating `goals-plan.md` and `_shared/project-config.md`. The plan is the source of truth that downstream phases depend on, so getting it right matters more than any other phase. Phase 1 also writes the project-wide vocabulary (`_shared/project-config.md`) and, when an input project carries source patterns, extracts them into `_shared/dev-patterns.md`.

Phase 1 follows the sanitize + atomic write contract from `SKILL.md` — stage to `${TMPDIR}/wp-requirements-to-goals-phase1-XXXX/`, run the sanitizer (`references/sanitizer.md`), then `mv` to the project root.

## Inputs

- `./requirements.md` — mandatory plugin spec
- `./notes/` — optional supplementary context (read every file in this directory if present)
- `./.wp-env.json` — optional; ports resolved from this if present (else defaults 8888 / 8889 with warning)
- `./CLAUDE.md`, `./AGENTS.md`, `./.claude/CLAUDE.md` — optional; Track A extraction sources for `_shared/dev-patterns.md`

## Track A extraction (run BEFORE clarifications)

Before asking the user any questions, scan for source patterns:

1. Look for `./CLAUDE.md`, `./AGENTS.md`, and `./.claude/CLAUDE.md` at the input project root. If none exist, skip the rest of this section silently — `_shared/dev-patterns.md` will not be emitted.
2. For each source file present, walk the H2 (`## `) and H3 (`### `) headings. Include any section whose heading contains one of these keyword tokens (case-insensitive): `pattern`, `convention`, `hook`, `namespace`, `banned`, `required`, `do not`, `must`, `style`, `lint`, `rule`. Skip sections whose heading matches `install`, `setup`, `usage`, `license`, `contributing` — those are biography, not conventions.
3. Concatenate the matched sections into a single `_shared/dev-patterns.md` body with this header:

```markdown
# Dev patterns — extracted from input project

Source files: <CLAUDE.md path>, <AGENTS.md path>
Extracted: <ISO date>

Codex must follow these patterns whenever they bear on the active goal. They override generic WordPress conventions when they conflict.

---

<concatenated H2/H3 sections, in source order>
```

4. If the resulting body is empty (no headings matched), do not emit `_shared/dev-patterns.md` at all. Log `dev_patterns_extracted: no` in `goals-plan.md` clarifications.
5. If the body has content, emit `_shared/dev-patterns.md` and log `dev_patterns_extracted: yes` in `goals-plan.md` clarifications.

Inputs are read-only — never modify the source CLAUDE.md/AGENTS.md. The sanitizer's "inputs warned, outputs strict" rule applies: banned tokens inside the source files surface as warnings, not aborts.

## Probe `.wp-env.json`

Before clarifications, read `.wp-env.json` at the input project root:

- If present and parseable: capture `port` (default 8888 if the key is absent) and `testsPort` (default 8889 if absent). These feed the Environment table in `_shared/project-config.md`.
- If absent: print a Phase 1 warning verbatim — `No .wp-env.json found; using default ports 8888 (dev) / 8889 (tests). Edit .wp-env.json later to override.` Proceed with defaults.

## Clarification points

Resolve these via `AskUserQuestion`, batching ≤4 questions per call. Always include a `(Recommended)` option listed first with a one-sentence rationale that references the requirements.md content where possible.

The identity block (rows 1-7) populates `_shared/project-config.md`. Every downstream template indirects to that file rather than re-asking the same values.

| # | Decision | Recommendation pattern |
|---|----------|------------------------|
| 1 | **APP_NAME** — plugin display name | Derive from `requirements.md` heading. Offer that as recommended; offer 1-2 plausible alternates if the heading is ambiguous. |
| 2 | **PROJECT_SLUG** — kebab-case slug | Recommended: kebab-case derivation of APP_NAME. Alternates: shorter slug, snake_case (rare). |
| 3 | **NAMESPACE** (PascalCase) | Recommended: standard PascalCase from slug. Alternate: brand-capitalized form (e.g., `AutoFOMO` vs `AutoFomo`). |
| 4 | **CSS_PREFIX** — class / data-attribute prefix used in markup and stylesheets | Recommended: `<slug>-` (kebab-case slug followed by a hyphen, e.g., `auto-fomo-`). Alternate: branded short form (e.g., `afomo-`). The default is often wrong for branded plugins — always confirm. |
| 5 | **PHP_PREFIX** — option key / function name prefix | Recommended: `<slug-with-underscores>_` (e.g., `auto_fomo_`). Alternate: shorter brand prefix (`afomo_`). |
| 6 | **TEXT_DOMAIN** — i18n text domain | Recommended: `<slug>` (matches the plugin folder name; WP convention). Rarely overridden. |
| 7 | **Min WordPress version** | **Read `requirements.md` first.** If it explicitly states a minimum (e.g., "Requires WordPress 6.0+"), use that as the Recommended value — never override an explicit user-stated minimum with the skill's default. Only fall back to `6.5` if `requirements.md` is silent or vague. Alternates: whatever the user states, plus the kit defaults `6.5`, `6.0`, `5.8`. |
| 8 | **Min PHP version** | Same rule as #7 — read `requirements.md` first; honor any explicit minimum. Only fall back to `7.4` if silent. Alternates: `8.0`, `8.1`, `8.2`. |
| 9 | **Required plugins** (for wp-env) | If `requirements.md` mentions WooCommerce or another plugin: ask for the wp-env plugin reference (slug, download URL, or git ref). Recommended: latest-stable `https://downloads.wordpress.org/plugin/<slug>.latest-stable.zip`. |
| 10 | **TC priority for each US** | Recommended: read priority from `requirements.md` if stated; otherwise default to `Medium` per US. Always confirm before locking in. |
| 11 | **Edge case ownership** (for ambiguous edges only) | For each edge case in `requirements.md` that could plausibly belong to >1 goal: ask which goal owns it. Recommend the most natural fit. |
| 12 | **Sequencing override** (optional) | Default order is: Foundation → rendering-core US → other USes → admin-visibility US → admin-settings US → non-US features → Integration. Offer this as recommended; let the user reorder. |

If `requirements.md` lacks information needed to even propose options for a row, ask the user open-ended ("What WP minimum version do you target?"). Never silently default.

## Logging answers in `goals-plan.md`

Record the answers as a YAML block at the top of `goals-plan.md` (under the `# Goals Plan` heading), so downstream phases can read them:

```yaml
---
clarifications:
  app_name: "..."
  slug: "..."
  namespace: "..."
  css_prefix: "..."
  php_prefix: "..."
  text_domain: "..."
  wp_version: "..."
  php_version: "..."
  required_plugins:
    - name: "..."
      reference: "..."
  tc_priority_default: "Medium"
  sequencing_override: false  # or true, with notes after
  dev_patterns_extracted: yes  # or no
  playwright_cli_bundled: pending  # set during Phase 2 to yes|no
  ports:
    dev: 8888
    tests: 8889
    source: ".wp-env.json"  # or "default" when no .wp-env.json existed
---
```

## What to extract from requirements.md

### 1. Plugin metadata

- **Display name** — from the top-level heading or stated explicitly
- **Slug** — kebab-case derived from the display name
- **WordPress version** — minimum WP version mentioned, or sensible default
- **PHP version** — minimum PHP mentioned, or sensible default
- **Required plugins** — e.g., WooCommerce; capture if mentioned
- **Activation behavior** — anything in requirements.md about activation, deactivation, dependency checks, fatal-error handling

### 2. User stories

Look for tagged stories: `US-01`, `US-02`, `US-XX`, "User Story XX", "Story XX". For each story capture:

- ID (e.g., `US-01`)
- One-line title (the "As a … I want … so that …" condensed)
- Acceptance criteria — copy verbatim from the document; do not summarize
- Linked requirement sections (which other parts of the doc this US references)

If no explicit US tags exist, derive stories from sections labeled "User Stories", "Personas", or "Use Cases". If those don't exist either, surface this as an open question in the plan — do not invent stories silently.

### 3. Non-US features (cross-cutting concerns)

Sections that describe meaningful features but aren't bound to a single user story. Common shapes:

- Alternate data sources (e.g., "Hybrid Mode", "External API Sync")
- Optional modes or feature toggles
- Privacy / compliance controls
- Integrations with other plugins
- Settings groups that need their own logic (not just UI)

Each non-US feature gets the same structure as a US: ID (e.g., `FEAT-hybrid-mode`), title, derived AC list (in summary form for the plan; full list comes during Phase 5), linked sections.

### 4. Edge cases

Tables, bullet lists, or sections labeled "Edge Cases", "Boundary Conditions", "Error Handling", or similar. For each edge case, decide which goal owns it:

- If it's tied to one US's behavior → that US's goal
- If it's a foundation concern (e.g., "WP plugin deactivated") → Goal 00 Foundation
- If it spans multiple USes or describes integration behavior → Integration goal
- If ownership is ambiguous → ask the user (clarification point #8)

### 5. Settings catalog

Every admin-configurable setting mentioned anywhere in the doc:

- Name (display label)
- Type — toggle / select / text / multi / number / range / repeater
- Default value
- Owning **feature** (the US whose code reads the option)
- Owning **UI** goal (typically the admin-settings US)

This catalog is critical: Goal 00 Foundation's `domain.eval.txt` validates every option in this catalog against its default.

### 6. Sequencing rules

When ordering the goals:

- **Goal 00 is always Foundation.**
- Place the "rendering core" / "main happy-path" US first among feature goals — it's the one other USes build on.
- Place admin-settings UI US **late** (it wires up every option built by earlier goals).
- Place admin-visibility / suppression US **just before** admin-settings, so the settings page is testable in admin without notifications popping over the form.
- Non-US features go after the USes they extend.
- **The final goal is always Integration.**

If requirements.md doesn't have an admin-settings US or an admin-visibility US, note it in the open questions section but don't invent goals.

## Output: `_shared/project-config.md` template

Write this file alongside `goals-plan.md` (it's the second Phase 1 output, after the dev-patterns extraction). **First-write only:** if `_shared/project-config.md` already exists in the project, skip emitting it and print one note `_shared/project-config.md exists; preserving user edits`. The file is the project's vocabulary contract — once written, the user owns it. Re-runs of the skill must not silently overwrite the user's adjustments.

```markdown
# Project Config

Single source of truth for project-wide vocabulary. Downstream templates and AGENTS.md reference this file by table-and-row rather than inlining the values, so renames stay in one place.

## Identity

| Key | Value |
|-----|-------|
| APP_NAME | <Display Name> |
| PROJECT_SLUG | <slug> |
| NAMESPACE | <Namespace> |
| CSS_PREFIX | <css-prefix> |
| PHP_PREFIX | <php_prefix> |
| TEXT_DOMAIN | <slug> |

## Environment

| Key | Value |
|-----|-------|
| DEV_PORT | <dev_port>           # 8888 unless .wp-env.json overrides |
| TEST_PORT | <tests_port>         # 8889 unless .wp-env.json overrides |
| DEV_URL | http://localhost:<dev_port> |
| TEST_URL | http://localhost:<tests_port> |
| ADMIN_URL | http://localhost:<dev_port>/wp-admin/ |

`.wp-env.json` is authoritative — if the user later changes the port there, every consumer reads the file at run time and picks up the new value. The numbers above are the Phase 1 snapshot for reference, not the runtime source of truth.

## Test Credentials

| Key | Value |
|-----|-------|
| ADMIN_USER | admin |
| ADMIN_PASSWORD | password |

These are wp-env's defaults. Override only if the user explicitly customizes the wp-env Docker container.

## Skill References

| Key | Value | Status |
|-----|-------|--------|
| BROWSER_SKILL | .codex/skills/playwright-cli/SKILL.md | <bundled-status> |

`<bundled-status>` is `bundled` if Phase 2 host-detect copied the playwright-cli skill, `host-only` if the host has the skill but bundling was skipped, or `not-installed` if the host doesn't have it. AGENTS.md only references the bundled skill when status is `bundled` — otherwise the reference line is stripped.

## Optional Commands

| Key | Value |
|-----|-------|
| VERIFICATION_COMMANDS | _empty_ |
| GIT_COMMANDS | _empty_ |

(User-owned section — populate as your project develops conventions.)
```

Substitute every `<...>` value from the Phase 1 clarifications before writing. The two `_empty_` sentinels in Optional Commands are kept literal — they signal "no convention yet" and become user-editable placeholders.

## Output: `goals-plan.md` template

Write this file at the project root. Use exactly this structure (the YAML block goes first, before the `# Goals Plan` heading):

````md
---
clarifications:
  display_name: "<Display Name>"
  slug: "<slug>"
  namespace: "<Namespace>"
  wp_version: "6.5"
  php_version: "7.4"
  required_plugins:
    - name: "WooCommerce"
      reference: "https://downloads.wordpress.org/plugin/woocommerce.latest-stable.zip"
  tc_priority_default: "Medium"
  sequencing_override: false
---

# Goals Plan — <Plugin Name>

## Plugin metadata

- Slug: <slug>
- Requires WordPress: <wp_version>
- Requires PHP: <php_version>
- Required plugins: <list, or "none">
- Activation behavior: <one paragraph from requirements.md>

## Detected user stories

| ID | Title | AC count | Linked sections |
|----|-------|----------|-----------------|
| US-01 | <one-line title> | <count> | "<section name>", "<section name>" |
| US-02 | ... | ... | ... |

## Detected non-US features

| ID | Title | Why it's not a US | Owns |
|----|-------|-------------------|------|
| FEAT-<slug> | <Display Name> | <reason> | <comma-separated owned behaviors> |

(Omit this section if no non-US features.)

## Detected edge cases

| Edge case | Owner goal |
|-----------|------------|
| <edge case verbatim> | Goal 00 Foundation |
| <edge case verbatim> | US-XX |

## Settings catalog

| Option | Type | Default | Owning feature | UI in goal |
|--------|------|---------|----------------|------------|
| <option_key> | toggle/select/text/etc. | <default> | <Goal 00 / US-XX / FEAT-XX> | US-XX (admin-settings) |

## Proposed sequence

| # | Goal slug | What it owns | Depends on | Tools |
|---|-----------|--------------|------------|-------|
| 00 | foundation | scaffold + walking skeleton | — | wp-cli |
| 01 | usXX-<slug> | <one-line> | 00 | wp-cli + playwright-cli |
| 02 | usXX-<slug> | ... | 01 | playwright-cli |
| ... | ... | ... | ... | ... |
| NN | integration | full suite + edge cases | all | wp-cli + playwright-cli |

## Allowed paths per goal

### Goal 00 foundation
- `<slug>/<slug>.php`
- `<slug>/src/Plugin.php`
- `<slug>/src/Activator.php`
- `<slug>/src/Options.php`
- `<slug>/src/Public/Assets.php`
- `<slug>/src/Public/SkeletonNotification.php` (or whatever artifact class the walking skeleton needs)
- `<slug>/assets/js/<artifact>.js`
- `<slug>/assets/css/<artifact>.css`
- `goals/00-foundation/`

### Goal 01 usXX-<slug>
- `<slug>/src/Public/...` (specific subnamespace for this US)
- `<slug>/assets/js/...`
- `<slug>/assets/css/...`
- `goals/01-usXX-<slug>/`

(continue for every goal — pull subnamespaces from the US's behavior; ask the user if unclear)

## Open questions for the human reviewer

- <any unresolved ambiguities surfaced during decomposition>
- <missing US tags, missing AC sections, conflicting edge cases, etc.>
````

## Stop after writing the plan

Once `goals-plan.md` is written, print:

```
Plan written: <N> user stories, <M> non-US features, <P> total goals.
```

If the mode is **phased**, also print:

```
Review goals-plan.md. Edit it directly if you want changes.
When ready, reply "continue" or re-run /wp-requirements-to-goals to resume from Phase 2.
```

Then wait for user approval. If they reply with anything that isn't approval (e.g., a question or change request), respond and re-prompt.

If the mode is **one-shot**, do not stop — continue to Phase 2 immediately with a one-line progress note.

## Validation before writing

Before staging Phase 1's files to tmp, check:

- Every clarification point has a recorded answer (or `null`/`false` if explicitly skipped).
- Every detected US has at least one AC.
- The "Owning feature" column in the Settings catalog references a real goal in "Proposed sequence".
- "Depends on" entries reference real prior goal indices.
- Goal 00 is always Foundation; the highest-numbered goal is always Integration.
- The identity row in `_shared/project-config.md` has all six values resolved (APP_NAME, PROJECT_SLUG, NAMESPACE, CSS_PREFIX, PHP_PREFIX, TEXT_DOMAIN). Empty strings or `<...>` placeholders are bugs.
- The Environment row has both ports resolved (numeric values, never `<dev_port>`).
- If `_shared/dev-patterns.md` exists in the staging tree, it has non-empty body content (the Track A extraction yielded at least one matched section).

If any check fails, fix the content before staging — do not emit a partially-correct plan.

After validation passes, run the sanitizer (`references/sanitizer.md`) over the entire Phase 1 staging tree. On clean pass, `mv` `goals-plan.md`, `_shared/project-config.md`, and `_shared/dev-patterns.md` (if present) into the project root.
