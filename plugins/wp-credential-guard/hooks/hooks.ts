import type { Register } from 'claude-code'

// ---------------------------------------------------------------------------
// The vault
//
// Module-level on purpose. `$.store` outlives the session; these two Maps do
// not. They die when the module is dropped — session end, or a reload under
// `--plugin-dir` — and nothing ever writes a real credential to disk.
// ---------------------------------------------------------------------------

type Kind = 'USER' | 'PASS'

/** `${kind}:${value}` -> placeholder, so one credential keeps one token. */
const tokenOf = new Map<string, string>()
/** placeholder -> the real value, read only on the way into Bash. */
const valueOf = new Map<string, string>()

/**
 * Usernames a labelled or structural form already pinned. A name is a secret
 * only once something said so; after that every bare mention of it is one too.
 */
const knownUsers = new Set<string>()

/**
 * Salts the digest below. Same credential, same placeholder for as long as the
 * session lives; a new session gives it a different one, so a leaked transcript
 * cannot be correlated against another.
 */
const salt = (() => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
})()

const PLACEHOLDER = /\[WP-(?:USER|PASS)-[0-9a-f]{4}\]/
const PLACEHOLDER_G = /\[WP-(?:USER|PASS)-[0-9a-f]{4}\]/g

/** Mints (or recalls) the placeholder standing in for `value`. */
function mint(kind: Kind, value: string): string {
  const key = `${kind}:${value}`
  const known = tokenOf.get(key)
  if (known) return known

  // FNV-1a over the salt and the value, truncated to four hex digits.
  let h = 0x811c9dc5
  for (const ch of `${salt}:${key}`) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }

  let token = ''
  for (let bump = 0; ; bump++) {
    const digest = (((h + bump * 0x9e3779b9) >>> 0) & 0xffff).toString(16).padStart(4, '0')
    token = `[WP-${kind}-${digest}]`
    if (!valueOf.has(token)) break
  }

  tokenOf.set(key, token)
  valueOf.set(token, value)
  return token
}

// ---------------------------------------------------------------------------
// Finding credentials
// ---------------------------------------------------------------------------

/**
 * A WordPress Application Password as WP itself prints it: six groups of four
 * alphanumerics. Distinctive enough to catch on its own, anywhere in a prompt.
 */
const APP_PASSWORD = String.raw`[A-Za-z0-9]{4}(?: [A-Za-z0-9]{4}){5}`

/**
 * The same secret with the spaces taken out, which is what
 * `wp user application-password create --porcelain` hands back.
 *
 * `_` and `-` belong in the boundaries even though the secret never contains
 * one: an identifier that merely ends in twenty-four alphanumerics is a
 * different thing from a bare password, and the engine's own `toolu_<24>` tool
 * ids are exactly that shape. Observed masking them in a live session.
 */
const APP_PASSWORD_BARE = String.raw`(?<![A-Za-z0-9_-])[A-Za-z0-9]{24}(?![A-Za-z0-9_-])`

/** Names a credential field: `password:`, `wp_user =`, `App Password:`. */
const USER_LABEL = String.raw`(?:wp[-_ ]?)?(?:user(?:[-_ ]?name)?|login)`
const PASS_LABEL = String.raw`(?:wp[-_ ]?)?(?:app[-_ ]?(?:password|pass)|password|passwd|pass)`

/**
 * The pass labels that survive losing their colon. Bare `pass` is a verb far
 * more often than it is a field, so it only counts with a separator.
 */
const PASS_LABEL_LOOSE = String.raw`(?:wp[-_ ]?)?(?:app[-_ ]?(?:password|pass)|password|passwd)`

/**
 * A value as a labelled form without a separator may write it: an identifier,
 * two characters or more, punctuation allowed inside but never at the edge.
 */
const USER_VALUE = String.raw`[A-Za-z0-9](?:[A-Za-z0-9._@-]*[A-Za-z0-9])`
/** Same, but six characters or more: below that a password is almost always prose. */
const PASS_VALUE = String.raw`[A-Za-z0-9][A-Za-z0-9._@!#$%^&*+=-]{4,}[A-Za-z0-9]`

