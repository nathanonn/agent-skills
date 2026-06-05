# Scaffold Templates Reference (Phase 2)

Read this file when generating root config + `<slug>/` plugin bootstrap + `protocols/run_goal_tests.md` + the host-detected `.codex/skills/playwright-cli/` bundle.

Phase 2 follows the sanitize + atomic write contract from `SKILL.md` — stage to `${TMPDIR}/wp-requirements-to-goals-phase2-XXXX/`, run the sanitizer (`references/sanitizer.md`), then `mv` to the project root.

## Inputs

- `./goals-plan.md` (mandatory — pull slug, namespace, WP/PHP versions, required plugins)
- `./_shared/project-config.md` (mandatory — pull APP_NAME, NAMESPACE, CSS_PREFIX, PHP_PREFIX, ports, credentials, skill references)
- `./requirements.md` (for cross-reference and short-description text)
- `references/verification-protocol.md` (for the verbatim contents of `protocols/run_goal_tests.md`)

## Host-detect playwright-cli (run BEFORE clarifications)

Before asking the user anything, probe the host filesystem:

1. Check whether `.claude/skills/playwright-cli/` exists relative to the wp-requirements-to-goals skill installation. The convention is that peer skills live as siblings inside `.claude/skills/`, so the probe is: from the wp-requirements-to-goals skill's directory, look at `../playwright-cli/SKILL.md`. If the file exists and is readable, the bundle is available.
2. If available, copy the **entire `.claude/skills/playwright-cli/` directory tree** into the Phase 2 staging tree as `.codex/skills/playwright-cli/` — preserving all files (`SKILL.md`, any `scripts/`, `assets/`, `references/`). The destination path uses `.codex/skills/` because Codex (the runtime that executes `/goal`) reads bundled skills from there. `.claude/skills/` is meaningless inside a Codex session.
3. Update `goals-plan.md`'s `clarifications:` YAML block — set `playwright_cli_bundled: yes`.
4. If not available (host doesn't have the skill), set `playwright_cli_bundled: no` and **strip** the `.codex/skills/playwright-cli/SKILL.md` reference line from the AGENTS.md template before writing.
5. Update `_shared/project-config.md` § Skill References row — set the `Status` column to `bundled`, `host-only`, or `not-installed` depending on which case applied.

Bundling is the contract. The generated project must work for users whose host has the skill _and_ users whose host doesn't. A missing skill is not a hard failure — it just means Codex won't have the playwright-cli reference card pre-staged, and the user will need to install / consult playwright-cli docs separately.

## Clarification points

Resolve via `AskUserQuestion`. Most are quick because the planner already settled most defaults — confirmations rather than open questions. Identity values now live in `_shared/project-config.md` (set in Phase 1); Phase 2 does not re-ask them.

| #   | Decision                                                                           | Recommendation                                                                                     |
| --- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | **Author name** in plugin file header                                              | Recommended: blank (drop the `Author:` line). Alternate: ask user for their name / handle.         |
| 2   | **Composer vendor** in `<slug>/composer.json` `name` field                         | Recommended: `<slug>/<slug>`. Alternate: a separate vendor (e.g., `nathanonn/<slug>`).             |
| 3   | **wp-env additional config** beyond defaults (themes, mu-plugins, custom mappings) | Recommended: defaults only. Alternate: ask user for additions.                                     |
| 4   | **`WP_DEBUG_LOG` toggle** in `.wp-env.json` config block                           | Recommended: `true` (development environment). Alternate: `false` if user prefers minimal logging. |

## Conflict detection

Before staging each scaffold file to the Phase 2 tmp tree, check whether it already exists in the project root. For each conflict:

- **`.wp-env.json`, `package.json`, `README.md`, `AGENTS.md`** — ask user: overwrite, skip, or merge? Default: skip with a chat note.
- **`<slug>/<slug>.php`, `<slug>/src/Plugin.php`, `<slug>/composer.json`** — ask user: overwrite or skip? Default: skip.
- **`fixtures/.gitkeep`** — silently skip if `fixtures/` already has files.
- **`protocols/run_goal_tests.md`** — overwrite without asking; the protocol is canonical and re-running the skill should always emit the current version.
- **`run-goals.sh`** — overwrite without asking; same rationale as the protocol. The script is generic (no per-project substitution) and should always reflect the current template.
- **`.gitignore`** — if exists, prefer to **merge missing lines** rather than overwrite. Show the diff to the user before applying.
- **`.codex/skills/playwright-cli/`** — overwrite without asking; the skill bundle is canonical and should always reflect the current host version. (If the host doesn't have the skill, the bundle is not staged in the first place.)

The conflict-detection decisions are settled **before** staging — once the Phase 2 tmp tree is built, the atomic `mv` step assumes every conflict has been resolved.

## Outputs (all at project root unless noted)

1. `README.md`
2. `AGENTS.md`
3. `.wp-env.json`
4. `package.json`
5. `fixtures/.gitkeep`
6. `<slug>/<slug>.php`
7. `<slug>/src/Plugin.php`
8. `<slug>/composer.json`
9. `protocols/run_goal_tests.md`
10. `run-goals.sh` (executable; copied verbatim from `references/run-goals-template.sh`)
11. `.gitignore` (write only if missing or merge-on-existing)
12. `.codex/skills/playwright-cli/` (entire directory tree; only when host-detect succeeded)

**Critical convention:** the plugin directory is named after the slug (e.g., `autofomo/`). WordPress plugin activation uses the folder name as the plugin identifier — a generic `plugin/` directory will not activate cleanly.

## File contents

### `README.md`

````md
# <Plugin Name>

<one-line purpose from requirements.md>

## Stack

- WordPress <wp_version>+
- PHP <php_version>+
- <required plugin>, if any
- Development environment: [@wordpress/env](https://www.npmjs.com/package/@wordpress/env)
- Browser verification: [`playwright-cli`](https://github.com/microsoft/playwright) (imperative shell tool — no `@playwright/test` here)
- Server-side verification: `wp eval` / `wp eval-file` via wp-env CLI

## Project conventions

`_shared/project-config.md` is the single source of truth for project-wide vocabulary — app name, namespace, CSS prefix, ports, admin credentials, skill references. Edit it instead of grepping the tree for renames. Per-goal templates indirect to that file rather than inlining values.

If `_shared/dev-patterns.md` exists, it carries extracted conventions from the project's `CLAUDE.md` / `AGENTS.md`. Codex reads it as required context for every goal.

## Quick start

```bash
npm install
npm run env:start
# Then, inside <slug>/:
#   composer install
#   composer dump-autoload
```
````

Default URLs (override by editing `.wp-env.json`):

- Dev: `_shared/project-config.md` → Environment → `DEV_URL`
- Admin: `_shared/project-config.md` → Environment → `ADMIN_URL`
- Admin credentials: `_shared/project-config.md` → Test Credentials

## Goals layout

This project is organized around layered goals. See [`goals-plan.md`](./goals-plan.md) for the full sequence. Each goal has its own folder under `goals/` containing `GOAL.md`, `VERIFY.md`, `PROGRESS.md`, and `tests/`.

## Verification

Each goal folder has a `VERIFY.md` that prescribes the checks for that goal. The browser-based portion is driven by the agent-agnostic protocol at [`protocols/run_goal_tests.md`](./protocols/run_goal_tests.md). Codex during a `/goal` run reads the protocol inline as part of evidence-based completion. The protocol takes one argument — the goal folder path — and writes per-TC artifacts (`recording.webm`, `console.log`, `test-status.json`, `test-results.md`) back into the goal folder.

To verify a goal manually:

> Follow `protocols/run_goal_tests.md` with `<goal-folder>` = `goals/00-foundation`

````

### `AGENTS.md`

The AGENTS.md is addressed to **Codex** (the agent that will run `/goal`). It must not mention Claude Code or `.claude/`.

```md
# AGENTS.md

Repository-wide rules for any coding agent (notably Codex during a `/goal` run) working in this project.

## Required context (read before any goal)

- `_shared/project-config.md` — project-wide vocabulary (APP_NAME, NAMESPACE, CSS_PREFIX, ports, admin credentials, skill references). When a template asks for `NAMESPACE`, read it from this file rather than guessing.
- `_shared/dev-patterns.md` — project-specific conventions extracted from the input project's source documentation. These override generic WordPress conventions when they conflict. (Skip this bullet if `_shared/dev-patterns.md` is absent.)
- `.codex/skills/playwright-cli/SKILL.md` — browser-automation contract for the verification protocol. (Skip this bullet if the bundle is absent — see `_shared/project-config.md` § Skill References for status.)

## Source of truth

For every change, the source of truth is — in priority order:

1. The active goal's `GOAL.md` (under `goals/<NN>-*/GOAL.md`)
2. The active goal's `VERIFY.md`
3. `goals-plan.md` (the agreed decomposition + allowed paths + sequencing)
4. `_shared/project-config.md` (identity / environment / credentials)
5. `_shared/dev-patterns.md` (project-specific conventions)
6. `requirements.md` (the original spec)
7. Existing code conventions

If two sources conflict, the higher one wins. If `requirements.md` and `goals-plan.md` disagree, that's an authoring bug — stop and surface it rather than guessing.

## Allowed paths

When working on Goal NN, only modify paths listed under that goal's "Allowed paths" section in `goals-plan.md`. Out-of-scope paths are off-limits even for incidental fixes — surface a separate goal instead.

## Forbidden

- Editing other goals' folders
- Editing `requirements.md`
- Editing `goals-plan.md` (the human reviewer owns this)
- Editing `_shared/project-config.md` (single source of truth — user-owned after Phase 1)
- Editing `_shared/dev-patterns.md` (extracted reference; the human reviewer owns the source)
- Editing `.codex/skills/` (bundled skill mirrors — canonical from the host)
- Editing `protocols/run_goal_tests.md` (canonical, agent-agnostic)
- Adding new dependencies without updating the active goal's `GOAL.md` first

## Canonical command pattern — wp-env routes everything WP

Every command that uses a tool inside the wp-env container (WordPress, WP-CLI, composer, php, phpunit) goes through the `env:cli` script in `package.json`:

| Command | Through | Not |
|---------|---------|-----|
| `wp plugin activate <slug>` | `npm run env:cli -- plugin activate <slug>` | bare `wp plugin activate <slug>` |
| `wp eval-file path.php` | `npm run env:cli -- eval-file path.php` | bare `wp eval-file path.php` |
| `wp option update key value` | `npm run env:cli -- option update key value` | bare `wp option update …` |
| `wp eval 'echo "OK";'` | `npm run env:cli -- eval 'echo "OK";'` | bare `wp eval …` |

`env:cli` is defined as `wp-env run cli wp` so the `wp` is implicit in every invocation.

For composer (the plugin's PHP deps), run inside the container too:

```bash
npx wp-env run cli composer --working-dir=wp-content/plugins/<slug> install
npx wp-env run cli composer --working-dir=wp-content/plugins/<slug> dump-autoload
````

Native commands (run on the host, not the container): `npm`, `node`, `npx`, `playwright-cli`, `git`. Everything else goes through wp-env.

## Verification

Each goal's `VERIFY.md` prescribes what to run. The browser portion delegates to `protocols/run_goal_tests.md`. Codex during `/goal` reads the protocol inline; standalone runs follow it the same way:

> Follow `protocols/run_goal_tests.md` with `<goal-folder>` = `goals/<NN>-<slug>`

The protocol owns the playwright-cli session lifecycle. Do not call `playwright-cli ... close` from within a per-TC step.

URLs and admin credentials used in test plans come from `_shared/project-config.md` (Environment + Test Credentials tables). The protocol re-reads `.wp-env.json` at run time so port edits in that file flow through without re-scaffolding.

## Harness sandbox

If the agent harness running `/goal` restricts shell access (sandbox, approval policy, allow-list), pre-approve or bypass it for **wp-env, Docker, and playwright-cli** commands. These tools touch Unix sockets, the network, and process-spawn paths that sandboxes commonly block. Symptoms when blocked: `Operation not permitted`, connection refused on Unix sockets, permission denied on `/var/run/docker.sock`, or hangs that timeout silently.

The narrowest workable allow-list:

- `npx wp-env start|stop|run|destroy|clean`
- `playwright-cli ...`
- Docker daemon access (`/var/run/docker.sock`)

## Completion gate

A goal is complete only when:

- Every AC in `GOAL.md` has evidence in `PROGRESS.md`
- Every required check in `VERIFY.md` has run cleanly
- `protocols/run_goal_tests.md` reports every TC `pass` for the goal folder
- No regressions in earlier goals (verified at the Integration goal stage)

````

**Conditional stripping (apply before writing AGENTS.md):**

- If `_shared/dev-patterns.md` was not emitted in Phase 1 (Track A extraction yielded no matched sections), remove the `_shared/dev-patterns.md` bullet from the "Required context" list **and** the row from the Source-of-truth ordered list (renumbering the remaining rows so there's no gap).
- If `playwright_cli_bundled: no` in `goals-plan.md` (host-detect did not find the skill), remove the `.codex/skills/playwright-cli/SKILL.md` bullet from "Required context."
- Never leave a bullet pointing at a file that wasn't written.

### `.wp-env.json`

```json
{
  "core": "WordPress/WordPress#<wp_version>",
  "phpVersion": "<php_version>",
  "plugins": [
    "./<slug>"
  ],
  "config": {
    "WP_DEBUG": true,
    "WP_DEBUG_LOG": true,
    "SCRIPT_DEBUG": true
  },
  "mappings": {
    "wp-content/uploads/fixtures": "./fixtures"
  }
}
````

If `goals-plan.md` lists a required plugin in "Plugin metadata", append it to the `plugins` array — usually as the latest-stable download URL, e.g. `"https://downloads.wordpress.org/plugin/woocommerce.latest-stable.zip"`.

If clarification #5 set `WP_DEBUG_LOG: false`, omit that line.

### `package.json`

```json
{
  "name": "<slug>",
  "private": true,
  "scripts": {
    "env:start": "wp-env start",
    "env:stop": "wp-env stop",
    "env:clean": "wp-env clean all",
    "env:cli": "wp-env run cli wp",
    "test:domain": "echo 'Run: npm run env:cli -- eval-file <goal>/tests/domain.eval.txt' && exit 0"
  },
  "devDependencies": {
    "@wordpress/env": "^10.0.0"
  }
}
```

Do **not** add `@playwright/test` or `playwright`. Do **not** generate `playwright.config.ts`. The browser stack is `playwright-cli` (workspace-level imperative tool), not the Playwright test runner.

### `fixtures/.gitkeep`

Empty file. The README mentions it; goals that need sample data populate this directory or sub-paths.

### `<slug>/<slug>.php`

```php
<?php
/**
 * Plugin Name: <Display Name>
 * Description: <one-line purpose from requirements.md>
 * Version: 0.1.0
 * Requires at least: <wp_version>
 * Requires PHP: <php_version>
 * Text Domain: <slug>
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

require_once __DIR__ . '/vendor/autoload.php';

\<Namespace>\Plugin::instance()->boot();
```

If clarification #2 chose to include an `Author:`, add the line before `Text Domain:`. Otherwise omit it.

If `goals-plan.md` lists a required plugin (e.g., WooCommerce), wrap the `boot()` call in a dependency guard:

```php
add_action( 'plugins_loaded', function () {
    if ( ! class_exists( 'WooCommerce' ) ) {
        add_action( 'admin_notices', function () {
            echo '<div class="notice notice-error"><p><Display Name> requires WooCommerce.</p></div>';
        });
        return;
    }
    \<Namespace>\Plugin::instance()->boot();
});
```

(Replace `WooCommerce` / `class_exists` with whatever sentinel the required plugin exposes — e.g., for Yoast SEO, `class_exists( 'WPSEO_Options' )`.)

Goal 00 Foundation will replace the stub `boot()` body with real wiring during implementation.

### `<slug>/src/Plugin.php`

```php
<?php
namespace <Namespace>;

final class Plugin {
    private static ?Plugin $instance = null;

    public static function instance(): Plugin {
        return self::$instance ??= new self();
    }

    public function boot(): void {
        // Filled in by Goal 00 Foundation.
    }

    private function __construct() {}
}
```

### `<slug>/composer.json`

```json
{
  "name": "<vendor>/<slug>",
  "description": "<one-line purpose>",
  "type": "wordpress-plugin",
  "require": {
    "php": ">=<php_version>"
  },
  "autoload": {
    "psr-4": {
      "<Namespace>\\": "src/"
    }
  }
}
```

`<vendor>` defaults to the slug itself (per clarification #3 recommendation), e.g. `autofomo/autofomo`.

### `protocols/run_goal_tests.md`

Read `references/verification-protocol.md` and copy the contents between the marker lines that exactly equal `--- BEGIN PROTOCOL ---` and `--- END PROTOCOL ---` verbatim into `protocols/run_goal_tests.md`, excluding both marker lines.

**Important:** The reference file's prose mentions the marker strings before the real marker lines. Do not use a plain substring search such as `text.index("--- BEGIN PROTOCOL ---")`; that can capture the explanatory prose instead of the protocol body. Match the full line exactly.

Safe extraction shape:

```bash
awk '/^--- BEGIN PROTOCOL ---$/ {copy=1; next} /^--- END PROTOCOL ---$/ {copy=0} copy {print}' \
  references/verification-protocol.md > protocols/run_goal_tests.md
```

After staging the file, verify all of the following before sanitizer/atomic move:

1. `cmp` or `diff -u` shows the staged file is byte-for-byte identical to the exact anchored extraction above.
2. The file has substantial protocol content (not a one-line fragment); `wc -l protocols/run_goal_tests.md` should be over 100 lines.
3. The first nonblank line is `# run_goal_tests — Goal Verification Protocol`.
4. The staged file does not contain either marker line (`--- BEGIN PROTOCOL ---` or `--- END PROTOCOL ---`).

Do not paraphrase, summarize, trim, or otherwise modify the protocol. The protocol is the canonical agent-agnostic verification contract.

### `run-goals.sh`

Copy `references/run-goals-template.sh` verbatim to the project root as `run-goals.sh`, then `chmod +x` it. The template is fully generic — it discovers goals dynamically from `goals/[0-9][0-9]-*/`, so there is **no substitution** to perform.

The script wraps every goal in one `codex exec` call using the standard `/goal` prompt shape. It brackets the sweep with `npm run env:start` / `env:stop` for full runs, leaves wp-env up on failure for interactive debugging, and supports `--from <NN>`, `--to <NN>`, `--only <NN>`, `--dry-run`, and `--no-env` so the user can resume from a failed goal or run a single slice in isolation.

The default sandbox is `danger-full-access` because `/goal` verification needs Docker (wp-env), `playwright-cli`, and `npm install` — all of which `workspace-write` blocks. The header comment in the script explains the tradeoff and how to tighten it via `CODEX_SANDBOX=workspace-write`.

### `.gitignore`

If missing, write:

```gitignore
# Tracking policy (read this first):
# .codex/ is TRACKED — bundled skills must travel with the repo so Codex can
# read them on any clone. Only .claude/local-* per-user state is ignored.

# wp-env state
/.wp-env/

# env files (secrets, credentials, machine-specific overrides)
.env
.env.*

# dependencies
node_modules/
<slug>/vendor/

# build artifacts
<slug>/dist/
<slug>/build/

# i18n compiled
<slug>/languages/*.mo

# PHPUnit caches
.phpunit.result.cache
.phpunit.cache/

# coverage outputs
coverage/
clover.xml
*.lcov

# Playwright runtime state (recordings, traces, downloads)
.playwright/

# per-goal verification artifacts (generated by /goal runs)
goals/**/test-status.json
goals/**/test-results.md
goals/**/test-artifacts/

# codex exec logs from run-goals.sh
logs/goals/

# scratch / temp
*.tmp
*.bak
.migrate/

# Claude Code per-user state (intentionally ignored; .codex/ is tracked)
.claude/local-*

# OS / editor noise
.DS_Store
.idea/
.vscode/
*.swp
```

If `.gitignore` already exists, **merge** by appending only the lines not already present. Show a diff to the user before applying. Preserve the user's existing comment blocks — only append missing rules under a new comment header `# Added by wp-requirements-to-goals on <date>` so the merge is auditable.

## Substitution rules

Identity values come from `_shared/project-config.md` (Phase 1 wrote them there). The list below shows the substitution targets and which row in `project-config.md` each one reads:

- `<Plugin Name>` / `<Display Name>` — Identity row APP_NAME
- `<slug>` — Identity row PROJECT_SLUG
- `<Namespace>` — Identity row NAMESPACE
- `<wp_version>` — `clarifications.wp_version` in `goals-plan.md`
- `<php_version>` — `clarifications.php_version` in `goals-plan.md`
- `<vendor>` — Phase 2 clarification #2 answer (default: `<slug>`)

Identity values are substituted at scaffold time for the _raw bootstrap_ files (`<slug>.php`, `composer.json`, `package.json`, `.wp-env.json`) because those files don't easily support indirection prose. Downstream per-goal templates (`GOAL.md`, `VERIFY.md`, `tests/test_plan.md`) use indirection prose ("read `../_shared/project-config.md` → `NAMESPACE`") instead so a later rename only touches `project-config.md`.

- The dependency guard in `<slug>.php` is conditional — include only if `goals-plan.md` "Plugin metadata" lists a required plugin.
- The plugin folder name is **always** `<slug>` — never `plugin/`. The same `<slug>` is used as `Text Domain`, in `npm run env:cli -- plugin activate <slug>`, and in `.wp-env.json` `plugins`.
- Port placeholders (`[DEV_PORT]`, `[TEST_PORT]`, `[DEV_URL]`, `[ADMIN_URL]`) appear in some scaffold consumer files (the verification protocol, per-goal VERIFY templates). They are resolved by reading `_shared/project-config.md` Environment table at scaffold time. **Test plans never inline a port value** — they always read from project-config so a runtime port change in `.wp-env.json` is picked up.

## Sanitize + atomic write

After staging all scaffold files (including the bundled `.codex/skills/playwright-cli/` tree, if host-detect succeeded) to `${TMPDIR}/wp-requirements-to-goals-phase2-XXXX/`, first run the protocol-copy validation above, then run the sanitizer (`references/sanitizer.md`). On clean pass, `mv` each top-level entry from the staging tree into the project root. On any sanitizer or protocol-copy validation hit, `rm -rf` the staging tree and abort with the violation table — the project root is unchanged.

## Stop after scaffold

Print:

```
Scaffold complete: <N> files written.
```

If the user picked **phased**, do not stop — Phase 2 is not a checkpoint. Continue to Phase 3 immediately with a one-line progress note.
