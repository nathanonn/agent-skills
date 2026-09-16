# Optional companions

Both tools on this page are optional. This skill needs `curl` and `jq` and nothing else — neither
tool is a dependency, neither changes a rule elsewhere in the skill, and the absence of both blocks
nothing. Each section below describes a **slot**, not a product: any tool that fills the same slot
serves the same way, and the implementation named against it is one option, never the requirement.
Read a section only when the user mentions such a tool, when you are running one, or
when you need to say precisely what having one buys and what it does not.

| Slot | One implementation | What it is |
|---|---|---|
| A block-markup validator (§1) | `validate-block-markup` | a skill |
| A credential-masking hook plugin (§2) | `wp-credential-guard` | a Claude Code hooks plugin |

Both ship from the same marketplace as this skill:

```bash
/plugin marketplace add nathanonn/agent-skills
/plugin install validate-block-markup@nathanonn-agent-skills
```

`wp-credential-guard` installs differently and that difference matters. It is a **hooks** plugin:
landing it on disk registers nothing, which is the first failure mode in §2. Either name it in
`enabledPlugins` in `settings.json` and restart, or load it directly with
`claude --plugin-dir <repo>/plugins/wp-credential-guard`, then run `/hooks` to confirm.

---

## 1 · A block-markup validator

A separate skill that parses serialized block markup against a snapshot of WordPress's own block
registry and reports errors and warnings — `validate-block-markup` is one such skill, and anything
with the same contract reads the same way. It is a **generation-side gate, not a transmission-side
one**: it judges the bytes before they are pushed, and has no contact with the site that receives
them. Nothing in the skill's §3 changes because a validator ran.

### What it catches

| Fault in the markup | Reported as | How to read the report |
|---|---|---|
| A bare `<div>`, a `<span>`, or loose text as a **direct child** of a container block (`core/group` and its relatives) | `invalid-saved-content`, against the container | **The message does not name the cause.** It names the container, not the offending child. On a `core/group`, look for a bare direct child before anything else — that is trap 5 in `reference/gutenberg-traps.md`, and it is the reason the editor throws a recovery prompt on a page whose frontend is perfect |
| A `core/html` block | a non-portable core block, as an **error** | This is why the `<style>`-block shortcut is unavailable to validated markup. CSS cannot be smuggled in as raw HTML and still be called validated; it goes to the global-styles record — the skill's §4 |

### What it misses

| Trap | Where it lives |
|---|---|
| A root block with no full alignment — renders full-width on the frontend, clamps narrow in the editor | trap 1 |
| `width: 100%` on a full-aligned root where `width: auto` is required — off by exactly one root padding, invisible in a screenshot | trap 2 |
| A fix keyed to a pixel constant — correct on the machine it was written on, wrong on the next theme | trap 3 |
| A destination template carrying no post-content block — the alignment class is stripped from the wrapper no matter how right the markup is | trap 4 |

One reason covers all four: **a validator sees the markup, not the destination site.** Every trap
that is a property of the theme, the template or the stylesheet is outside what it can see. The
first of these is the most consequential Gutenberg rule there is, and clean markup passes it
silently.

### The version snapshot

The validator checks against a **pinned WordPress version**, which may be behind the site under
test. "Valid" therefore means valid against that snapshot, not against the site receiving the bytes.

| Rule | What to do |
|---|---|
| Never report a clean validation bare | Say which WordPress version it validated against, alongside the version the target site reports |
| Never let a version match stand in for the editor check | A newer core can accept markup the snapshot rejects, and vice versa. Neither direction is proof |

### Without a validator

Unchanged from the skill's §3: transmit bytes unchanged, never "fix" markup in transit, and hand
questionable markup back with what looks wrong **named**. What you lose is the container-block catch
and the `core/html` catch — both of which you can look for by eye, and neither of which you may fix
silently.

| Statement | Status |
|---|---|
| A clean validation permits skipping the human editor check in the skill's §6 | **False.** Step 4 is not optional and a validator cannot perform it |
| No validation at all blocks the push | **False.** Say the markup was not validated, and push |

---

## 2 · A credential-masking hook plugin

A Claude Code function-hooks plugin — `wp-credential-guard` is one — that swaps a literal
Application Password for a session-scoped placeholder on the way **into** the transcript, and swaps the placeholder back for the literal value
on the way **into a Bash tool call**. Net effect: the user may paste the real password into the
conversation, the literal value never lands in the transcript or the session file, and `curl` still
receives the real bytes.

### How the workflow changes

| | Without the plugin | With the plugin |
|---|---|---|
| Where the password lives | a gitignored `.env`, exported into the shell | pasted directly into the conversation |
| What the command carries | `$WP_APP_PASSWORD` — the shell expands it below the transcript | a placeholder, written where the real value would go |
| What reaches the transcript | a variable name | a placeholder |
| What reaches `curl` | the expanded variable | the substituted literal |

### Operational requirements

Getting any of these wrong looks like the plugin working when it is not.

| Requirement | The failure mode |
|---|---|
| The session must be started with the **plugin directory explicitly loaded** | Dropping the folder into a plugins directory counts the plugin and **registers no hooks**. The failure is silent: the plugin reports as installed while a password comes through verbatim. A well-formed plugin is not a loaded one |
| Every authenticated request lives inside a **single Bash invocation** | The substitution is registered on the Bash tool call only. A value a script file reads later, or a one-liner written to disk first, bypasses it entirely |
| A placeholder from a **previous session** is refused, not guessed | The map dies with the session. A Bash call carrying a placeholder the vault never held is denied before it runs. Ask the user to paste the credential again — never retry with the literal text, never invent a value |
| Write the placeholder **exactly where the real value would go**, with no added escaping | The hook quotes the substitution for the context it lands in. Escaping it yourself double-escapes it on the way to `curl`, and the request fails a 401 with nothing in the output to explain why |

### The two honest gaps

**A credential pasted as a slash-command argument cannot be masked.** The command envelope reaches
the model by a path no hook covers, and what gets stored is the text the user typed, not the text a
hook returned. A plugin of this kind therefore **refuses the whole prompt** rather than half-masking
it. Consequence for this skill: if a credential arrives that way, treat it as **exposed** — say so
plainly and recommend revoking it. The way back in is to paste the credential as an ordinary message
and then use its placeholder in the slash command; a placeholder in a slash command is passed
through untouched.

**The username is not protected.** Only a name something has explicitly labelled as a username gets
masked — a `username:` prefix, a `user =` assignment, the `-u user:pass` pair, URL userinfo. A
distinctive username nothing ever labelled stays in the clear, and a generic account name always
does. **The site URL and username pair is the thing most likely to be sitting in the transcript.**
State that once to the user; do not gloss it.

### Without the plugin

The `.env` route in the skill's §2 is the default and is always available. The plugin removes a class
of accidental disclosure — a value pasted into a conversation landing in a stored transcript. It
removes nothing else, and it changes no rule in the skill's §2, which applies identically either way.
Read that section; it is the guard behaviour, and this page is only the tool description.
