# Troubleshooting — read the symptom, not the prose

**Branch on the JSON `code` field and the HTTP status. Never on the `message` prose, and never on
whether a key is present.** WordPress REST errors are `{code, message, data:{status}}`; `code` is
stable across versions, the message is not, and the same fault produces different messages on
different hosts. Look for the value you expect (`code == "rest_post_invalid_id"`), not for the
presence of a key.

## Error codes you will actually see

| Signal | What it means | What to do |
|---|---|---|
| `rest_not_logged_in` (401) | credentials missing or wrong | re-run preflight step 2. Do not retry the write |
| `rest_forbidden` / `rest_cannot_edit` (403) | authenticated, not permitted | the user is not an administrator, or a plugin is filtering the capability. Say which, stop |
| `rest_post_invalid_id` (404) | the page id does not exist | you are holding a stale id. Re-run the slug lookup |
| `rest_no_route` on a `/wp/v2/*` path | the URL is wrong, or pretty permalinks are off | check the path against `reference/endpoints.md` before blaming the site |
| a 2xx whose body is not JSON | **a transport failure wearing a success code** | not a success. Do not record the write as done |
| a body containing `Fatal error` or `Uncaught` | the site has a top-level fatal | see **The site is down** below. Stop writing |

## A non-JSON body is not a malformed request

During a top-level fatal, **every** route returns 500 HTML — the one you called, the one you would
have called next, and `/wp-json/` itself. That is the site being down, not your payload being wrong.
Rewriting the body, changing the verb, or dropping a field will not fix it and each attempt is
another write against a broken site.

Never assume an error body is JSON. Parse defensively: a `jq` failure on an error path is itself the
signal.

## `PUT /wp/v2/plugins/<slug>/<file>` returns 500

This is the trap that looks like a plugin bug and is not one.

**The cause.** The site's `active_plugins` option is stored as a **string** instead of an array —
serialized-data corruption. What corrupts it is not observable from here; what matters is that the
site arrives that way and nothing in normal use reveals it. Every
core *read* path casts it (`(array) get_option( 'active_plugins', array() )`), so the site runs
perfectly. Only the *write* path, `activate_plugin()` in `wp-admin/includes/plugin.php`, indexes
into it raw, and under PHP 8 that is a fatal `TypeError` rather than a warning.

| Fact | Consequence for you |
|---|---|
| **Not plugin-specific, not version-specific** | Not plugin-specific, not theme-specific, and not confined to one host. A two-file plugin that does nothing fatals identically. Do not go looking for a compatible plugin version |
| **Do not diagnose from the response body** | One host returned the full `TypeError` with a stack; another returned only `<p>There has been a critical error on this website.</p>` for the identical fault. What comes back depends on whether debug output is on. **Diagnose from which operation fails:** install succeeds, every read succeeds, activation specifically fails |
| **The install already succeeded** | A 500 from `POST /wp/v2/plugins {"slug":…,"status":"active"}` returns `plugin: null` and **still installed the plugin**. Install and activate are two operations behind one endpoint and the second failing does not roll back the first. **Re-`GET` the plugin list before retrying anything** — retrying the install is the wrong move and leaves duplicates of nothing but noise |
| **The frontend is unaffected** | `GET /` stays 200 with an unchanged body across the fatals. A green health probe does not clear this |

**The repair is `validate_active_plugins()`**, which resets the option when it is not an array. Its
only caller in core is the wp-admin plugins screen. The REST plugins controller never calls it. So:

> Loading `/wp-admin/plugins.php` once in a logged-in browser repairs the site. **No sequence of
> REST calls can.** After that page load, the identical REST activation returns 200 on the first try.

**An Application Password cannot log into wp-admin, so this repair is a human action.** Say that in
those words, hand over the URL, and stop. Do not loop on the 500, do not try `POST` instead of
`PUT`, do not try a different plugin, do not start deleting things.

If the plugin in question is Code Snippets, note that this failure is *upstream* of that route
entirely — nothing in `reference/code-snippets.md` applies until the plugin is active.

## A 404 on a composite id — two layers, one mistake

Composite ids carry a separator: `theme//template-part`, `plugin-dir/plugin-file`. Percent-encoding
that separator fails in **two different places depending on the host**, and gives you two different
status codes for the same mistake.

