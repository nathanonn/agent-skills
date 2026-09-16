# REST physics — the rules that are not negotiable

These are not hygiene. Each one names a specific way a hand-rolled request against WordPress goes
wrong, and each was learned by breaking something. Read this once per session before the first
write.

| # | Rule | Why it exists | What to do |
|---|---|---|---|
| 1 | **Both JSON headers on every request, GETs included** | `wp_is_json_request()` is what keeps the JSON path answering when the HTML frontend is down. It is half of the escape hatch on a fatal site. | `-H 'Content-Type: application/json' -H 'Accept: application/json'` on every single call, read or write |
| 2 | **PUT/POST to the id route; POST to the collection only when there is no existing record** | A colliding slug does **not** 409. WordPress appends `-2` and answers **201**, so a create-first script reads as a clean success while quietly making a duplicate nobody asked for. Requesting an existing page's slug returns **201** with that slug plus `-2`. | Slug lookup first. One hit → the id route. Zero hits → the collection. More than one hit → **hard abort**, the upsert is ambiguous |
| 3 | **Read back the slug the site returned** | The `-2` case, seen from the other side. The response is the only place that tells you what you actually created. | Compare the response `slug` against the one you sent. Different ⇒ say so, loudly, before doing anything else |
| 4 | **Omit `status` unless you intend to change it** | A default `status: "draft"` sent on every write silently demoted live pages, while every verification rung reported green. This is a known critical failure mode. | Existing page, no request to change status ⇒ **no `status` key in the body at all**. New page, no request ⇒ `"draft"`. Asked for a value ⇒ that value |
| 5 | **Never `curl -L` on a write** | An authenticated same-origin 3xx **replays the request body**. A POST was observed being sent twice, and up to six times against a full redirect budget. | No `-L`, `--location` or `--post301/302/303` on any POST, PUT or DELETE. `curl` does not follow redirects by default, so the safe thing is to not ask |
| 6 | **Encode path segments individually, keep the separator slash raw in every composite id** | Template ids look like `twentytwentyfive//header`. `encodeURIComponent` turns the separator into `%2F%2F`, and that fails in **two different layers depending on the host**. A typical Apache default of `AllowEncodedSlashes Off` rejects it with an HTML 404 **before WordPress is reached**. On hosts whose edge lets it through, WordPress itself still fails: route regexes such as the plugins route's `(?P<plugin>[^.\/]+(?:\/[^.\/]+)?)` match the *undecoded* path, so `%2F` is three ordinary characters — the whole string matches the one-segment alternative and core looks up an object literally named `plugin-dir%2Fplugin-file`, returning a JSON 404. Telling the two apart from the body: `reference/troubleshooting.md` | Encode each segment, join with a **literal `/`** — for template ids, plugin ids, and any other id that carries a separator. Never conclude from one host passing that the encoded form is safe |
| 7 | **Deep-merge the global-styles record; never replace it** | Every sibling under `settings`, under `settings.layout`, and under `styles` must come from a live GET into the write body. A naive replace destroys the site's entire colors / typography / variations record. | GET the whole record, merge one leaf, PUT it back. And guard the type: an empty PHP array serializes to JSON as `[]`, not `{}` |
| 8 | **One `Authorization` header, one origin, https or loopback only** | The credential goes to exactly the host the user named and nowhere else. Plain `http` to a non-loopback host is refused — the REST index advertising Application Passwords is filterable and the response is rewritable in transit. | `$WP_BASE_URL` and nothing else. Frontend health probes are **unauthenticated** |

---

## Supporting rules

| Rule | Detail |
|---|---|
| **WordPress stores a trailing newline** | Any body ending in a newline — i.e. essentially every text file — reads back one byte longer than it was sent. Strip trailing newlines from **both** sides before comparing, or every clean push reports as drifted |
| **WordPress rewrites some of what you send** | `wp:template-part` blocks get a `theme` attribute appended when they lack one, so the stored body is not the sent body. Keep the sent and stored forms as separate values; do not assume equality is the only success |
| **`--data-binary`, not `-d`** | `curl -d @file` strips newlines and carriage returns out of the file. `--data-binary @file` sends the bytes as they are |
| **Never retry a write** | On a timeout the client cannot tell whether the bytes were processed before the socket died. Retry GET / HEAD / OPTIONS once; never a POST, PUT or DELETE |
| **A stale keep-alive socket kills the next request** | Some servers default to a 5-second keep-alive timeout. A blocking gap longer than that makes the next request fail at the transport layer, before any HTTP status exists. If a request dies right after a long pause, retry the **read** once |
| **Never assume an error body is JSON** | During a top-level fatal every route returns 500 HTML. A body containing `Fatal error` or `Uncaught` means the site is down, not that your request was malformed. A 2xx whose body is not JSON is also a failure |
| **Branch on a value, never on a missing key** | Look for the value you expect (`code == "rest_post_invalid_id"`, `is_block_theme == true`), not for whether a key is present |
| **Always GET before deciding to skip a write** | The remote record authorizes a skip. Never a memory of what the last request did. It costs one request and it removes a whole class of phantom state |
| **Warn, never silently transform** | The markup arrived reviewed and the operator approved it. Transmit it unchanged and complain loudly if something looks wrong. A silent fix breaks the contract that makes that approval mean anything |

---

## Credential hygiene

The rules are in **the skill's §2** and they govern every request in this file. They hold for any
agent driving `curl` with an Application Password, with or without tooling.

Two things that are easy to talk yourself out of: the **username is not protected** by any of it —
the site URL and username pair sits in the transcript in the clear whatever else you do, so say so
once rather than glossing it — and a credential-masking plugin **changes none of the rules**. What
such a plugin adds, what it refuses, and what it still cannot protect: `reference/integrations.md`.