/**
 * What the word after a separator-less label cannot be.
 *
 * `password: hunter2` names a secret; `password reset` names a feature, and
 * once the colon is gone the two are the same shape. The only thing left that
 * tells them apart is the vocabulary: prose puts a function word or the other
 * half of a compound noun there, and a credential never does.
 */
const NOT_A_VALUE = new Set(
  (
    'the a an this that these those it its their his her our your my ' +
    'is isn are aren was wasn were been be being has have had having ' +
    'will would can cannot could should shall may might must does did do done ' +
    'and or but nor so then than if when while because although though ' +
    'of in on at to for from with without into onto over under above below ' +
    'by via as per about after before again also just only still never not ' +
    'who whom whose which what where why how here there now ' +
    'said says say tell tells told ask asks asked want wants wanted need needs ' +
    'see saw seen get gets got give gives gave send sends sent make makes made ' +
    'run runs ran use uses used type types typed click clicks clicked ' +
    'seems looks looked keeps kept goes went comes came tries tried ' +
    'experience experiences interface interfaces input inputs output outputs ' +
    'data story stories journey journeys agent agents account accounts base ' +
    'group groups role roles permission permissions session sessions id ids ' +
    'list lists table tables model models setting settings profile profiles ' +
    'feedback flow flows testing research guide guides manual docs ' +
    'documentation error errors message messages name names email emails ' +
    'record records count counts level levels access management behaviour ' +
    'behavior preference preferences content facing friendly land space page ' +
    'pages form forms field fields value values object objects entity entities ' +
    'reset resets manager managers policy policies strength hash hashing ' +
    'expired expires expiry incorrect invalid wrong required missing changed ' +
    // What a log line puts after `login:` or `user:`. These are the words a
    // pasted stack trace or audit line would otherwise teach the sweep.
    'failed fails failure failures succeeded succeeds success unknown ' +
    'denied granted allowed blocked locked unlocked attempt attempts retry ' +
    'timeout timed created deleted updated removed added modified disabled ' +
    'enabled anonymous unauthenticated unauthorized authenticated authorized ' +
    'scope scopes context contexts directory folder home root-level ' +
    'change changes rotation rotate protection protected authentication auth ' +
    'prompt box entry length complexity requirements rules rule generator ' +
    'above below both either neither each every any some no none such ' +
    // Common nouns that sit right after `user` or `login` in ordinary prose.
    'path paths file files folder folders directory directories url urls ' +
    'config configs script scripts command commands link links option options ' +
    'button buttons screen screens window windows menu menus tab tabs ' +
    'action actions state states event events request requests response ' +
    'responses query queries token tokens key keys secret secrets ' +
    // WP-CLI puts its own verbs exactly where a username would go
    // (`wp user create smashed`), and they are not usernames.
    'create list add delete remove update import export generate meta term ' +
    'application application-password app-password session signup spam ' +
    'unspam check reset-password set-role add-role remove-role recount'
  ).split(' '),
)

/**
 * A determiner in front of the label means the sentence is about users in
 * general, not about one named account: `the user said`, `a user of the API`.
 */
const PROSE_LEAD = /(?:^|[^A-Za-z0-9])(?:the|a|an|this|that|these|those|each|every|any|some|no|my|your|our|their|his|her|its|one|another|per|power|end|super|multiple|several|many|few|other|first|last|new|old|same)\s+$/i

/**
 * A slice of the prompt that holds a credential. `value` is the credential the
 * slice stands for when the two differ — a double-quoted shell word writes
 * `ab\"cd` for the four characters `ab"cd`, and it is the four the vault has to
 * hold, or the value handed back to curl is not the one the user typed.
 */
type Span = { start: number; end: number; kind: Kind; value?: string; pin?: boolean }

/**
 * One way a credential shows up in text. `spans` reads the match's group
 * offsets (the `d` flag) and says which slices are secret and what they are.
 */
type Rule = { re: RegExp; spans: (m: RegExpExecArray) => Span[] }

