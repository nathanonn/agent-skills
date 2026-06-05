# Scaffold Templates

Read this file when generating scaffold files in Step 4. Create only the files the user confirmed. Never overwrite existing files without explicit confirmation.

All templates use `{{tool-name}}` (kebab-case) and `{{Tool Name}}` (display name) as placeholders. Replace with confirmed values from Step 3.

---

## bin/{{tool-name}}.js

### JavaScript

```js
#!/usr/bin/env node
import '../src/cli.js';
```

### TypeScript

```js
#!/usr/bin/env node
import '../dist/cli.js';
```

Make the file executable: `chmod +x bin/{{tool-name}}.js`

---

## src/cli.js (or src/cli.ts)

```js
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));

const program = new Command();

program
  .name('{{tool-name}}')
  .description('{{one-line description}}')
  .version(pkg.version)
  .option('--json', 'Output as JSON')
  .option('--debug', 'Show debug output');

// TTY detection: if stdin is not a TTY, never prompt for input.
// Commands that need interactive input should check process.stdin.isTTY
// and either use --yes/--force flags or exit with a clear error.

{{// Import and register subcommands here:}}
{{// import { registerListCommand } from './commands/list.js';}}
{{// registerListCommand(program);}}

program.parse();
```

For TypeScript, use the same structure with type annotations as needed.

---

## src/config.js (or src/config.ts)

### Base (env vars + dotenv)

```js
import 'dotenv/config';
import { AppError } from './errors.js';

export function loadConfig() {
  const required = [{{// list confirmed required env vars, e.g. 'API_KEY', 'SERVICE_URL'}}];
  const missing = required.filter(k => !process.env[k]);

  if (missing.length > 0) {
    throw new AppError({
      code: 'CONFIG_MISSING',
      message: `Missing required environment variables: ${missing.join(', ')}`,
      suggestion: 'Copy .env.example to .env and fill in the values',
      exitCode: 1,
    });
  }

  return {
    {{// map env vars to config keys}}
  };
}
```

### With cosmiconfig (when config file support is confirmed)

Add this alongside the env var config:

```js
import { cosmiconfig } from 'cosmiconfig';

const explorer = cosmiconfig('{{tool-name}}');

export async function loadToolConfig() {
  const result = await explorer.search();
  return result?.config ?? {};
}
```

Precedence hierarchy (document in the code and AGENTS.md):
```
CLI flags > config file > env vars > built-in defaults
```

---

## src/errors.js (or src/errors.ts)

```js
export class AppError extends Error {
  constructor({ code, message, suggestion, exitCode = 1 }) {
    super(message);
    this.code = code;
    this.suggestion = suggestion;
    this.exitCode = exitCode;
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      suggestion: this.suggestion,
    };
  }
}

export function handleError(error, { json = false } = {}) {
  if (error instanceof AppError) {
    if (json) {
      process.stderr.write(JSON.stringify(error.toJSON()) + '\n');
    } else {
      console.error(`Error: ${error.message}`);
      if (error.suggestion) {
        console.error(`Suggestion: ${error.suggestion}`);
      }
    }
    process.exit(error.exitCode);
  }

  // Unexpected errors
  if (json) {
    process.stderr.write(JSON.stringify({
      error: 'UNEXPECTED',
      message: error.message,
      suggestion: 'This is a bug. Please report it.',
    }) + '\n');
  } else {
    console.error(`Unexpected error: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
  }
  process.exit(1);
}
```

---

## src/commands/ (one file per subcommand)

Example subcommand file — `src/commands/{{cmd}}.js`:

```js
import { AppError, handleError } from '../errors.js';

