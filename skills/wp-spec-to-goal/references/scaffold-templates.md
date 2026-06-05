# Scaffold templates — used in Step 4 of the skill flow

Read this file only when the user has agreed to scaffold missing pieces. Create only what's missing — never overwrite existing files. Confirm any potential collision in chat before writing.

The default missing-pieces set is:

- `<slug>/<slug>.php`
- `<slug>/composer.json`
- `.wp-env.json`
- `package.json`
- `AGENTS.md`
- `.gitignore`

Substitute every `{{...}}` placeholder with values gathered in Step 3. Reasonable defaults:

- `{{slug}}` — kebab-case
- `{{Vendor}}` — PascalCase from the user's namespace, or `Vendor` if unknown
- `{{Slug}}` — PascalCase of the slug, e.g. `auto-login` → `AutoLogin`
- `{{plugin_name}}` — human-readable name, e.g. `Auto Login`
- `{{description}}` — one sentence from the spec
- `{{php_version}}` — `8.1` unless the spec demands otherwise
- `{{wp_version}}` — leave empty unless specified

---

## `<slug>/<slug>.php`

```php
<?php
/**
 * Plugin Name: {{plugin_name}}
 * Description: {{description}}
 * Version: 0.1.0
 * Requires PHP: {{php_version}}
 * Requires at least: 6.0
 * License: GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( '{{SLUG_UPPER}}_VERSION', '0.1.0' );
define( '{{SLUG_UPPER}}_PATH', plugin_dir_path( __FILE__ ) );
define( '{{SLUG_UPPER}}_URL', plugin_dir_url( __FILE__ ) );

$autoload = {{SLUG_UPPER}}_PATH . 'vendor/autoload.php';
if ( file_exists( $autoload ) ) {
    require_once $autoload;
}

register_activation_hook( __FILE__, function () {
    // {{Activation hook — keep empty unless the spec needs setup work.}}
} );

register_deactivation_hook( __FILE__, function () {
    // {{Deactivation hook — keep empty unless the spec needs cleanup work.}}
} );

add_action( 'plugins_loaded', function () {
    if ( class_exists( '{{Vendor}}\\{{Slug}}\\Plugin' ) ) {
        ( new {{Vendor}}\\{{Slug}}\\Plugin() )->boot();
    }
} );
```

`{{SLUG_UPPER}}` is the slug uppercased with hyphens replaced by underscores, e.g. `auto-login` → `AUTO_LOGIN`.

---

## `<slug>/composer.json`

```json
{
    "name": "{{vendor-lower}}/{{slug}}",
    "description": "{{description}}",
    "type": "wordpress-plugin",
    "license": "GPL-2.0-or-later",
    "require": {
        "php": ">={{php_version}}"
    },
    "autoload": {
        "psr-4": {
            "{{Vendor}}\\{{Slug}}\\": "src/"
        }
    },
    "scripts": {
        "test": "phpunit",
        "lint": "phpcs --standard=WordPress src/"
    }
}
```

After writing, remind the user to run composer **through wp-env** so the container's PHP/extensions are used (not the host's):

```bash
npx wp-env start  # if not already running
npx wp-env run cli composer --working-dir=wp-content/plugins/{{slug}} install
```

---

## `.wp-env.json` (project root)

```json
{
    "core": null,
    "plugins": [
        "./{{slug}}"
    ],
    "config": {
        "WP_DEBUG": true,
        "WP_DEBUG_LOG": true,
        "WP_DEBUG_DISPLAY": false
    }
}
```

After writing, remind the user to run `npx wp-env start` to bring the environment up.

---

## `package.json` (project root)

```json
{
    "name": "{{slug}}-workspace",
    "version": "0.0.0",
    "private": true,
    "scripts": {
        "env:start": "wp-env start",
        "env:stop": "wp-env stop",
        "env:cli": "wp-env run cli",
        "test:smoke": "wp-env run cli wp plugin list",
        "lint": "echo \"add lint command\" && exit 0",
        "test": "echo \"add test command\" && exit 0"
    },
    "devDependencies": {
        "@wordpress/env": "^9.0.0"
    }
}
```

Notes:

- Keep `playwright` out of `devDependencies`. The user's verification model uses the `playwright-cli` skill, not `@playwright/test`.
- The `lint` and `test` scripts are placeholders so VERIFY.md can reference them; replace with real commands as the project grows.

After writing, remind the user to run `npm install` at the project root.

---

## `.gitignore` (project root)

Single root `.gitignore` covering wp-env state, dependencies, OS/editor noise, and per-goal test artifacts. Lockfiles are ignored — pick a different content set in the skill if this project ships as an end-user plugin where lockfiles should be tracked.

```gitignore
# Dependencies
/node_modules/
/{{slug}}/vendor/
package-lock.json
/{{slug}}/composer.lock

# wp-env state
/.wp-env/

# OS / editor
.DS_Store
Thumbs.db
.idea/
.vscode/

# Per-goal test artifacts
/goals/*/test-artifacts/
/goals/*/.playwright-cli/

# Logs
*.log
```

If a `.gitignore` already exists, do **not** overwrite. Show the user the template, ask whether to merge missing lines, and keep their existing entries intact.

---

## `AGENTS.md` (project root)

