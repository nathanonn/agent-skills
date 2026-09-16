# Code Snippets — the `code-snippets/v1` route, end to end

Paths are `/wp-json`-relative. Placeholders: `$WP_BASE_URL`, `$WP_USER`, `$WP_APP_PASSWORD`,
`$TMPDIR` (set it — `TMPDIR="${TMPDIR:-/tmp}"`), `$SID` (extracted from the create response below).
Every request here carries **both** JSON headers, `GET` and `DELETE` included:
`-H 'Content-Type: application/json' -H 'Accept: application/json'`. That is not politeness — the
headers are half of the mechanism that gets you back into a site this route has bricked
(see **Recovery**). A request without them has no way home.

## Capability probe — two reads, neither needs credentials

| Request | What you learn | Stop if |
|---|---|---|
| `GET /` (the REST index) | `code-snippets/v1` in `namespaces[]` ⇒ plugin installed **and** active. Registration is unconditional in the plugin constructor — no settings flag, no screen guard | absent — ask before installing anything |
| `GET /code-snippets/v1/snippets/schema` | the full 13-property item schema; its shape dates the controller | 401 — something in front of WordPress is blocking REST. This route's permission callback is `__return_true` |

Everything else in the namespace is 401 `rest_forbidden` unauthenticated.

**Version floor:** no controller below **3.4.0**; `page`/`per_page` need **3.9.0**. `search` is
accepted on the collection route and **never applied** — fetch everything and filter client-side.

## Route inventory

`admin` = HTTP Basic with an admin Application Password. Importer routes (`/importers`,
`/file-upload/*`, per-plugin migrations) share the namespace and are out of scope.

| Method + path | What it does | Auth |
|---|---|---|
| `GET /code-snippets/v1/snippets` | list all; `X-WP-Total` headers; params `context`, `page`, `per_page`, `network` | admin |
| `POST /code-snippets/v1/snippets` | create — returns **200, not 201**, no `Location` header | admin |
| `GET …/snippets/$SID` | read one | admin |
| `PUT` · `POST` · `PATCH` `…/snippets/$SID` | update. **Merges, does not replace** — omitted fields keep their stored values; all three verbs behave identically | admin |
| `DELETE …/snippets/$SID` | **trash**, not purge. 204, empty body | admin |
| `POST` · `PUT` · `PATCH` `…/snippets/$SID/activate` | **do not use** — skips validation, see below | admin |
| `POST` · `PUT` · `PATCH` `…/snippets/$SID/deactivate` | do not use as a rescue — see **Recovery** | admin |
| `GET …/snippets/$SID/export` · `…/export-code` | JSON export object · the raw code as a `<?php` file | admin |
| `GET …/snippets/schema` | public item schema | **none** |

**Activate with `PUT /snippets/$SID {"code": …, "active": true}`, never `/snippets/$SID/activate`.**
The write path runs the validator and fails safe; `/activate` **skips validation entirely** — pointed
at a snippet with a syntax error it returns `200`, `active:true`, `code_error:null`. It also answers
`{}`, so it teaches you nothing and forces a re-`GET`. The `PUT` returns a validated write, a full
snippet body, and an id-addressed route that still answers when the site is down.

**Re-send `code` alongside `active: true`.** The validated write path is what runs the validator, so
re-sending the code is what guarantees the validator ran against the code you are activating.

## Item schema — 13 fields

| Field | Type | Notes |
|---|---|---|
| `id` | integer | readonly |
| `name` | string | the title |
| `desc` | string | alias `description` accepted on write |
| `code` | string | PHP **without** `<?php` / `?>` wrappers — the server strips them on save |
| `tags` | string[] | round-trips cleanly; the only reliable reconciliation key |
| `scope` | string | a bare string with **no enum** — any value is accepted. Default `global` |
| `condition_id` | integer | Pro conditions; alias `conditionId`; default 0 |
| `active` | boolean | default false |
| `priority` | integer | default 10; a real evaluation-order control, lower runs first |
| `network` | bool\|null | default null = site-scoped |
| `shared_network` | bool\|null | network snippet activatable per site |
| `modified` | date-time | readonly |
| `code_error` | string | readonly; `[message, line]` when a validated write refuses |

Strip the `<?php` / `?>` wrapper **locally** before uploading. Send it and the server strips it, so
every later diff between your file and the stored `code` reports drift that is not there. `revision`
and `cloud_id` exist on the underlying object but not in the REST schema, so arg validation rejects
them.

## Scopes and types — where the free build silently stops working

Type is derived from scope, never sent: suffix `-css` → css, `-js` → js, ending in `content` → html,
`condition` → cond, anything else → php.

