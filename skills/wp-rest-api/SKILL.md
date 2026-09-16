---
name: wp-rest-api
description: "Push generated block markup, CSS and JS animation into a WordPress site over the core REST API, authenticated with an admin Application Password — no MCP server, no CLI, no SSH, curl only. Use when the user wants to push block markup to a WordPress page, send generated CSS to a WordPress site, ship an AI-designed page or landing page to WordPress over REST, add a GSAP or scroll animation to a WordPress site, run a PHP or JS snippet on a WordPress site over REST, install or activate a WordPress plugin over REST, set the static front page, update a page without copy-pasting into the block editor, or read and write the user global-styles record. Trigger on publish this design to my site, make this my front page, Code Snippets plugin, wp-json, /wp/v2/pages, /wp/v2/plugins, global-styles styles.css, code-snippets/v1, WordPress Application Password."
---

# wp-rest-api

Transmit assets that already exist — block markup, CSS, and animation JS — to a WordPress site
over `/wp-json/`, using `curl` and an admin Application Password. This is the last mile that used
to be a copy-paste into the Code Editor. The markup is generated elsewhere; this skill transmits
bytes unchanged and tells you the truth about what the site did with them.

Everything needs `curl` and `jq` (1.6+), plus `grep` and `diff` for the verification steps. Nothing
else — no MCP server, no CLI, no SSH, no database access.

| Reference | Read it when |
|---|---|
| `reference/endpoints.md` | before any request — exact paths, payload shapes, copy-pasteable curl |
| `reference/safety-rules.md` | once per session, before the first write. The rules that are not negotiable |
| `reference/gutenberg-traps.md` | before pushing markup, and whenever the editor looks wrong while the frontend looks right |
| `reference/code-snippets.md` | only when shipping PHP or JS — the snippet route, end to end |
| `reference/animation.md` | only when the page carries GSAP or any other JS animation |
| `reference/troubleshooting.md` | a 500, a non-JSON body, a socket error, or a plugin that will not activate |
| `reference/integrations.md` | the user mentions a markup validator or a credential-masking plugin, or you are running one |

## 1 · Preflight — three reads before any write

Run all three. Do not skip one because the last session passed.

| # | Request | What you are asking | Stop if |
|---|---|---|---|
| 1 | `GET /wp-json/` (no auth) | does the site answer, is `wp/v2` in `namespaces[]` | non-JSON body, or `wp/v2` absent — pretty permalinks may be off, or a plugin is blocking REST |
| 2 | `GET /wp/v2/users/me?context=edit` (auth) | do the credentials work, is this user an administrator | `401 rest_not_logged_in`, or `capabilities.edit_theme_options` is not true |
| 3 | `GET /wp/v2/themes?status=active` (auth) | is the active theme a **block theme**, and what is the global-styles record id | `is_block_theme` is false — the CSS route in §4 does not exist. Say so and stop, or offer the §5 alternative |

From request 3, record two values and carry them for the whole session:

- `stylesheet` — the active theme slug (e.g. `twentytwentyfive`).
- `_links['wp:user-global-styles'][0].href` — an absolute URL whose last path segment is the
  record id. **Resolve it every time.** Two sites running identical WordPress and theme versions
  returned `/wp/v2/global-styles/4` and `/wp/v2/global-styles/6`. Never hardcode it and never carry
  an id between sites or between runs.

Also take an **unauthenticated `GET /`** and record the HTTP status and body byte count. That is
the before-picture for §6. It costs one request and it catches a catastrophe.

Branch on the JSON `code` field and the HTTP status, never on the `message` prose. WordPress REST
errors are `{code, message, data:{status}}` and `code` is stable across versions.

## 2 · Credentials

HTTP Basic with an admin Application Password, which `curl -u "$WP_USER:$WP_APP_PASSWORD"` builds
for you. Put the value in a gitignored `.env` and reference the variable, so the shell expands it
below the transcript:

```bash
export WP_BASE_URL="https://example.com"
export WP_USER="admin"
TMPDIR="${TMPDIR:-/tmp}"   # every example below writes its scratch files here
# WP_APP_PASSWORD comes from the gitignored .env
```

| Rule | What to do |
|---|---|
| Never echo, `cat` or `print` the literal password | Reference `$WP_APP_PASSWORD`. To prove it is set, print its length |
| The credential goes to exactly **one** origin | `$WP_BASE_URL` and nothing else. Never send the auth header to a host the user did not name |
| `https`, or loopback `http` | Plain `http` to a non-loopback host is refused. The REST index advertising Application Passwords is not evidence — that field is filterable and the response is rewritable in transit |
| Every authenticated request lives inside a single `curl` invocation | A script file that reads the value later, or a one-liner written to disk first, puts the credential somewhere you did not choose |
| Prefer `-u user:pass` over credentials in the URL | Userinfo in a URL lands in logs |
| Spaced or unspaced both work | WordPress prints `abcd EFGH 1234 ijkl MNOP 5678`; the space-stripped 24-character form authenticates too |
| An Application Password **cannot log into wp-admin** | It authenticates REST and XML-RPC only, never the `wp-login.php` form. Any step needing the block editor or Site Editor in a browser needs the **account** password — a separate credential and a separate decision. Ask; do not assume |