| Symptom | Layer | What happened |
|---|---|---|
| **HTML 404**, no JSON, no `code` field | the web server, before WordPress is reached | the default `AllowEncodedSlashes Off` on one class of host rejects `%2F` in a path outright |
| **JSON 404** with `rest_plugin_not_found` / `rest_..._not_found` | inside WordPress | the route regex matches the **undecoded** path, where `%2F` is three ordinary characters. The whole string matches the one-segment alternative and core looks up an object literally named `plugin-dir%2Fplugin-file` |

Tell them apart by the body: HTML means you never reached WordPress; JSON with a `code` means you
did and it looked up the wrong name. Either way the fix is the same and it is in
`reference/safety-rules.md` rule 6. Do not conclude from one host passing that the encoded form is
safe — the same host can accept it on one route and reject it on another.

## A socket error immediately after a long pause

A stale keep-alive connection. Some servers default to a 5-second keep-alive timeout; a blocking gap
longer than that — a long build, a human answering a question, a slow local step — makes the **next**
request fail at the transport layer, before any HTTP status exists.

| What to do | What not to do |
|---|---|
| Retry the **read** once | Never retry a write. Never conclude the site is down from one socket error |
| Take an unauthenticated `GET /` if you want to know the site's state | Do not escalate to deleting or re-pushing |

The tell is the timing: it fails instantly, there is no status code, and the request before it
succeeded.

## Timeouts

30 s is a reasonable default. On a timeout **the client cannot tell whether the bytes were processed
before the socket died.**

| Method | On timeout |
|---|---|
| `GET` · `HEAD` · `OPTIONS` | retry once |
| `POST` · `PUT` · `DELETE` | **never retry.** Re-read the record and find out what actually happened, then decide |

## Duplicate records you did not create

Symptom of a write that was sent with `-L`. An authenticated same-origin 3xx **replays the request
body**, so the write may have happened more than once — a `POST` has been observed sent twice, and
up to six times against a full redirect budget.

Re-read state before doing anything else: list by slug with `status=any&context=edit` and see how
many records exist. Then report the duplicates rather than silently cleaning them up. The rule that
prevents this is `reference/safety-rules.md` rule 5.

## The site is down — a decision procedure, not a fix

Every route 500s, or bodies carry `Fatal error` / `Uncaught`.

| # | Do this | Why |
|---|---|---|
| 1 | **Stop writing. Immediately.** | Every further write is against a broken site and adds state you will have to reason about afterwards |
| 2 | Unauthenticated `GET /` — status and body byte count | compare with the before-picture taken in preflight. That is what the before-picture is for |
| 3 | `GET /wp-json/` with both JSON headers | if it still answers JSON, the fatal is in the frontend path only and the REST surface is intact |
| 4 | If a snippet was the last thing written | `reference/code-snippets.md` → **Recovery**. That route has its own way back in and it is the only one |
| 5 | Otherwise: **report and hand over** | name what was written, in what order, with ids. The human has wp-admin, file access and a backup; you have neither |

**Never start deleting things to see what happens.** Deletion is not diagnosis, it is not
idempotent, and on several routes it trashes rather than purges — so the state afterwards is worse
than the state before and harder to describe.

## Failures this skill cannot see

Say these out loud rather than reporting a clean run over them.

| Blind spot | What it means |
|---|---|
| **The editor canvas and the Site Editor** | Both need a browser login. An Application Password authenticates REST and XML-RPC only — it cannot sign into wp-admin. A byte-exact read-back and a correct frontend both pass while the editor shows a recovery prompt, a clamped canvas, or a rejected stylesheet |
| **A security plugin in front of `/wp-json/`** | Changes everything above: routes disappear, 401s appear where credentials are fine, and error bodies stop being WordPress's. If preflight step 1 is odd, suspect this first |
| **Multisite** | Untested. Capability requirements escalate and `network` scoping enters every decision |
| **Classic themes** | Untested. The global-styles route does not exist there at all |
| **Media uploads** | `/wp/v2/media` is the one non-JSON request and nothing here has exercised it |

There is no test suite behind any of this. A dry run, a fixture and a green validator report prove
nothing — every defect worth knowing about was found by a cold run against a real site, and most of
them shipped green first.