| `scope` | Type | Free build | Runtime |
|---|---|---|---|
| `global` | php | yes | every request, at `plugins_loaded` priority 1 |
| `admin` | php | yes | `is_admin()` only |
| `front-end` | php | yes | non-admin requests only |
| `single-use` | php | yes | runs once, then quick-deactivates **before** execution |
| `content` | html | yes | via shortcode only |
| `head-content` · `footer-content` | html | yes | printed verbatim in `<head>` / the footer |
| `admin-css` · `site-css` | css | **Pro only** | free ships no CSS evaluator |
| `site-head-js` · `site-footer-js` | js | **Pro only** | free ships no JS evaluator |
| `condition` | cond | **Pro only** | — |

> **A css- or js-scoped snippet on a free site is stored and never executed. Nothing reports this.**
> `scope` has no enum, so the create returns 200, the activating write returns 200, and the read-back
> shows `active:true, code_error:null` — while the payload has no execution path at all. CSS pushed to
> `site-css` clears every one of those steps and is never printed. The free bootstrap
> registers two handlers (php, html) and two evaluators (the php scopes, and
> `head-content`/`footer-content`); the css and js scopes are labelled in the UI and evaluated by nobody.

**Never ship JS as a `*-js` scoped snippet.** Ship it as a PHP snippet in `front-end` scope that
enqueues it — `wp_enqueue_script` for a CDN URL, `wp_add_inline_script` for an init block, on
`wp_enqueue_scripts`. CSS the same way (`wp_register_style` + `wp_enqueue_style` +
`wp_add_inline_style`), or a `head-content` snippet holding a raw style block when no cascade control
is needed.

**Blast radius.** Prefer `front-end` over `global`, and put every statement inside a hook callback, not
at snippet top level. A fatal in a `wp_footer` callback breaks the front end and leaves the whole REST
surface answering; a top-level fatal in a `global` snippet is evaluated before routing and takes `/`,
`/wp-json/`, `wp-login.php` and `/wp-admin/` with it.

## The never-brick write sequence

| Rung | Call | Why this rung exists |
|---|---|---|
| 1 | `POST /snippets` with **`"active": false`** | buys an id before anything can execute. Record it immediately |
| 2 | keep the **write response** | `code_error` is transient: returned by the write that produced it, never persisted, so a later `GET` shows `null` regardless |
| 3 | assert `code_error` is null **and** `active` came back as asked | a non-null `code_error` is a hard stop. Do not continue, do not retry with `active:true` |
| 4 | `PUT /snippets/$SID {"code": …, "active": true}` | the validated activation. The validator runs and on failure forces `active` to 0 before the row is written |
| 5 | unauthenticated `GET /` and `GET /wp-json/` | the only rung that proves the site survived. Compare status and byte count with the preflight before-picture |

**Never create with `active:true`.** That path triggers a *trial execution* — the plugin `eval`s the
code once inside the save request — and it catches `ParseError` only. A runtime `Throwable` (undefined
function, type error) is **not** caught on the database path, so it fatals the very request that is
saving the snippet: 500, empty body, no reliable knowledge of whether the row was written.

Updating an already-active snippet in place with `PUT` is safe even when the code redeclares its own
functions — the exclusion rule that powers recovery keeps the stored version out of the trial eval for
its own `PUT`. It never needs to become deactivate → update → reactivate, and a stable id keeps the
rescue route stable. A *different* snippet redeclaring the same function is caught and refused.

### `code_error` is not an error response

A **200** carrying `"active": false` and a populated `code_error` is a **failed save wearing a success
status code**. Nothing in the HTTP layer flags it. Read the body every time.

One nuance: `code_error` is populated on the **create** path and comes back `null` from
an activating `PUT` even when that `PUT` refuses. Since the safe sequence always activates with a
`PUT`, the signal that is *always* present is **`active` returning `false` from the write that asked for
`true`**. Check both — `code_error` when present, for the line number; otherwise the `active` mismatch.

## Error encodings

Branch on `code`. Status codes on this namespace are not a reliable discriminator.

| `code` | Status | Means |
|---|---|---|
| `rest_cannot_create` · `rest_cannot_update` · `rest_cannot_delete` | **500** | a logical failure, not a crash. A second `DELETE` on the same id fails this way — deletion is not idempotent |
| `rest_cannot_get` | **500** | the snippet does not exist. Not a 404 |
| `rest_cannot_activate` | 500 on validation failure, **404** for a missing id | inconsistent with `rest_cannot_get` on the same missing id |
| `rest_forbidden` | 401 / 403 | permission. The callbacks return bare booleans, so you get core's generic error with no plugin detail |
| HTML body containing `Fatal error` or `Uncaught` | 500 | the site itself is down. Go to **Recovery** |