The **username is not protected** by any of this. The site URL and username sit in the transcript
in the clear. Say that once, plainly, rather than glossing it.

## 3 · Push the block markup

This skill transmits bytes unchanged. Do not "fix" markup on the way through, and do not validate
by eye — if the markup is questionable, report what looks wrong and hand it back.

| Step | Request | The rule |
|---|---|---|
| 1 | `GET /wp/v2/pages?slug=<slug>&status=any&context=edit&per_page=100&_fields=id,slug,status,link,content,template` | `context=edit` is what makes drafts visible; `status=any` is what surfaces a trashed duplicate. **More than one match is a hard abort** — the upsert is ambiguous. Say so and stop |
| 2a | one hit → `PUT /wp/v2/pages/<id>` | address the **id route**. It accepts both `PUT` and `POST`; the route is the rule, not the verb |
| 2b | zero hits → `POST /wp/v2/pages` | the collection route, and only here |
| 3 | read the response `slug` | A colliding slug does **not** 409. WordPress appends `-2` and answers **201**, so a create-first script reads as clean success while quietly making a duplicate nobody asked for. The slug you send is a request; the slug you get back is the fact |
| 4 | `GET /wp/v2/pages/<id>?context=edit&_fields=content.raw` | compare byte for byte. WordPress stores a **trailing newline**; strip trailing newlines from both sides before comparing, or every clean push reports as drifted |

Body shape — nothing else unless the user asked for it:

```json
{ "title": "My Page", "slug": "my-page", "content": "<block markup, byte for byte>" }
```

**Set `template` explicitly for a landing page.** Leaving `template` as `""` resolves to the
theme's default page template, which on most block themes renders the **site header and an `<h1>`
of the page title above the design** — so a landing page's own brand bar shows up third, under two
things the user did not ask for.

| Step | What to do |
|---|---|
| Before pushing | `GET /wp/v2/templates` and read the real `slug` values. Do not assume a slug exists |
| For a full-bleed landing page | `"template": "page-no-title"` if the theme offers it |
| Say out loud | `page-no-title` drops the **title only**. The theme header still renders. A genuinely bare page needs a custom template, which this skill does not do |

**`status` decision table.** A default `status: "draft"` sent on every write silently demotes live
pages while every verification step reports green. This is a known critical failure mode.

| Situation | What the body carries | Result |
|---|---|---|
| Page exists, user did not ask to change status | **no `status` key at all** | unchanged |
| Page does not exist, user did not ask | `"status": "draft"` | draft — a new page is never published by accident |
| User asked for a specific status | that value | that value |

Build the body by JSON-encoding the file rather than pasting markup into a shell string, and send it
with `--data-binary @file`, never `-d @file` — `-d` strips newlines out of a file argument. The
commands are in `reference/endpoints.md`.

## 4 · Push the CSS

On a **block theme**, CSS goes in `styles.css` on the user global-styles record. That is the whole
route, and preflight step 3 already told you whether it exists. On a classic theme there is no such
record: say so and stop, or — if the user asks for that instead — ship the CSS as a PHP snippet that
enqueues a stylesheet (§5, `reference/code-snippets.md`), and never a `*-css` scope, which is
Pro-only and silently never runs.

Never smuggle a `<style>` block into the markup as raw HTML. A `core/html` block carrying CSS or JS
is non-portable, depends on the author's `unfiltered_html` capability, and cannot be called
validated markup.

The write is three steps, because the id is not guessable and the record must be merged:

| Step | Request | Notes |
|---|---|---|
| 1 | `GET /wp/v2/themes?status=active` | take `_links['wp:user-global-styles'][0].href` |
| 2 | `GET <that href>` | you need the **whole live record** before you write |
| 3 | `PUT /wp/v2/global-styles/<id>` | body carries `settings` and `styles`, deep-merged |

**Deep-merge, never replace.** This is the single most dangerous operation in the skill. Every
sibling under `settings`, under `settings.layout`, and under `styles` must be read from the live
GET and written back untouched. A naive replace destroys the site's entire colors, typography and
variations record. The commands, including the `[]` type guard the merge needs, are in
`reference/endpoints.md`.

### Strip every `<` from the CSS before you push it

A single `<` anywhere in the CSS body — **including inside a comment** — makes Site Editor → Styles
→ Additional CSS reject the whole value with "The custom CSS is invalid. Do not use `<>` markup."

Nothing else complains:

| Surface | With a `<` in the CSS |
|---|---|
| `PUT /wp/v2/global-styles/<id>` | **200**, stored byte-exact |
| Frontend | renders correctly |
| Editor canvas | renders correctly |
| Site Editor → Additional CSS | **red "invalid" error, whole sheet rejected** |

So the push looks green, the page looks right, and the human who later opens Styles finds their
stylesheet condemned. One `<` anywhere, including inside a comment, is enough.