export function register{{Cmd}}Command(program) {
  program
    .command('{{cmd}}')
    .description('{{command description}}')
    .option('--dry-run', 'Preview without executing')
    .action(async (options) => {
      const json = program.opts().json;

      try {
        if (options.dryRun) {
          const preview = {{// build preview}};
          if (json) {
            process.stdout.write(JSON.stringify(preview) + '\n');
          } else {
            console.log('Dry run — would do:', preview);
          }
          return;
        }

        const result = {{// actual logic}};

        if (json) {
          process.stdout.write(JSON.stringify(result) + '\n');
        } else {
          console.log(result);
        }
      } catch (error) {
        handleError(error, { json });
      }
    });
}
```

---

## src/db.js (conditional — only when SQLite is confirmed)

```js
import Database from 'better-sqlite3';
import { resolve } from 'node:path';

let db;

export function getDb(dbPath) {
  if (!db) {
    db = new Database(resolve(dbPath));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    {{// CREATE TABLE IF NOT EXISTS statements from spec}}
  `);
}
```

Database file location options (from Step 3):

| Option | Path | When |
|--------|------|------|
| Project-local | `./<tool-name>.db` | Per-project tool |
| XDG data dir | `~/.local/share/<tool-name>/data.db` | User-global tool |
| Configurable | Via env var or config | Flexible deployment |

---

## src/auth.js (conditional — only when OAuth is confirmed)

```js
// OAuth Authorization Code flow with local redirect server
// 1. Generate cryptographically random state parameter
// 2. Start temporary HTTP server on localhost for redirect
// 3. Open browser to provider's authorization URL
// 4. Handle redirect callback, validate state, extract auth code
// 5. Exchange code for tokens via POST to provider's token endpoint
// 6. Return tokens to caller for storage via token-store module

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { URL } from 'node:url';

const DEFAULT_PORT = 8910;
const TIMEOUT_MS = 120_000;

export async function startOAuthFlow({ clientId, clientSecret, authUrl, tokenUrl, scopes, port = DEFAULT_PORT }) {
  // TODO: Implement OAuth Authorization Code flow
  // - Generate state: randomBytes(32).toString('hex')
  // - Build authorization URL with client_id, redirect_uri, scope, state
  // - Start HTTP server on localhost:port to catch the redirect
  // - Open browser to authorization URL (use 'open' package)
  // - Wait for callback with timeout (TIMEOUT_MS)
  // - Validate state parameter matches
  // - Exchange auth code for tokens via POST to tokenUrl
  // - Shut down temporary server
  // - Return { accessToken, refreshToken, expiresIn }
}
```

---

## src/token-store.js (conditional — only when OAuth is confirmed)

```js
// Token storage with optional AES-256-GCM encryption
// Supports 3 tiers:
//   Tier 1: Refresh token in .env file (unencrypted, gitignored)
//   Tier 2: Refresh token encrypted in SQLite (requires ENCRYPTION_KEY in .env)
//   Tier 3: Access token caching — in-memory only OR SQLite with expiry
//
// When both OAuth and data storage are active, share the same SQLite database.
// When OAuth is active alone, create a minimal SQLite db for token storage.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

export class TokenStore {
  constructor({ tier, dbPath, encryptionKey }) {
    // TODO: Initialize store based on tier
    // tier 1: read/write .env file for refresh token
    // tier 2: use SQLite with encryption for refresh token
    // tier 3 (add-on): cache access token in-memory or SQLite with expiry
  }

  async storeRefreshToken(provider, token) {
    // TODO: Tier 1 → append/update REFRESH_TOKEN in .env
    // TODO: Tier 2 → encrypt and store in SQLite tokens table
  }

  async getRefreshToken(provider) {
    // TODO: Tier 1 → read from process.env.REFRESH_TOKEN
    // TODO: Tier 2 → read from SQLite, decrypt
  }

  async storeAccessToken(provider, token, expiresAt) {
    // TODO: Tier 3 Option B → store in SQLite with expiry
    // TODO: Tier 3 Option A → no-op (in-memory only, caller holds it)
  }

  async getAccessToken(provider) {
    // TODO: Return cached token if not expired, null otherwise
  }

  async clearTokens(provider) {
    // TODO: Remove all tokens for provider from .env and/or SQLite
  }

  async getStatus(provider) {
    // TODO: Return metadata only (never values):
    // { stored: bool, location: 'env'|'sqlite', encrypted: bool, expiresAt: date|null }
  }
}

function encrypt(text, key) {
  // AES-256-GCM with unique IV per encryption
  // TODO: const iv = randomBytes(16);
  // TODO: const cipher = createCipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
  // TODO: Return iv + authTag + ciphertext as combined string
}

function decrypt(encrypted, key) {
  // TODO: Extract iv, authTag, ciphertext
  // TODO: const decipher = createDecipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
  // TODO: Return decrypted plaintext
}
```

---

## src/commands/auth.js (conditional — only when OAuth is confirmed)

```js
// Auth subcommand group: login, status, logout
// Follows all six AI-agent patterns:
//   --json on all subcommands (metadata only, never token values)
//   --dry-run on logout
//   stdout for data, stderr for diagnostics
//   Meaningful exit codes (0=authenticated, 1=not authenticated)

import { handleError } from '../errors.js';

export function registerAuthCommand(program) {
  const auth = program.command('auth').description('Manage authentication');

  auth.command('login')
    .description('Authenticate with {{provider}} via OAuth')
    .option('--port <n>', 'Redirect server port', 8910)
    .option('--no-browser', 'Print URL instead of opening browser')
    .action(async (options) => {
      const json = program.opts().json;
      try {
        // TODO: Run OAuth flow via src/auth.js
        // TODO: Ask storage tier preference (if not already configured)
        // TODO: Store tokens via src/token-store.js
        // TODO: Print confirmation (no secrets in output)
      } catch (error) {
        handleError(error, { json });
      }
    });

  auth.command('status')
    .description('Show current authentication state')
    .action(async (options) => {
      const json = program.opts().json;
      try {
        // TODO: Read token status via token-store.getStatus()
        // TODO: Output metadata only — never raw token values
        // TODO: Exit 0 if authenticated, exit 1 if not
      } catch (error) {
        handleError(error, { json });
      }
    });

  auth.command('logout')
    .description('Clear stored authentication tokens')
    .option('--dry-run', 'Show what would be cleared')
    .action(async (options) => {
      const json = program.opts().json;
      try {
        // TODO: Clear tokens via token-store.clearTokens()
        // TODO: Respect --dry-run (show what would be cleared, don't clear)
        // TODO: Print confirmation
      } catch (error) {
        handleError(error, { json });
      }
    });
}
```

---

## tests/cli.test.js (or tests/cli.test.ts)

```js
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const bin = resolve(import.meta.dirname, '../bin/{{tool-name}}.js');

function run(args = [], options = {}) {
  try {
    const stdout = execFileSync('node', [bin, ...args], {
      encoding: 'utf8',
      timeout: 10000,
      ...options,
    });
    return { stdout, exitCode: 0 };
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.status,
    };
  }
}

describe('{{tool-name}} CLI', () => {
  it('prints version', () => {
    const { stdout, exitCode } = run(['--version']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('prints help', () => {
    const { stdout, exitCode } = run(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('{{tool-name}}');
  });

  it('does not hang without TTY', () => {
    const { exitCode } = run([], { input: '' });
    expect([0, 1, 2]).toContain(exitCode);
  });
});
```

---

## .env.example

```
# {{Tool Name}} — environment configuration
# Copy this file to .env and fill in the values.
# See README.md for details on each variable.

{{# Only include if the tool needs external service credentials}}
{{API_KEY=your-api-key-here}}
{{SERVICE_URL=https://api.example.com}}

{{# Only include if OAuth is confirmed}}
# OAuth credentials (register at {{provider-url}})
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret

# Token storage (Tier 1 — populated after running `{{tool-name}} auth login`)
# REFRESH_TOKEN=

# Encryption key (Tier 2 only — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
# ENCRYPTION_KEY=
```

If the tool has no external service dependencies and no OAuth, this file can be omitted from the scaffold.

---

## .gitignore

```
# Dependencies
node_modules/

# Environment
.env
.env.local

# Build output
dist/

# Test output
coverage/

# Data
*.db
*.sqlite

# Logs
*.log

# OS
.DS_Store
Thumbs.db

# Editor
.idea/
.vscode/
*.swp
*.swo

# Goal test artifacts
goals/*/test-artifacts/
```

**Collision handling:** If `.gitignore` already exists, offer to merge missing lines rather than overwriting. The user may have project-specific entries.

---

## package.json

### JavaScript

```json
{
  "name": "{{tool-name}}",
  "version": "0.1.0",
  "description": "{{one-line description}}",
  "type": "module",
  "bin": {
    "{{tool-name}}": "./bin/{{tool-name}}.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "files": [
    "bin",
    "src"
  ],
  "scripts": {
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "commander": "^13.0.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

### TypeScript additions

Add to scripts:
```json
"build": "tsc",
"typecheck": "tsc --noEmit",
"prepublishOnly": "npm run build"
```

Add to devDependencies:
```json
"typescript": "^5.0.0"
```

Change files to:
```json
"files": ["bin", "dist"]
```

### Conditional dependencies

When SQLite is confirmed, add to dependencies:
```json
"better-sqlite3": "^11.0.0"
```

When cosmiconfig is confirmed, add to dependencies:
```json
"cosmiconfig": "^9.0.0"
```

When OAuth is confirmed, add to dependencies:
```json
"open": "^10.0.0"
```

(`http` and `crypto` are Node.js built-ins — no additional packages needed for the redirect server or encryption.)

---

## tsconfig.json (TypeScript only)

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## AGENTS.md

```md
# AGENTS.md

## Stack

- **Runtime**: Node.js (ESM)
- **Language**: {{JavaScript / TypeScript}}
- **Arg parsing**: {{commander.js / yargs}}
- **Test runner**: {{Vitest / Jest}}
- **Config**: dotenv for env vars{{, cosmiconfig for tool settings}}
{{- **Auth**: OAuth Authorization Code flow with local redirect server}}

## Canonical Commands

```bash
npm install          # Install dependencies
npm test             # Run test suite
npm run lint         # Run linter
{{npm run build}}      {{# Compile TypeScript (TS projects only)}}
{{npm run typecheck}}  {{# Type check without emitting (TS projects only)}}
node bin/{{tool-name}}.js   # Run the CLI directly
```

## Conventions

- ESM imports (`import`/`export`, not `require`)
- Kebab-case file and folder names
- One file per subcommand in `src/commands/`
- Business logic in `src/lib/` (no CLI concerns in lib code)
- Exit code contract: 0 = success, 1 = user error, 2 = usage error
- stdout for data, stderr for diagnostics
- `--json` flag on every command for machine-parseable output
- `--dry-run` on mutating commands

## Test Artifacts

- Test specs: `tests/`
- Test fixtures: `tests/fixtures/`
- Goal verification scripts: `goals/<goal-dir>/checks/`
- Goal test artifacts: `goals/<goal-dir>/test-artifacts/`

## Harness Sandbox

{{If the CLI calls external APIs:}}
The harness may need network access to {{target hosts}}. If tests use mocked responses, no special sandbox bypass is needed.

{{If the CLI is purely local:}}
Not applicable — this tool runs entirely on the host with no network or container dependencies.

{{If the CLI uses OAuth:}}
The harness needs network access to the provider's authorization and token endpoints, plus localhost binding for the OAuth redirect server (default port 8910). The `auth login` command opens a browser — this requires a display environment.
```

---

## CLAUDE.md (behavioral snippet)

Tells AI agents *when and how* to use each command — not just the flags. Generate from the confirmed acceptance criteria and I/O contract.

```md
# {{tool-name}}

## When to use this tool

{{One paragraph describing the tool's purpose and when an AI agent should reach for it.}}

## Commands

### `{{tool-name}} {{command}}`

**When:** {{Describe the situation that calls for this command}}
**Input:** {{What it needs — files, args, env vars}}
**Output:** {{What it produces — stdout format, files, side effects}}
**Flags:**
- `--json` — Machine-readable JSON output
- `--dry-run` — Preview without executing{{// only for mutating commands}}

{{// Repeat for each subcommand}}

{{When OAuth is confirmed, add these command entries:}}

### `{{tool-name}} auth login`

**When:** First-time setup, or when refresh token is revoked/expired.
**Input:** None (interactive — opens browser for OAuth consent).
**Output:** Confirmation message to stderr. With `--json`: metadata to stdout (no secrets).
**Flags:**
- `--port <n>` — Redirect server port (default: 8910)
- `--no-browser` — Print URL instead of opening browser (for SSH/headless)
- `--json` — Machine-readable metadata

### `{{tool-name}} auth status`

**When:** Check if authentication is configured and valid before running other commands.
**Input:** None.
**Output:** Token state summary (provider, stored/cached/expires — never raw values).
**Flags:**
- `--json` — Machine-readable status

### `{{tool-name}} auth logout`

**When:** Clearing credentials, switching accounts, or revoking access.
**Input:** None.
**Output:** Confirmation message.
**Flags:**
- `--dry-run` — Preview what would be cleared
- `--json` — Machine-readable confirmation

## Environment

- Requires: {{env vars or config, e.g. "API_KEY in .env"}}
- Setup: `cp .env.example .env` and fill in values

## Error handling

- Exit 0 = success, exit 1 = error, exit 2 = usage error
- With `--json`: errors are JSON on stderr: `{ "error": "CODE", "message": "...", "suggestion": "..." }`
- Without `--json`: errors are human-readable on stderr
```

---

## Collision Handling Rules

1. **Never overwrite existing files** without explicit user confirmation.
2. **Default action on collision:** Leave existing file, note the conflict in chat.
3. **`.gitignore` exception:** Offer to merge missing lines into the existing file.
4. **`AGENTS.md` exception:** If existing, offer to append the CLI conventions section.
5. **`CLAUDE.md` exception:** If existing, offer to append the behavioral snippet.

## Existing CLI Path

When adding a command to an existing CLI (probe detected `bin` field):

- **Skip scaffold entirely** — the project structure exists.
- **Still generate CLAUDE.md snippet** — append the new command's behavioral guidance.
- **Still generate AGENTS.md update** — append new canonical commands if not already present.
- Focus the goal trio on the new command, referencing existing infrastructure.