```md
# AGENTS.md — {{plugin_name}}

## Stack

- WordPress plugin under `{{slug}}/`
- PHP {{php_version}}+ (PSR-4 namespace `{{Vendor}}\{{Slug}}`)
- Development environment: wp-env (`.wp-env.json` at project root)
- Browser verification: playwright-cli (see `.claude/skills/playwright-cli/` if installed)
- Server-side verification: `wp eval` / `wp eval-file` via `npx wp-env run cli`

## Canonical command pattern — wp-env routes everything WP

**Rule:** anything provided by the wp-env container (WordPress, WP-CLI, PHP, composer, phpunit) must be invoked through `npx wp-env run cli ...`. Never call the host's native `wp`, `composer`, `php`, or `phpunit` against this project — they target the host's PHP/MySQL, not the wp-env container, and silently produce wrong results.

| Tool | DO | DON'T |
| --- | --- | --- |
| WP-CLI | `npx wp-env run cli wp plugin list` | `wp plugin list` |
| WordPress eval | `npx wp-env run cli wp eval 'echo "OK";'` | `wp eval ...` directly |
| Composer | `npx wp-env run cli composer --working-dir=wp-content/plugins/{{slug}} install` | `composer --working-dir={{slug}} install` |
| PHP scripts | `npx wp-env run cli php wp-content/plugins/{{slug}}/script.php` | `php {{slug}}/script.php` |
| PHPUnit | `npx wp-env run cli composer --working-dir=wp-content/plugins/{{slug}} test` | `phpunit` or native composer |

**Carve-out — these stay native (not provided by wp-env):**

- `npm`, `node`, `npx` (the host runs these to invoke wp-env itself)
- `playwright-cli` (browser harness runs on the host, points at `http://localhost:8888`)
- `git`

If a command isn't on either list, ask before assuming. The default is wp-env-routed.

## Harness sandbox

If the agent harness running `/goal` restricts shell access (sandbox, approval policy, allow-list, etc.), pre-approve or bypass it for **wp-env, Docker, and playwright-cli** commands. These tools touch Unix sockets, the network, and process-spawn paths that sandboxes typically block. Symptoms when blocked: `Operation not permitted`, `connection refused` on Unix sockets, `permission denied` on `/var/run/docker.sock`, or hangs that timeout silently.

Whatever the harness's mechanism — explicit bypass flag, configured allow-list, or interactive approval — apply it to:

- `npx wp-env start|stop|run|destroy|clean`
- any `docker` invocation
- any browser launch via `playwright-cli`

Native commands inside the wp-env cli container (`npx wp-env run cli ...`) inherit the same requirement, since the wrapper itself talks to Docker.

## Conventions

- Folder names: lowercase-kebab-case
- PHP class names: PascalCase, PSR-4 in `{{slug}}/src/`
- Capability checks: prefer `current_user_can('manage_options')` for admin endpoints unless the spec says otherwise
- Sanitize on input (`sanitize_text_field`, `absint`, `sanitize_email`); escape on output (`esc_html`, `esc_attr`, `esc_url`)
- Nonces required for any state-changing request

## Test artifact placement

The container only sees files inside the mounted plugin folder. So:

- **PHP scripts run by `wp eval-file`** → `{{slug}}/tests/goal-checks/<goal-dir>/p-XXX.php`
  Container path: `wp-content/plugins/{{slug}}/tests/goal-checks/<goal-dir>/p-XXX.php`
- **Browser artifacts (playwright-cli screenshots, traces)** → `goals/<goal-dir>/test-artifacts/<check-id>/`
  Stays on host; playwright-cli runs on host.

`<goal-dir>` is the directory under `goals/` for the current goal. For single-goal repos, that's typically the same name as `{{slug}}`. For multi-goal, it's the slice's directory (e.g., `01-foo`).

Never reference host paths from `wp eval-file` — `wp-cli` runs inside the container and can't read `goals/<goal-dir>/...`.

## Canonical commands

```bash
# Bring the dev env up (host-side)
npx wp-env start

# Run plugin smoke check (wp-env-routed)
npx wp-env run cli wp plugin list
npx wp-env run cli wp plugin activate {{slug}}

# Run server-side checks (wp-env-routed)
npx wp-env run cli wp eval 'echo "WP OK\n";'
npx wp-env run cli wp eval-file path/to/check.php

# Install plugin dependencies (wp-env-routed composer)
npx wp-env run cli composer --working-dir=wp-content/plugins/{{slug}} install

# Run PHP tests (wp-env-routed composer; only when defined in {{slug}}/composer.json scripts)
npx wp-env run cli composer --working-dir=wp-content/plugins/{{slug}} test

# Run linting (wp-env-routed when phpcs is a composer dev dep)
npx wp-env run cli composer --working-dir=wp-content/plugins/{{slug}} lint

# Browser verification (host-side)
# (use the playwright-cli skill, base URL http://localhost:8888)
```

## Security notes

- No secrets in code or logs.
- All admin output must be escaped.
- All inputs must be sanitized.
- Capability checks before any state change.

## Goal-driven workflow

This repo uses Codex `/goal` for autonomous implementation. Each goal lives at `goals/<slug>/`:

- `GOAL.md` — the objective, scope, and acceptance criteria
- `VERIFY.md` — verification commands and evidence rules
- `PROGRESS.md` — the audit trail /goal populates

To run a goal:

```text
/goal Complete goals/<slug>/GOAL.md. Use goals/<slug>/VERIFY.md as the verification contract. Update goals/<slug>/PROGRESS.md continuously. Treat uncertainty as incomplete.
```
```

Note: Replace `{{slug}}` everywhere in `AGENTS.md` with the actual slug. Don't leave doubled curly braces in the final file.