/**
 * Turns a capture group index into a span, or nothing when it did not match.
 *
 * `pin` marks a username the surrounding text identified **structurally** — a
 * separator put it in a credential field, or a `-u` pair or a URL's userinfo
 * put it in the one place a username can go. Only those are remembered for the
 * later sweep; see `sweepable`.
 */
function group(m: RegExpExecArray, index: number, kind: Kind, pin = false): Span[] {
  const at = m.indices?.[index]
  if (!at) return []
  const value = m[index]
  if (!usable(value)) return []
  return [{ start: at[0], end: at[1], kind, pin }]
}

/**
 * One character of a double-quoted shell word: anything but the quote, or a
 * backslash and whatever it escapes. Written out because the two rules that
 * read a `-u` argument both need it, and because the earlier `[^"\\]*` — which
 * gave up at the first backslash — is precisely how a password came to be half
 * masked and half in the clear.
 */
const DQ_CHAR = String.raw`(?:[^"\\]|\\[\s\S])`

/**
 * The characters that word writes as an escape. Inside double quotes bash
 * unescapes a backslash only before one of these; `\b` stays two characters,
 * and unescaping it would put a password in the vault that nothing can log in
 * with. Everything else passes through exactly as typed.
 */
function unescapeDq(value: string): string {
  return value.replace(/\\(["\\$`])/g, '$1')
}

/** `group`, for a slice that sat inside double quotes and may carry escapes. */
function dqGroup(m: RegExpExecArray, index: number, kind: Kind, pin = false): Span[] {
  return group(m, index, kind, pin).map((s) => ({ ...s, value: unescapeDq(m[index]) }))
}

/**
 * Whether a captured slice is worth masking. Placeholders (a prompt quoting an
 * earlier turn) and shell or template references (`$WP_PASS`, `${pass}`) name a
 * secret rather than being one, so they pass through untouched.
 *
 * The test looks inside a wrapping quote pair, because a half the quote-aware
 * rules decline comes straight back here wearing its quotes: the unquoted `-u`
 * rule claims whatever they let go. Without that, `-u user:"$WP_PASS"` is minted
 * quotes and all — the vault swallows a reference, and the shell loses its own.
 */
function usable(value: string | undefined): value is string {
  if (!value) return false
  const inner = value.replace(/^(['"])([\s\S]*)\1$/, '$2')
  if (!inner) return false
  if (PLACEHOLDER.test(inner)) return false
  return !/^[$%{]/.test(inner)
}

/** Whether a label with only whitespace after it is naming a value or writing English. */
function labelled(m: RegExpExecArray, index: number): boolean {
  const value = m[index]
  if (!value || NOT_A_VALUE.has(value.toLowerCase())) return false
  return !PROSE_LEAD.test(m.input.slice(0, m.index))
}

/**
 * Whether a run of 24 alphanumerics is plausibly the secret and not an id.
 *
 * WP mints these from the full alphanumeric alphabet, so a real one is
 * overwhelmingly mixed-case; an ObjectId, a truncated digest or a slug is not.
 * The cost of the test is roughly one missed password in 250,000.
 */
function mixedCase(value: string): boolean {
  return /[a-z]/.test(value) && /[A-Z]/.test(value)
}

/**
 * Whether a word after a separator-less pass label is a secret and not an
 * adverb. `password immediately` and `password hunter2` are the same shape and
 * no stop list ever finishes; what a password has and English prose does not is
 * a digit, a punctuation mark, or a capital somewhere other than the front.
 *
 * The WP-shaped forms never reach this test — the two shape rules find those
 * whatever the label says — so the cost of being strict here is a missed
 * all-lowercase passphrase, not a missed Application Password.
 */
function secretish(value: string): boolean {
  return /[0-9]/.test(value) || /[^A-Za-z0-9]/.test(value) || /.[A-Z]/.test(value)
}

// Order is priority: an earlier rule wins any slice a later one also claims, so
// the rules that know which half is the username come before the bare ones.
const RULES: Rule[] = [
  // curl -u 'admin:abcd EFGH 1234 ijkl MNOP 5678' (quoted, so spaces survive)
  {
    re: new RegExp(
      String.raw`(?:^|\s)(?:-u|--user)[= ]\s*(?:'([^':]+):([^']*)'|"((?:[^":\\]|\\[\s\S])+):(${DQ_CHAR}*)")`,
      'gd',
    ),
    spans: (m) => [
      ...group(m, 1, 'USER', true),
      ...group(m, 2, 'PASS'),
      ...dqGroup(m, 3, 'USER', true),
      ...dqGroup(m, 4, 'PASS'),
    ],
  },
  // curl -u admin:'abcd EFGH ...' — the quote opens after the colon, so the
  // unquoted rule below would stop at the first space and leave the rest bare.
  // The double-quoted half counts escapes, so the closing quote it finds is the
  // one the shell would find: a password holding `"`, `$` or `\` is masked
  // whole rather than up to its first backslash.
  {
    re: new RegExp(
      String.raw`(?:^|\s)(?:-u|--user)[= ]\s*([^\s:'"]+):(?:'([^']*)'|"(${DQ_CHAR}*)")`,
      'gd',
    ),
    spans: (m) => [...group(m, 1, 'USER', true), ...group(m, 2, 'PASS'), ...dqGroup(m, 3, 'PASS')],
  },
  // curl -u admin:xxxx (unquoted)
  {
    re: /(?:^|\s)(?:-u|--user)[= ]\s*([^\s:'"]+):(\S+)/gd,
    spans: (m) => [...group(m, 1, 'USER', true), ...group(m, 2, 'PASS')],
  },
  // https://admin:xxxx@example.com/wp-json/...
  {
    re: /https?:\/\/([^\s:/@'"]+):([^\s@'"]+)@/gd,
    spans: (m) => [...group(m, 1, 'USER', true), ...group(m, 2, 'PASS')],
  },
  // App Password: "abcd EFGH ..." / password='xxxx'
  {
    re: new RegExp(String.raw`\b${PASS_LABEL}\s*[:=]\s*(?:'([^']+)'|"([^"]+)")`, 'gid'),
    spans: (m) => [...group(m, 1, 'PASS'), ...group(m, 2, 'PASS')],
  },
  // App Password: abcd EFGH 1234 ijkl MNOP 5678 / password = xxxx
  {
    re: new RegExp(String.raw`\b${PASS_LABEL}\s*[:=]\s*(${APP_PASSWORD}|[^\s'"]+)`, 'gid'),
    spans: (m) => group(m, 1, 'PASS'),
  },
  // app password abcd EFGH 1234 ijkl MNOP 5678 — dictated, so no colon survived.
  {
    re: new RegExp(
      String.raw`(?<![A-Za-z0-9_-])${PASS_LABEL_LOOSE}\s+(${APP_PASSWORD}|${PASS_VALUE})(?![A-Za-z0-9])`,
      'gid',
    ),
    spans: (m) =>
      labelled(m, 1) && (m[1].includes(' ') || secretish(m[1])) ? group(m, 1, 'PASS') : [],
  },
  // username: "admin" / wp_user = admin
  {
    re: new RegExp(String.raw`\b${USER_LABEL}\s*[:=]\s*(?:'([^']+)'|"([^"]+)"|([^\s'",;]+))`, 'gid'),
    // A separator is good evidence that the word beside it is a value, and it
    // is enough to mask on. It is not enough to *pin* on: a pasted log line
    // (`login: failed`) and a YAML fragment (`user: someone`) have the same
    // shape as `username: smashed`, and a wrong pin is not wrong once — it
    // rewrites that word on every later mention and refuses any slash command
    // carrying it. So the mask is unconditional and the pin runs the same stop
    // list and prose test the separator-less rule has to pass.
    spans: (m) => [
      ...group(m, 1, 'USER', labelled(m, 1)),
      ...group(m, 2, 'USER', labelled(m, 2)),
      ...group(m, 3, 'USER', labelled(m, 3)),
    ],
  },
  // using user smashed and ... — same, for the username. Deliberately not a
  // pin: this rule is the one that guesses, and a guess that poisons the sweep
  // rewrites every later mention of an ordinary word.
  {
    re: new RegExp(
      String.raw`(?<![A-Za-z0-9_-])${USER_LABEL}\s+(${USER_VALUE})(?![A-Za-z0-9._@-])`,
      'gid',
    ),
    spans: (m) => (labelled(m, 1) ? group(m, 1, 'USER') : []),
  },
  // A bare Application Password, no label in sight.
  {
    re: new RegExp(String.raw`(?<![A-Za-z0-9])${APP_PASSWORD}(?![A-Za-z0-9])`, 'gd'),
    spans: (m) => (usable(m[0]) ? [{ start: m.index, end: m.index + m[0].length, kind: 'PASS' }] : []),
  },
  // The same, space-stripped. Last, because 24 alphanumerics is a shape many
  // innocent identifiers share and every rule above knows more than it does.
  {
    re: new RegExp(APP_PASSWORD_BARE, 'gd'),
    spans: (m) =>
      usable(m[0]) && mixedCase(m[0])
        ? [{ start: m.index, end: m.index + m[0].length, kind: 'PASS' }]
        : [],
  },
]

/**
 * Generic accounts and two-letter handles are words before they are names, so
 * sweeping every bare mention would rewrite the prompt rather than protect it.
 * They stay masked wherever a rule actually found them; they are just not
 * hunted for afterwards.
 */
const GENERIC_USER = new Set([
  'admin', 'administrator', 'root', 'user', 'users', 'test', 'tester', 'demo',
  'guest', 'wordpress', 'wpadmin', 'editor', 'author', 'subscriber', 'owner',
  'contributor', 'none', 'null', 'www', 'api', 'dev', 'staging', 'prod',
  'production', 'local', 'localhost', 'example', 'site', 'blog', 'main',
])

/**
 * Whether a pinned username is distinctive enough to hunt for in later prose.
 * Only reached for a structurally pinned name — see the `pin` flag on `Span`.
 */
function sweepable(name: string): boolean {
  return name.length >= 4 && !GENERIC_USER.has(name.toLowerCase())
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function overlapping(spans: readonly Span[], s: Span): boolean {
  return spans.some((c) => s.start < c.end && c.start < s.end)
}

/** Replaces every credential in `text` with its placeholder. */
function redact(text: string): { text: string; users: number; passes: number } {
  const claimed: Span[] = []

  // A placeholder quoted back from an earlier turn names a secret; nothing may
  // be minted out of its insides.
  const reserved: Span[] = []
  PLACEHOLDER_G.lastIndex = 0
  for (let m = PLACEHOLDER_G.exec(text); m; m = PLACEHOLDER_G.exec(text)) {
    reserved.push({ start: m.index, end: m.index + m[0].length, kind: 'PASS' })
  }

  for (const rule of RULES) {
    rule.re.lastIndex = 0
    for (let m = rule.re.exec(text); m; m = rule.re.exec(text)) {
      for (const span of rule.spans(m)) {
        if (overlapping(claimed, span) || overlapping(reserved, span)) continue
        claimed.push(span)
      }
      // A zero-width match would spin forever; nudge past it.
      if (m[0] === '') rule.re.lastIndex++
    }
  }

  // A structural form knew which slice was a username because a separator or a
  // `-u` pair put it somewhere only a username goes. Remember those, and the
  // plain `log in as smashed` two turns later is a credential too.
  //
  // The separator-less rule is excluded on purpose. It reads `login path` the
  // same way it reads `login smashed`, and a name it guessed wrong does not
  // stay wrong once: the sweep would rewrite every later mention of an ordinary
  // word for the rest of the session, and a slash command carrying that word
  // would be refused outright.
  for (const span of claimed) {
    if (span.kind !== 'USER' || !span.pin) continue
    const name = span.value ?? text.slice(span.start, span.end)
    if (sweepable(name)) knownUsers.add(name)
  }

  for (const name of knownUsers) {
    const re = new RegExp(String.raw`(?<![A-Za-z0-9_-])${escapeRe(name)}(?![A-Za-z0-9_-])`, 'g')
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const span: Span = { start: m.index, end: m.index + name.length, kind: 'USER' }
      if (overlapping(claimed, span) || overlapping(reserved, span)) continue
      claimed.push(span)
    }
  }

  let users = 0
  let passes = 0
  let out = text
  for (const span of claimed.sort((a, b) => b.start - a.start)) {
    const token = mint(span.kind, span.value ?? text.slice(span.start, span.end))
    if (span.kind === 'USER') users++
    else passes++
    out = out.slice(0, span.start) + token + out.slice(span.end)
  }

  return { text: out, users, passes }
}

// ---------------------------------------------------------------------------
// Putting them back, for Bash only
// ---------------------------------------------------------------------------

/**
 * The quote each offset of `s` sits inside: `'`, `"`, or `''` for bare. An
 * Application Password carries spaces, so a substitution has to know whether
 * the shell will already be holding the word together.
 */
function quoteStates(s: string): string[] {
  const states: string[] = new Array(s.length).fill('')
  let quote = ''
  for (let i = 0; i < s.length; i++) {
    states[i] = quote
    const c = s[i]
    if ((quote === '' || quote === '"') && c === '\\') {
      i++
      if (i < s.length) states[i] = quote
      continue
    }
    if (quote === '') {
      if (c === "'" || c === '"') quote = c
    } else if (c === quote) {
      quote = ''
    }
  }
  return states
}

const BARE_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/

/** Renders `value` so the shell reads it as one word in the given context. */
function forShell(value: string, quote: string): string {
  if (quote === "'") return value.replace(/'/g, `'\\''`)
  if (quote === '"') return value.replace(/[\\"$`]/g, (c) => `\\${c}`)
  if (BARE_SAFE.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Swaps placeholders back into a command; names any it has no value for. */
function expand(command: string): { command: string; missing: string[] } {
  const states = quoteStates(command)
  const missing: string[] = []

  const out = command.replace(PLACEHOLDER_G, (token, at: number) => {
    const value = valueOf.get(token)
    if (value === undefined) {
      if (!missing.includes(token)) missing.push(token)
      return token
    }
    return forShell(value, states[at] ?? '')
  })

  return { command: out, missing }
}

const NOTE =
  'wp-credential-guard: WordPress credentials in that prompt were replaced with ' +
  '[WP-USER-xxxx] / [WP-PASS-xxxx] placeholders. Use the placeholders verbatim in ' +
  'Bash commands (quoting them as you would the real value) — they are substituted ' +
  'for the real credentials at execution and shell-quoted for you. They only work ' +
  'in Bash, only in this session, and you cannot read the values behind them.'

/**
 * What the engine does with a typed `/name args`: it hands the text to the
 * model in two places — the expansion `skill.prompt` computes, and a
 * `<command-args>` envelope beside it that no event in the set can rewrite —
 * and it stores the text the user typed rather than the text this chain
 * returned. Rewriting cannot win here; refusing can.
 */
const BURNED =
  'wp-credential-guard: SLASH COMMAND — a credential in a slash-command ' +
  'argument reaches the model in an envelope no hook can rewrite, so this ' +
  'prompt was refused rather than masked.'

/**
 * Shown in place of the refused prompt.
 *
 * Two claims of very different strength live here, and the wording keeps them
 * apart. That the command did not run and the model never read the value
 * follows from returning `{ drop }` — it is structural. That the prompt also
 * stayed off disk is an observation, not a guarantee: the engine's own types
 * describe this event as running "after the input became a user message",
 * which reads like the opposite, and a single measurement against a live
 * transcript found a refused submission leaving no `user` record and no
 * `last-prompt` record while the same command allowed through left both. One
 * build, one day. The message claims only what it can.
 */
const REFUSED =
  'wp-credential-guard: REFUSED — a WordPress credential was typed as a ' +
  'slash-command argument.\n\n' +
  'The command did not run and the model never read the value. Whether the ' +
  'prompt also stayed out of the session transcript depends on the engine ' +
  'build: on the one this was measured against a refused submission left no ' +
  'record at all, but that has not been verified across versions or hosts. ' +
  'Either way the value is in your terminal scrollback, so revoke it if this ' +
  'terminal is recorded or shared — or if you want certainty.\n\n' +
  'To carry on: paste the credential as an ordinary message (no leading slash) ' +
  'to get its placeholder, then re-run the slash command with the ' +
  '[WP-PASS-xxxx] placeholder in place of the value.'

/**
 * Whether the submission is a slash command. `/` still leading the text is
 * proof; its absence is not proof of the opposite, because it is unsettled
 * whether the engine hands the prefix to this event at all — so the caller
 * treats a false here as "unknown" and still says something.
 */
function looksLikeSlash(text: string): boolean {
  return /^\s*\/[A-Za-z0-9]/.test(text)
}

export const register: Register = (on) => {
  on('prompt.submit', async ($, e, next) => {
    const found = redact(e.text)
    if (found.users === 0 && found.passes === 0) return next(e)

    const parts = [
      found.users ? `${found.users} username${found.users > 1 ? 's' : ''}` : '',
      found.passes ? `${found.passes} password${found.passes > 1 ? 's' : ''}` : '',
    ].filter(Boolean)
    $.ui.log(`wp-credential-guard: masked ${parts.join(' and ')} (session-only)`)

    // A typed `/name args` carries the credential to the model twice over, and
    // this chain's rewrite reaches neither copy. `skill.prompt` masks the
    // expansion it computes; the `<command-args>` envelope beside it is not
    // that text, and no event in the set can rewrite it. Observed live: one half
    // of the message reached the model as [WP-PASS-xxxx] and the other half as
    // the real password. Refusing the prompt is the only thing left that keeps
    // the value out of the model's context.
    //
    // `$.ui.notice` needs an open tool dialog's id and there is none here, so
    // the loud surfaces at this event are the pinned status line and the toast.
    if (looksLikeSlash(e.text)) {
      $.ui.log(BURNED)
      $.ui.toast('wp-credential-guard: prompt refused — paste the credential as a plain message', {
        timeoutMs: 20000,
      })
      $.ui.status('wp-credential-guard: slash-command credential refused — treat it as exposed')
      return { drop: REFUSED }
    }

    // `looksLikeSlash` returning false is not proof the prompt was not one, so
    // a stripped prefix still gets a line rather than silence.
    $.ui.log(
      'wp-credential-guard: if that was a slash command, the engine stored the ' +
        'text you typed rather than the masked text — revoke the credential.',
    )

    const r = await next({ ...e, text: found.text })
    if (r.drop !== undefined) return r
    return { ...r, context: [...(r.context ?? []), NOTE] }
  })

  // A typed `/name` no longer reaches here with a credential in it — the
  // submission is refused above. This covers the two expansions that have no
  // composer submission behind them and so cannot be refused: the Skill tool's
  // invocation and a preload. No matcher; any skill can be handed a credential.
  on('skill.prompt', async ($, e, next) => {
    const r = await next(e)
    const found = redact(r.text)
    if (found.users === 0 && found.passes === 0) return r
    return { text: found.text }
  })

  // The model-invoked path. A user-typed `/name` never comes through here.
  on('tool.call', { tool: 'Skill' }, ($, e, next) => {
    if (e.tool !== 'Skill') return next(e)
    if (e.args === undefined) return next(e)

    const found = redact(e.args)
    if (found.users === 0 && found.passes === 0) return next(e)

    return next({ ...e, args: found.text })
  })

  // Cosmetic, and only cosmetic: this keeps the credential off the screen. The
  // stored message is untouched and the file on disk still holds the real
  // value. It hides the leak; it does not fix it.
  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    const found = redact(e.props.text)
    if (found.users === 0 && found.passes === 0) return next(e)

    // `props.origin` is read-only — changing or dropping it makes the engine
    // throw the rewrite away and draw its own row.
    return next({ ...e, props: { ...e.props, text: found.text } })
  })

  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    if (e.tool !== 'Bash') return next(e)

    const { command, missing } = expand(e.command)
    if (missing.length > 0) {
      return {
        deny:
          `wp-credential-guard has no value for ${missing.join(', ')} — the vault is ` +
          `session-scoped and holds nothing under that name. Ask the user to paste the ` +
          `credential again in this session.`,
      }
    }
    if (command === e.command) return next(e)

    return next({ ...e, command })
  })
}