**`DELETE` is a trash, not a purge.** 204, no body, row flagged trashed — it stays in `GET /snippets`
reading `active:false`, indistinguishable over REST from a merely inactive snippet, and there is no
purge route. Tag your snippets, reconcile by tag, and track deletions locally.

## Recovery — a bricked site

Record the snippet id **the moment the create returns it**, before any activation; ids are not
predictable, and a fresh install ships sample snippets occupying the low ones. When a top-level fatal
has taken the whole site to 500, exactly one route still answers — `PUT /snippets/$SID {"active":false}`
or `DELETE /snippets/$SID`, **with both JSON headers**. The mechanism is an exclusion in the plugin's
evaluator: when the request is a JSON request **and** the last path segment of the REST URI parses as a
snippet id, that snippet is skipped for that request. Both halves are load-bearing, which is why every
obvious alternative fails:

| Attempt | Why it fails |
|---|---|
| `/snippets/$SID/deactivate` | the last segment is `deactivate`, which parses to id 0 — no exclusion |
| the same `PUT`/`DELETE` without JSON headers | the JSON-request test fails — no exclusion |
| `PUT /wp/v2/plugins/…` `{"status":"inactive"}` | core's plugin kill switch runs downstream of the fatal |
| `?snippets-safe-mode=1` on any URL | the gate needs an authenticated user at `plugins_loaded`; Application Password auth is established later in the request. **Unverified in general; against a bricked site it returns 500** |
| `wp-login.php`, `/wp-admin/` | also downstream |

**If the id was never recorded**, `GET /snippets/$SID` with JSON headers is a single-id oracle: while the
site is down it returns 500 for every id except the culprit, which returns 200. Walk the range. The
remaining fallback, `define( 'CODE_SNIPPETS_SAFE_MODE', true );` in `wp-config.php`, is a human action
requiring file access — say so plainly and hand it over.

## Capability

| Situation | Required capability |
|---|---|
| Single site | `manage_options` (filterable) |
| Multisite, request carries `network: true` | escalates to `manage_network_options` or super admin |
| Multisite subsite with the snippets menu disabled for subsites | escalates to the network cap even for site-scoped requests |

**Never send `network: true` unless the user asked for a network snippet.** Managing snippets needs
`manage_options`, installing the plugin needs `install_plugins` — both sit on a single-site
Administrator and diverge sharply on multisite.

## Minimum viable curl set

```bash
# 1. Normalise the wrapper locally, then build the body.
jq -Rrs 'sub("^\\s*<\\?php\\s*";"") | sub("\\?>\\s*$";"")' ./snippet.php > "$TMPDIR/snippet.code"
jq -n --rawfile code "$TMPDIR/snippet.code" --arg name "My snippet" --arg scope "front-end" \
  '{name:$name, scope:$scope, code:$code, active:false, priority:10}' > "$TMPDIR/snippet.json"

# 2. Create INACTIVE. Returns 200, not 201. Record the id NOW.
curl -sS -X POST "$WP_BASE_URL/wp-json/code-snippets/v1/snippets" \
  -u "$WP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data-binary @"$TMPDIR/snippet.json" > "$TMPDIR/created.json"
jq '{id, active, code_error}' "$TMPDIR/created.json"
SID=$(jq -r '.id' "$TMPDIR/created.json")

# 3. A non-null code_error is a HARD STOP. Not a comment — a gate.
if [ "$(jq -r 'if .code_error == null then "ok" else "fail" end' "$TMPDIR/created.json")" != "ok" ]; then
  echo "code_error on create (snippet $SID) — do not activate, do not retry" >&2
  exit 1
fi

# 4. Activate with the validated write, re-sending `code`.
#    NOT /activate — that route skips validation entirely.
jq -n --rawfile code "$TMPDIR/snippet.code" '{code:$code, active:true}' > "$TMPDIR/activate.json"
curl -sS -X PUT "$WP_BASE_URL/wp-json/code-snippets/v1/snippets/$SID" \
  -u "$WP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data-binary @"$TMPDIR/activate.json" | jq '{id, active, code_error}'
# active:false coming back here is a REFUSAL. Stop; do not retry.

# 5. Prove the site survived (no auth on either).
curl -sS -o /dev/null -w 'home %{http_code} %{size_download}\n' "$WP_BASE_URL/"
curl -sS -o /dev/null -w 'rest %{http_code}\n' "$WP_BASE_URL/wp-json/"

# PANIC BUTTON — works while everything else 500s. The JSON headers are mandatory.
curl -sS -X PUT "$WP_BASE_URL/wp-json/code-snippets/v1/snippets/$SID" \
  -u "$WP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data-binary '{"active":false}'
```
