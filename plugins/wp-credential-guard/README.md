# WP Credential Guard

**Keeps a WordPress username and Application Password out of the model's context while still letting `curl` receive the real bytes.**

You paste a credential into the conversation because the work needs it. The model reads a placeholder instead. When the model writes a Bash command using that placeholder, the shell gets the real value back.

By [Nathan Onn](https://github.com/nathanonn)

---

## What it does

On the way **into** the model's context, a WordPress username or Application Password is replaced with a session-scoped placeholder — `[WP-USER-3c4d]`, `[WP-PASS-9a1f]`. On the way **into a Bash tool call**, the placeholder is replaced with the real value, shell-quoted for the context it lands in.

You type:

```
username: exampleuser app password: AAAA BBBB CCCC DDDD EEEE FFFF
```

The model reads:

```
username: [WP-USER-3c4d] app password: [WP-PASS-9a1f]
```

The model writes a Bash call, using the placeholder verbatim:

```bash
curl -u [WP-USER-3c4d]:"[WP-PASS-9a1f]" https://example.test/wp-json/wp/v2/posts
```

The shell is handed:

```bash
curl -u exampleuser:"AAAA BBBB CCCC DDDD EEEE FFFF" https://example.test/wp-json/wp/v2/posts
```

The vault holding the mapping is plain module memory. It dies with the session, and nothing ever writes a real credential to disk. The digest is salted per session, so the same credential gets a different placeholder next time and two leaked transcripts cannot be correlated. A placeholder the vault has never held **denies** the Bash call rather than running it with the literal text.

---

## Install

Three routes. The first two register the hooks; the third does not on its own, and that
distinction matters more here than it would for a skill — see step 3 either way.

### 1. Plugin marketplace (recommended)

This repository is a Claude Code marketplace. From inside a session:

```
/plugin marketplace add nathanonn/agent-skills
/plugin install wp-credential-guard@nathanonn-agent-skills
```

Read the install summary. If it says the plugin is now active, the hooks are already loaded. If it
asks you to reload, run `/reload-plugins` — or just start a new session, which loads it anyway.

### 2. A local checkout, for development

`--plugin-dir` points at the **plugin folder itself**, not a directory of plugins, and it lasts
only for that session:

```bash
claude --plugin-dir /path/to/wp-credential-guard
```

Repeat the flag to load several plugins. A plugin loaded this way takes precedence over an
installed copy of the same name, which is what makes it useful for testing a change.

### 3. Copying the folder — read this before you do it

**Copying the plugin into `.claude/plugins/` does not register its hooks.** The plugin shows up as
present, nothing warns you, and every credential passes through verbatim. For a skill, copying is
enough; for hooks it is not. If you install this way you must also name it in your settings —
`~/.claude/settings.json` for every project, or `.claude/settings.json` for one:

```json
{
  "enabledPlugins": ["wp-credential-guard"]
}
```

Restart the session afterwards. If you would rather not hand-edit settings, point a local
marketplace at your checkout instead and install from it — that path runs the normal install flow
and enables the plugin for you:

```
/plugin marketplace add /path/to/agent-skills
/plugin install wp-credential-guard@agent-skills
```

### Then confirm the hooks are actually live

Do this once, whichever route you used. "Installed" and "working" are different states here, and
nothing announces the gap.

**Check registration** — run `/hooks` and look for `prompt.submit`, `skill.prompt`, `tool.call`
and `ui.render`. All four should be listed, sourced from this plugin.

**Check it fires** — send a prompt carrying a **dummy** credential:

```
username: exampleuser app password: AAAA BBBB CCCC DDDD EEEE FFFF
```

You should see a dim line reading
`wp-credential-guard: masked 1 username and 1 password (session-only)`, and the message row on
screen should show `[WP-USER-xxxx]` and `[WP-PASS-xxxx]` rather than what you typed. If the line is
absent on a prompt you know contained a credential, the hooks are not running — go back to step 3.

Never use a real credential for this check. A plugin you are still verifying is, by definition,
one you cannot yet rely on.

---

## What this does not protect

Read this before using it. The plugin covers one path well and several not at all.

**A plugin that is present but not loaded registers no hooks, and fails silently.** This is the sharpest trap here. The folder sitting on disk reports as installed while every credential passes through verbatim — there is no warning, because nothing is running to warn you.

Copying the folder into a plugins directory is the usual way to land in this state — it is enough for a skill and not enough for hooks. **Install** above has the fix and the two checks that settle it. Run them before you paste anything real. One caveat on the second check: a prompt containing no credential logs nothing either, so silence on ordinary traffic proves neither way — you have to send something that *should* be masked.

**The on-screen rewrite is cosmetic only.** The `ui.render` hook keeps the credential off your screen. The stored session JSONL is untouched and still holds whatever the engine persisted. It hides a leak; it does not fix one. No hook in the event set can reach a message the engine has already written — not the user message, not the expansion, not the last-prompt record. The plugin therefore never attempts to scrub or rewrite a transcript.

**Slash commands are refused, not masked.** A typed `/name args` carries its text to the model twice: once as the expansion the skill computes, and once in a `<command-args>` envelope beside it that no hook can rewrite. Masking one half leaves the other half in the clear in the same message, so the plugin returns `{ drop }` and the prompt never runs. To carry on, paste the credential as an ordinary message (no leading slash) to mint its placeholder, then re-run the slash command with the placeholder in place of the value:

```
/your-command [WP-USER-3c4d] [WP-PASS-9a1f]
```

A slash command carrying only placeholders is not refused — placeholder spans are reserved and nothing is minted from inside them.

**What a refusal actually buys is narrower than it looks.** That the command did not run and the model never read the value follows structurally from dropping the prompt. That the prompt also stayed out of the session transcript was measured once, on one engine build, where a refused submission left no record at all. The engine's own type definitions describe `prompt.submit` as running *after* the input became a user message, which reads like the opposite. Treat the on-disk question as open on your build, and treat your terminal scrollback as holding the value regardless.

**A false positive now costs the whole prompt.** Before the refusal existed, an over-eager rule mangled an argument; now it drops a submission. The `NOT_A_VALUE` stop list is what stands between ordinary prose and a refused prompt, and its false-positive rate over a long working session is unmeasured.

One shape of this has been measured and fixed, and it explains the design. `login: failed` from a pasted log line and `login: exampleuser` from a credential are the same shape, and no rule tells them apart reliably. So the plugin makes **masking and remembering two separate decisions, because they have very different costs.**

Masking a word in place is a one-off: one prompt reads slightly wrong. **Remembering** it is not — the name enters the session-wide sweep, every later mention of that word is rewritten for the rest of the session, and a slash command containing it is refused outright. So the bar for masking stays low, and the bar for remembering is higher: the value must survive the `NOT_A_VALUE` stop list, must not sit behind a determiner (`the user: …` is about users in general), and must be at least four characters and outside the `GENERIC_USER` set. A guess that fails those is still masked where it was found; it just never teaches the session a word.

The stop list is hand-built and, as the code says, never finishes. It is the first gate, not the only one.

**The username is only partly protected.** A generic account name — `admin`, `root`, `editor`, `wordpress`, and the rest of the `GENERIC_USER` set — is masked where a rule finds it, but is never swept for afterwards, because those are words before they are names. A distinctive name is swept only *after* a structural form identified it once; a bare mention before that is left alone. **A username shorter than four characters is never swept at all** — `bob`, `ann`, `kim` are masked where a rule finds them and silently missed everywhere else, because three letters match too much ordinary text to hunt for. Put plainly: **a site URL and a username are the pair most likely to still be sitting in a transcript.** The Application Password is the part this plugin defends properly.

**Untested surfaces.** None of the following was investigated, and each would need its own event or its own measurement: subagent preload, compaction, `/resume`, session export, another plugin loaded alongside this one and rewriting text after it, and any host other than an interactive terminal (`--print`, the SDK host, a resumed session each queue prompts differently). Whether a live WordPress accepts an expanded credential is also out of scope — the round trip proves byte fidelity through bash, not that `curl` authenticates.

---

## What it catches

| Form | Example |
| --- | --- |
| `-u user:pass`, unquoted | `curl -u exampleuser:AAAABBBBCCCCDDDDEEEEFFFF …` |
| `-u 'user:pass'` / `-u "user:pass"`, whole pair quoted | `curl -u 'exampleuser:AAAA BBBB CCCC DDDD EEEE FFFF' …` |
| `-u user:'pass'` / `-u user:"pass"`, quote opening after the colon | `curl -u exampleuser:"AAAA BBBB CCCC DDDD EEEE FFFF" …` |
| `--user=` in any of the above quotings | `curl --user=exampleuser:"AAAA BBBB …" …` |
| URL userinfo | `https://exampleuser:AAAABBBBCCCCDDDDEEEEFFFF@example.test/wp-json` |
| Labelled, with a separator | `app password: "AAAA BBBB …"`, `password='…'`, `wp_user = exampleuser` |
| Labelled, without a separator | `using user exampleuser and app password AAAA BBBB CCCC DDDD EEEE FFFF` |
| A bare six-group Application Password | `AAAA BBBB CCCC DDDD EEEE FFFF`, anywhere, no label needed |
| The space-stripped 24-character form | `AbCdEfGhIjKlMnOpQrStUvWx` — mixed case required |
| A bare mention of an already-pinned username | `log in as exampleuser` — *after* a separator, a `-u` pair or a URL identified it |

Inside a double-quoted `-u` half, backslash escapes are counted the way the shell counts them, so a password containing `"`, `$`, `` ` `` or `\` is masked whole rather than up to its first backslash, and the vault stores the bytes the shell would have handed the program.

**What it deliberately declines:**

- **Shell and template references.** `$WP_APP_PASSWORD`, `"$WP_APP_PASSWORD"`, `${pass}` name a secret rather than being one, and pass through untouched — including inside a quoted `-u` half.
- **Twenty-four characters that are not a password.** An all-lowercase slug, a hex ObjectId, an all-uppercase constant: WordPress mints these from the full alphanumeric alphabet, so a real one is overwhelmingly mixed-case. The cost is roughly one missed password in 250,000.
- **Identifiers that merely end in 24 alphanumerics.** A leading `_` or `-` puts the run outside the boundary, which is what keeps the engine's own `toolu_…` tool ids from being masked.
- **Existing placeholders.** A `[WP-PASS-xxxx]` quoted back from an earlier turn is never re-minted, and nothing is minted from inside it.
- **A pinned name inside a longer word.** Once `exampleuser` is pinned, `exampleuser_dev` and `exampleuser-ci` stay readable — one word is not a mention.

---

## The five hooks

| Hook | What it buys |
| --- | --- |
| `prompt.submit` | Masks credentials in what you type before the model sees it, logs the count, and staples a note telling the model how placeholders work. Refuses the submission outright when it is a slash command. |
| `skill.prompt` | Masks the prompt text a skill computes. Covers the Skill-tool and preload paths, which have no composer submission behind them and so cannot be refused. |
| `tool.call` (`Skill`) | Masks credentials in the arguments the model passes to the Skill tool — the model-invoked path, distinct from a typed `/name`. |
| `ui.render` (`UserMessage`) | Rewrites the message row on screen. Cosmetic; see above. |
| `tool.call` (`Bash`) | Substitutes real values back in, quoted for the bare/single/double context each placeholder sits in. Denies the call, naming only the unknown placeholders, when the vault has no value for one. |

---

## Running the tests

From the plugin root:

```bash
node tests/hooks.test.mjs
```

No dependencies, no build step, no `package.json` — the harness strips the TypeScript types itself and evaluates `hooks/hooks.ts` as a module, so the plugin file is never edited to be testable. Round-trip cases shell out to real `bash` and compare the bytes a program is handed.

Current result: **99 passed, 0 failed, 1 known limitation.**

A *limitation* is a case the plugin is known to get wrong. It is asserted and reported like a test, but never counted as a pass, and the run exits non-zero if the recorded behaviour has moved. The one on the page is an empty password (`-u user:''`), which the guard now declines rather than minting.

---

## Requirements and compatibility

- **Claude Code**, with plugin hook support. This is a hooks plugin, so it is **Claude-Code-only** — unlike the skills in this repository, it will not run under Codex, Cursor or GitHub Copilot, which have no equivalent event to hook.
- **Node** for the test suite. Nothing else; no install step.

---

## License

MIT — see the `LICENSE` file at the repository root.
