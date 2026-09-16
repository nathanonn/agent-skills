# Endpoints and exact request shapes

Every path below is `/wp-json`-relative. **A route that is not listed here must not be guessed at.**
If you need one, say so and stop.

Placeholders used throughout: `$WP_BASE_URL` (e.g. `https://example.com`), `$WP_USER`,
`$WP_APP_PASSWORD`, `$TMPDIR` (set it — `TMPDIR="${TMPDIR:-/tmp}"`), `$ID`, `$GS_ID`, `$SID`. The
three ids are extracted from responses in the curl set below; never invent one.

Every request carries **both** JSON headers, GETs included:

```
-H 'Content-Type: application/json' -H 'Accept: application/json'
```

---

## Inventory

`admin` = HTTP Basic with an admin Application Password. `none` = no `Authorization` header.

| Method + path | What it does | Auth | Body | Read from the response |
|---|---|---|---|---|
| `GET /` (i.e. `/wp-json/`) | REST index | none | — | `namespaces[]`, `home` |
| `GET /wp/v2/users/me?context=edit` | do the credentials work | admin | — | `id`, `capabilities` |
| `GET /wp/v2/themes?status=active` | active theme + global-styles link | admin | — | `stylesheet`, `is_block_theme`, `_links['wp:user-global-styles'][0].href` |
| `GET /wp/v2/pages?slug=…&status=any&context=edit&per_page=100&_fields=…` | the upsert lookup | admin | — | array; **>1 element is a hard abort** |
| `POST /wp/v2/pages` | create | admin | `{title, slug, content, status?}` | `id`, `slug`, `status`, `link` |
| `PUT` or `POST /wp/v2/pages/$ID` | update (the id route accepts both verbs) | admin | same shape | same |
| `GET /wp/v2/pages/$ID?context=edit&_fields=content.raw` | byte-diff read-back | admin | — | `content.raw` |
| `GET /wp/v2/global-styles/$GS_ID` | the user global-styles record | admin | — | `settings`, `styles` |
| `PUT /wp/v2/global-styles/$GS_ID` | write it, **deep-merged** | admin | `{settings:{…}, styles:{…, css:"…"}}` | `settings`, `styles` |
| `GET /wp/v2/global-styles/$GS_ID/revisions` | the durable manual undo | admin | — | revision list |
| `GET /wp/v2/global-styles/themes/{stylesheet}` | theme defaults, read-only | admin | — | `settings.*` |
| `GET /wp/v2/settings?_fields=show_on_front,page_on_front` | is this page the front page | admin | — | `show_on_front`, `page_on_front` |
| `PUT /wp/v2/settings` | set/clear the static front page — **ask first** | admin | `{"show_on_front":"page","page_on_front":$ID}` | echoes what was written |
| `GET /wp/v2/templates/lookup?slug=…&_fields=id,slug,type,source,content.raw` | resolve a page's block template | admin | — | trust only an **exact** `slug` match |
| `GET /wp/v2/templates` · `GET /wp/v2/template-parts` | inventory | admin | — | `id`, `slug`, `source` |
| `GET <home>` | frontend health probe | **none** | — | status code + body bytes |
| `GET /` → is `code-snippets/v1` in `namespaces[]` | is the snippet plugin installed **and** active | none | — | absent ⇒ ask before installing anything |
| `GET /wp/v2/plugins` | what is installed and what is active | admin | — | `plugin` (the `<dir>/<file>` id), `status`. **Re-read this before retrying any install** |
| `POST /wp/v2/plugins` | install from the plugin directory — **ask the user first** | admin | `{"slug":"…"}` | `plugin`, `status: inactive`. Take the `plugin` id from here; never construct it |
| `PUT /wp/v2/plugins/<plugin id>` | activate — **ask the user first** | admin | `{"status":"active"}` | a 500 here is usually the site's stored plugin option, not the plugin: `reference/troubleshooting.md`. Join the id's segments with a **literal** `/`, never `%2F` |
| `GET /code-snippets/v1/snippets/schema` | the snippet item schema | **none** | — | 13 properties; a 401 here means something in front of WordPress is blocking REST |
| `POST /code-snippets/v1/snippets` | create a snippet — **always `"active": false`** | admin | `{name, scope, code, active:false, priority}` | `id`, `active`, `code_error`. Safe write sequence and full schema: `reference/code-snippets.md` |
| `GET /code-snippets/v1/snippets/$SID` | read one | admin | — | `active`, `code_error`. See `reference/code-snippets.md` |
| `PUT /code-snippets/v1/snippets/$SID` | update, and the **only** way to activate — merges, never replaces | admin | `{code?, active?}`; activate with `{code, active:true}` | `active` coming back `false` is a refusal. **Never `…/$SID/activate`** — it skips validation. See `reference/code-snippets.md` |
| `DELETE /code-snippets/v1/snippets/$SID` | **trash**, not purge. 204, empty body | admin | — | nothing; re-`GET` the list. See `reference/code-snippets.md` |

Posts work identically to pages — swap `/wp/v2/pages` for `/wp/v2/posts`. Read-side rewrites have
been seen on posts but not pages, so the read-back comparison in the skill's §6 matters more there.

Not in scope and not tested from this skill: `/wp/v2/media`, `/wp/v2/navigation`, `/wp/v2/menus`,
`/wp/v2/block-patterns`.

---

## Minimum viable curl set

### (a) Preflight