| Rule | What to do |
|---|---|
| Scan the CSS before every push | `grep -c '<' file.css` must be `0`. Comments count |
| Never write a tag name in a CSS comment | Say "style tag", not the bracketed form |
| `>` child combinators are **fine** | The trigger is the left angle bracket only |

Things to tell the user when you take this route:

- It is **site-wide**, not page-scoped. Prefix every selector with a page class so it cannot leak.
- It is **per theme**. A theme switch leaves it behind.
- `GET /wp/v2/global-styles/<id>/revisions` is the durable manual undo. Name it before writing.
- Replacing `styles.css` wholesale means a second page's CSS overwrites the first. A marker-comment
  convention (`/* --- page:foo --- */ … /* --- /page:foo --- */`) around each page's section would
  make sections individually replaceable — **a proposal, not a tested convention.** Say so.
- Multi-line stylesheets survive the round trip byte-for-byte and do reach the editor canvas, and
  there is no practical length ceiling (tested well past any realistic stylesheet size). Size is
  not what will bite you; a single `<` is. Read the record back and compare every time.

## 5 · Push PHP or JS — the snippet route

WordPress core has no REST route that runs your code. The **Code Snippets** plugin adds one
(`code-snippets/v1`), and that is the path for an animation init, a CDN enqueue, a hook or a
filter. Read `reference/code-snippets.md` before the first snippet request, and
`reference/animation.md` as well if the payload is a GSAP or scroll animation.

This route writes **executable code** to the user's site. Three rules that are not optional:

| Rule | Why |
|---|---|
| **Ask before installing the plugin or activating a snippet** | This is not the same consent as "push my page". Installing a plugin and running code are the user's decisions, taken once, out loud |
| **Create inactive, verify, then activate with a `PUT`** | `POST /code-snippets/v1/snippets` with `active:false` → assert `code_error` is null → `PUT /code-snippets/v1/snippets/<id> {"code": …, "active": true}`. Creating active triggers a trial execution whose runtime errors are not caught, and can fatal the request that is saving the snippet. **Never use the `/activate` route** — it skips validation and will happily turn on a snippet with a syntax error |
| **Record the snippet id the moment you have it** | If the snippet breaks the site, `PUT`/`DELETE /code-snippets/v1/snippets/<id>` is the way back in, and it needs the id. Recovery paths are in `reference/troubleshooting.md` |

Capability probe, before anything else: `GET /wp-json/` and look for `code-snippets/v1` in
`namespaces[]`. Absent means the plugin is not installed or not active — ask, do not install
silently. If the user authorises the install, `reference/troubleshooting.md` covers the activation
failure that looks like a plugin bug and is not one.

## 6 · Verify

Four steps. The last one is the only one that actually proves anything.

| # | Check | What it catches |
|---|---|---|
| 1 | `GET /wp/v2/pages/<id>?context=edit&_fields=content.raw` | a read-side rewrite; compare with trailing newlines stripped |
| 2 | `GET /wp/v2/global-styles/<id>` | the CSS round trip, including line breaks |
| 3 | unauthenticated `GET /` | compare status and byte count against the preflight before-picture. Say plainly when something moved |
| 4 | **a human opens the page in the block editor** | everything that matters |

Step 4 is not optional and you cannot do it. A frontend screenshot passes while the editor shows a
recovery prompt, a clamped narrow canvas, or unstyled content — those are exactly the failure modes
in `reference/gutenberg-traps.md`. Report the two URLs and ask for a look:

- frontend: the `link` field from the write response
- editor: `$WP_BASE_URL/wp-admin/post.php?post=<id>&action=edit`

A dry run, a fixture and a clean validator report prove nothing here. A byte-exact read-back and a
green frontend both pass while the editor is broken, which is why step 4 exists.

## 7 · What this does not do — say so and stop

Name the object, name the capability that does not exist here, hand the decision to the human, and
do not improvise a bypass. There is nothing between you and `curl`, which is exactly why this rule
matters more here than in a tool with guardrails of its own.

| They want | What to do |
|---|---|
| CSS on a classic theme | There is no global-styles record. Say so. Offer §5 as an explicit alternative — a PHP snippet that enqueues a stylesheet (`reference/code-snippets.md`), and never a `*-css` scope, which is Pro-only and silently never runs — and let the user choose |
| Edit a template or template part | Not in scope. The routes exist; if you go there anyway, encode each path segment and join with a **literal** `/` — an encoded separator fails at the edge on one class of host and inside WordPress on another. See `reference/safety-rules.md` rule 6 |
| Make this page the static front page | `PUT /wp/v2/settings {"show_on_front":"page","page_on_front":<id>}` exists and is in `reference/endpoints.md`, but it changes what `/` serves and has no clean undo. **Ask first, every time** |
| Upload an image | `POST /wp/v2/media` is the one non-JSON request and is untested from here. Say so before trying |
| Menus, navigation, block patterns | Untested from here. Say so |
| The site is down, every route 500s | Stop writing. `reference/troubleshooting.md` — do not start deleting things to see what happens |

If the user authorises going around this skill, say plainly what is lost for those bytes: the
read-back comparison, the before/after health picture, and the deep-merge guard on the
global-styles record. None of it applies to a hand-rolled request.