```bash
# 1. Does the site answer? (no auth)
curl -sS "$WP_BASE_URL/wp-json/" \
  -H 'Content-Type: application/json' -H 'Accept: application/json'

# 2. Do the credentials work, and is this an administrator?
curl -sS "$WP_BASE_URL/wp-json/wp/v2/users/me?context=edit" \
  -u "$WP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' -H 'Accept: application/json'

# 3. Block theme? And what is the global-styles record id?
curl -sS "$WP_BASE_URL/wp-json/wp/v2/themes?status=active" \
  -u "$WP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' > "$TMPDIR/theme.json"
jq '.[0] | {is_block_theme, stylesheet}' "$TMPDIR/theme.json"
# $GS_ID is the LAST PATH SEGMENT of the href — resolve it every run, never hardcode it.
GS_ID=$(jq -r '.[0]._links["wp:user-global-styles"][0].href | split("/") | last' "$TMPDIR/theme.json")

# 4. Before-picture of the frontend (NO auth, never -L on this either)
curl -sS -o "$TMPDIR/before.html" -w '%{http_code} %{size_download}\n' "$WP_BASE_URL/"
```

### (b) Push block markup to a page

```bash
# 1. Slug lookup. >1 result ⇒ STOP, the upsert is ambiguous.
curl -sS "$WP_BASE_URL/wp-json/wp/v2/pages?slug=my-page&status=any&context=edit&per_page=100&_fields=id,slug,status,link,content,template" \
  -u "$WP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' > "$TMPDIR/lookup.json"
jq 'length' "$TMPDIR/lookup.json"                      # >1 ⇒ hard abort
ID=$(jq -r '.[0].id // empty' "$TMPDIR/lookup.json")   # empty ⇒ zero hits, create at 3b

# 2. Build the body. --rawfile needs jq >= 1.6.
#    Add  --arg status draft  and  status:$status  ONLY when creating,
#    or when the user asked to change the status.
jq -n --rawfile content ./page.html --arg title "My Page" --arg slug "my-page" \
  '{title:$title, slug:$slug, content:$content}' > "$TMPDIR/body.json"

# 3a. One hit → the id route.
curl -sS -X PUT "$WP_BASE_URL/wp-json/wp/v2/pages/$ID" \
  -u "$WP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data-binary @"$TMPDIR/body.json"

# 3b. Zero hits → the collection route.
curl -sS -X POST "$WP_BASE_URL/wp-json/wp/v2/pages" \
  -u "$WP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data-binary @"$TMPDIR/body.json" > "$TMPDIR/created.json"
ID=$(jq -r '.id' "$TMPDIR/created.json")
jq -r '.slug' "$TMPDIR/created.json"
# → the slug you sent is a request; this one is the fact. A collision does not
#   409; WordPress appends -2 and answers 201.

# 4. Read back and compare, trailing newlines stripped from both sides.
curl -sS "$WP_BASE_URL/wp-json/wp/v2/pages/$ID?context=edit&_fields=content.raw" \
  -u "$WP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  | jq -r '.content.raw | sub("\n+$";"")' > "$TMPDIR/readback.html"
diff <(jq -Rrs 'sub("\n+$";"")' ./page.html) "$TMPDIR/readback.html"
```

### (c) Push CSS to the user global-styles record

```bash
# 0. MANDATORY GATE. A single '<' anywhere — comments included — makes
#    Site Editor → Additional CSS reject the whole sheet, silently.
if [ "$(grep -c '<' ./page.css)" != "0" ]; then
  echo "CSS contains '<' — do not push" >&2; exit 1
fi

# 1. Read the live record whole.
curl -sS "$WP_BASE_URL/wp-json/wp/v2/global-styles/$GS_ID" \
  -u "$WP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' > "$TMPDIR/gs.json"

# 2. Deep-merge. The type guard is not paranoia: an empty PHP array
#    serializes to JSON as [] , not {} , and a naive merge then fails.
jq --rawfile css ./page.css '
  { settings: (if (.settings|type) == "object" then .settings else {} end),
    styles:   (if (.styles|type)   == "object" then .styles   else {} end) }
  | .styles.css = $css
' "$TMPDIR/gs.json" > "$TMPDIR/gs-body.json"

# 3. Write. PUT is the verb used here; POST is also accepted.
curl -sS -X PUT "$WP_BASE_URL/wp-json/wp/v2/global-styles/$GS_ID" \
  -u "$WP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data-binary @"$TMPDIR/gs-body.json"

# 4. Read it back and compare, line breaks included. Multi-line CSS survives
#    byte-for-byte and there is no practical length ceiling; the comparison is
#    how you catch a stylesheet that was stored and then rejected.
curl -sS "$WP_BASE_URL/wp-json/wp/v2/global-styles/$GS_ID" \
  -u "$WP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  | jq -r '.styles.css | sub("\n+$";"")' > "$TMPDIR/css-readback.css"
diff <(jq -Rrs 'sub("\n+$";"")' ./page.css) "$TMPDIR/css-readback.css"
```

### (d) Optional — static front page (ask the human first)

```bash
curl -sS "$WP_BASE_URL/wp-json/wp/v2/settings?_fields=show_on_front,page_on_front" \
  -u "$WP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' -H 'Accept: application/json'

# $ID is REQUIRED here. An unset $ID would send malformed JSON to a write that
# changes what / serves and has no clean undo — so refuse before building a body.
[ -n "$ID" ] || { echo "ID is unset — refusing to write settings" >&2; exit 1; }
jq -n --argjson id "$ID" \
  '{show_on_front:"page", page_on_front:$id}' > "$TMPDIR/settings.json"
curl -sS -X PUT "$WP_BASE_URL/wp-json/wp/v2/settings" \
  -u "$WP_USER:$WP_APP_PASSWORD" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  --data-binary @"$TMPDIR/settings.json"
```

Setting the static front page changes the home page byte count **substantially** — any before/after
size comparison will fire. That is expected, not a fault.

---

## Reading errors

Error codes, non-JSON bodies, timeouts, retry policy and socket failures: `reference/troubleshooting.md`.
