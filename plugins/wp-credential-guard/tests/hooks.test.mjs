#!/usr/bin/env node
// ---------------------------------------------------------------------------
// wp-credential-guard: runtime harness
//
//   node tests/hooks.test.mjs
//
// No dependencies, no package.json, no build step. `hooks.ts` is TypeScript
// with a type-only import and nothing on this machine compiles it at load, so
// the harness strips the types itself (stripTypes below) and evaluates the
// result as a module. The plugin file is never edited to be testable.
//
// Every credential in here is obviously fake.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOOKS = join(HERE, '..', 'hooks', 'hooks.ts')

// ---------------------------------------------------------------------------
// Loading hooks.ts from Node
//
// A whole-language TypeScript stripper is a compiler; this is not one. It
// removes exactly the constructs hooks.ts uses, and anything it misses leaves
// TypeScript behind that Node refuses to parse — so the failure is a loud
// SyntaxError naming the line, never a test that quietly passes on the wrong
// source. The output was checked token-for-token against `tsc`'s own emit.
// ---------------------------------------------------------------------------

export function stripTypes(src) {
  let s = src

  // `import type { Register } from 'claude-code'`
  s = s.replace(/^import type [^\n]*\n/gm, '')

  // `type Kind = ...`, `type Span = ...` (single-line declarations)
  s = s.replace(/^(?:export )?type [A-Za-z0-9_]+ = [^\n]*\n/gm, '')

  // `new Map<string, string>()`
  s = s.replace(/\bnew ([A-Za-z_$][\w$]*)<[^<>]*>\(/g, 'new $1(')

  // `const claimed: Span[] = []`, `export const register: Register = ...`
  s = s.replace(
    /^(\s*(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*)\s*:\s*[^=\n]+=/gm,
    '$1 =',
  )

  // `function redact(text: string): { text: string; ... } {` — the body's `{`
  // is the last character of the line, so a return type of its own braces is
  // still eaten whole.
  s = s.replace(
    /^(\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*)\(([^)]*)\)\s*(?::\s*.*?)?\s*\{$/gm,
    (_m, head, params) => `${head}(${stripParams(params)}) {`,
  )

  // `(token, at: number) =>`
  s = s.replace(
    /([(,]\s*[A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$.]*(?:\[\])?(\s*\)\s*=>)/g,
    '$1$2',
  )

  return s
}

function stripParams(params) {
  if (params.trim() === '') return ''
  return params
    .split(',')
    .map((p) => p.split(':')[0].trim())
    .join(', ')
}

const SOURCE = readFileSync(HOOKS, 'utf8')

// hooks.ts exports `register` alone. The vault and the matchers are what the
// tests are about, so the harness appends its own export line rather than
// asking the plugin to widen its surface for a test.
const EXPOSE = `
export { redact, expand, looksLikeSlash, mint, valueOf, tokenOf, knownUsers, quoteStates, forShell, usable }
`

let nonce = 0

/**
 * A module instance nobody else has touched. The vault and `knownUsers` are
 * module-level and session-scoped, so a test that pins a name has to be able
 * to start from a session where nothing is pinned.
 */
async function fresh() {
  const js = `${stripTypes(SOURCE)}${EXPOSE}// instance ${nonce++}\n`
  const url = `data:text/javascript;base64,${Buffer.from(js, 'utf8').toString('base64')}`
  return import(url)
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

let passed = 0
const failures = []
const limitations = []

async function test(name, body) {
  try {
    await body()
    passed++
  } catch (err) {
    failures.push({ name, message: err && err.message ? err.message : String(err) })
  }
}

/** A case the plugin is known to get wrong: asserted, reported, never a pass. */
async function limitation(name, body) {
  try {
    const note = await body()
    limitations.push({ name, note, held: true })
  } catch (err) {
    limitations.push({
      name,
      note: `behaviour MOVED since it was recorded: ${err && err.message ? err.message : err}`,
      held: false,
    })
  }
}

function ok(cond, message) {
  if (!cond) throw new Error(message)
}

function eq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`)
  }
}

const TOKENS = /\[WP-(?:USER|PASS)-[0-9a-f]{4}\]/g
const tokensIn = (s) => s.match(TOKENS) ?? []
const passTokens = (s) => tokensIn(s).filter((t) => t.startsWith('[WP-PASS-'))
const userTokens = (s) => tokensIn(s).filter((t) => t.startsWith('[WP-USER-'))

/** The placeholder shape with every real value erased, for readable assertions. */
const shape = (s) => s.replace(/\[WP-USER-[0-9a-f]{4}\]/g, '<U>').replace(/\[WP-PASS-[0-9a-f]{4}\]/g, '<P>')

// Obviously fake credentials.
const USER = 'smashed'
const PASS = 'AAAA BBBB CCCC DDDD EEEE FFFF'
const PASS_BARE = 'AAAABBBBCCCCDDDDEEEEFFFF'

// ---------------------------------------------------------------------------
// Regression guards — the forms that worked before the extension
// ---------------------------------------------------------------------------

await test('REG labelled username', async () => {
  const { redact } = await fresh()
  const r = redact(`username: ${USER}`)
  eq(shape(r.text), 'username: <U>', 'username label')
  eq(r.users, 1, 'one username')
  eq(r.passes, 0, 'no password')
  ok(!r.text.includes(USER), 'the name is gone')
})

await test('REG labelled app password', async () => {
  const { redact } = await fresh()
  const r = redact(`wp app password: ${PASS}`)
  eq(shape(r.text), 'wp app password: <P>', 'app-password label')
  eq(r.passes, 1, 'one password')
  ok(!r.text.includes('AAAA'), 'no fragment survives')
})

await test('REG -u with a quoted pair', async () => {
  const { redact } = await fresh()
  const r = redact(`curl -u '${USER}:${PASS}' https://wp.test/wp-json/wp/v2/posts`)
  eq(shape(r.text), "curl -u '<U>:<P>' https://wp.test/wp-json/wp/v2/posts", 'quoted -u pair')
  eq(r.users, 1, 'one username')
  eq(r.passes, 1, 'one password')
})

await test('REG URL userinfo', async () => {
  const { redact } = await fresh()
  const r = redact(`curl https://${USER}:${PASS_BARE}@wp.test/wp-json/wp/v2/users/me`)
  eq(shape(r.text), 'curl https://<U>:<P>@wp.test/wp-json/wp/v2/users/me', 'url userinfo')
  eq(r.users, 1, 'one username')
  eq(r.passes, 1, 'one password')
})

await test('REG an existing placeholder passes through', async () => {
  const { redact } = await fresh()
  const text = 'reuse [WP-PASS-1a2b] and [WP-USER-3c4d] from before'
  const r = redact(text)
  eq(r.text, text, 'placeholders untouched')
  eq(r.users + r.passes, 0, 'nothing minted')
})

await test('REG shell and template references pass through', async () => {
  const { redact } = await fresh()
  for (const text of [
    'curl -u smashed:$WP_APP_PASSWORD https://wp.test/wp-json',
    'curl -u smashed:"$WP_APP_PASSWORD" https://wp.test/wp-json',
    "curl -u smashed:'$WP_APP_PASSWORD' https://wp.test/wp-json",
    'the password is ${pass} in the template',
    'wp app password: $WP_APP_PASSWORD',
  ]) {
    const r = redact(text)
    ok(r.passes === 0, `no password minted for ${JSON.stringify(text)} (got ${r.passes})`)
    ok(
      r.text.includes('$WP_APP_PASSWORD') || r.text.includes('${pass}'),
      `the reference survives in ${JSON.stringify(r.text)}`,
    )
  }
})

// ---------------------------------------------------------------------------
// B — the mixed-quote form
// ---------------------------------------------------------------------------

await test('B -u user:"pass with spaces"', async () => {
  const { redact } = await fresh()
  const r = redact(`curl -u ${USER}:"${PASS}" https://wp.test/wp-json/wp/v2/posts`)
  eq(shape(r.text), 'curl -u <U>:"<P>" https://wp.test/wp-json/wp/v2/posts', 'the whole password, quotes kept')
  eq(r.passes, 1, 'one password, not a fragment')
  for (const group of PASS.split(' ')) ok(!r.text.includes(group), `${group} is not in the clear`)
})

await test("B -u user:'pass with spaces'", async () => {
  const { redact } = await fresh()
  const r = redact(`curl -u ${USER}:'${PASS}' https://wp.test/wp-json`)
  eq(shape(r.text), "curl -u <U>:'<P>' https://wp.test/wp-json", 'single-quoted half')
  eq(r.passes, 1, 'one password')
})

await test('B --user=user:"pass with spaces"', async () => {
  const { redact } = await fresh()
  const r = redact(`curl --user=${USER}:"${PASS}" https://wp.test/wp-json`)
  eq(shape(r.text), 'curl --user=<U>:"<P>" https://wp.test/wp-json', 'long flag with =')
  eq(r.passes, 1, 'one password')
})

await test('B the quoted half is one value, not the first group', async () => {
  const { redact, valueOf } = await fresh()
  const r = redact(`curl -u ${USER}:"${PASS}" https://wp.test/wp-json`)
  const [token] = passTokens(r.text)
  eq(valueOf.get(token), PASS, 'the vault holds the whole password')
})

// ---------------------------------------------------------------------------
// C — a label with no separator
// ---------------------------------------------------------------------------

await test('C label without a separator', async () => {
  const { redact } = await fresh()
  const r = redact(`using user ${USER} and app password ${PASS}`)
  eq(shape(r.text), 'using user <U> and app password <P>', 'both halves found')
  eq(r.users, 1, 'one username')
  eq(r.passes, 1, 'one password')
})

await test('C separator-less label, bare-form password', async () => {
  const { redact } = await fresh()
  const r = redact(`login ${USER} password Hunter2Hunter2`)
  eq(r.passes, 1, 'the passphrase is a secret')
  ok(!r.text.includes('Hunter2Hunter2'), 'and it is gone')
})

// ---------------------------------------------------------------------------
// D — learn, then redact
// ---------------------------------------------------------------------------

await test('D a bare name before anything pins it is not masked', async () => {
  const { redact } = await fresh()
  const r = redact(`log in as ${USER} and check the posts`)
  eq(r.text, `log in as ${USER} and check the posts`, 'left alone')
  eq(r.users, 0, 'nothing minted')
})

for (const [how, pinning] of [
  ['a label', `username: ${USER}`],
  ['-u', `curl -u ${USER}:${PASS_BARE} https://wp.test/wp-json`],
  ['URL userinfo', `curl https://${USER}:${PASS_BARE}@wp.test/wp-json`],
]) {
  await test(`D a bare name after ${how} pinned it is masked`, async () => {
    const { redact } = await fresh()
    const first = redact(pinning)
    const [pinned] = userTokens(first.text)
    ok(pinned, 'the pinning form found a username')

    const later = redact(`now log in as ${USER} and list the drafts`)
    eq(shape(later.text), 'now log in as <U> and list the drafts', 'the bare mention is masked')
    eq(later.users, 1, 'one username')
    eq(userTokens(later.text)[0], pinned, 'and it is the same placeholder')
  })
}

await test('D a pinned name inside a longer word is left alone', async () => {
  const { redact } = await fresh()
  redact(`username: ${USER}`)
  const r = redact(`the ${USER}_dev account, the ${USER}-ci runner and ${USER}x`)
  eq(r.users, 0, 'no substring is masked')
  ok(r.text.includes(`${USER}_dev`), 'smashed_dev intact')
  ok(r.text.includes(`${USER}-ci`), 'smashed-ci intact')
})

// The separator-less rule is the one that guesses, and `login path` is the
// shape it guesses wrong on. Masking it in place is a cosmetic cost; letting it
// into the sweep is not, because every later mention of an ordinary word is
// then rewritten for the rest of the session — and a slash command carrying
// that word is refused outright. Observed live before the `pin` flag existed.
await test('D a separator-less guess never poisons the sweep', async () => {
  const { redact } = await fresh()
  for (const pinning of ['login path for the admin area', 'wp user path', 'using user path']) {
    const mod = await fresh()
    mod.redact(pinning)
    const later = mod.redact('the destination path the skill writes to')
    eq(later.users, 0, `"${pinning}" pinned an ordinary word into the sweep`)
    ok(later.text.includes('path'), 'and the later mention is left readable')
  }
  // The same word in a structural form is a different matter: it really is
  // where a username goes, so it pins and sweeps as before.
  redact('username: pathfinder')
  eq(redact('log in as pathfinder').users, 1, 'a structural pin still sweeps')
})

// A separator is enough to mask on and not enough to pin on. A pasted log line
// or a YAML fragment has the same shape as a credential, so the stop list and
// the prose test gate the pin on this rule too.
await test('D a separator does not pin a word the stop list rejects', async () => {
  for (const [pinning, word] of [
    ['login: failed', 'failed'],
    ['the user: created the post', 'created'],
    ['a login: expired an hour ago', 'expired'],
  ]) {
    const mod = await fresh()
    const first = mod.redact(pinning)
    ok(first.users >= 1, `"${pinning}" should still be masked in place`)

    const later = mod.redact(`the build ${word} for an unrelated reason`)
    eq(later.users, 0, `"${pinning}" pinned "${word}" into the sweep`)
    ok(later.text.includes(word), 'and the later mention is left readable')
  }
})

await test('D a separator still pins a real username', async () => {
  for (const pinning of [`username: ${USER}`, `wp_user = ${USER}`, `login: "${USER}"`]) {
    const mod = await fresh()
    mod.redact(pinning)
    const later = mod.redact(`now log in as ${USER} and list the drafts`)
    eq(later.users, 1, `"${pinning}" must still pin a genuine username`)
  }
})

await test('D common nouns after a user label are not values', async () => {
  const { redact } = await fresh()
  for (const text of [
    'the login path for the admin area',
    'check the user config before deploying',
    'the user directory is empty',
    'the login url changed',
  ]) {
    const r = await redact(text)
    eq(r.users, 0, `something was minted from ${JSON.stringify(text)}`)
  }
})

await test('D a generic account is never swept', async () => {
  const { redact } = await fresh()
  redact('username: admin')
  const r = redact('log in as admin and check the plugins')
  eq(r.users, 0, 'admin is a word before it is a name')
})

// ---------------------------------------------------------------------------
// E — the space-stripped App Password
// ---------------------------------------------------------------------------

await test('E a bare 24-character App Password', async () => {
  const { redact } = await fresh()
  const r = redact('the porcelain output was AbCdEfGhIjKlMnOpQrStUvWx today')
  eq(shape(r.text), 'the porcelain output was <P> today', 'found with no label at all')
  eq(r.passes, 1, 'one password')
})

await test('E a 24-character lowercase slug is not a password', async () => {
  const { redact } = await fresh()
  const r = redact('the slug is abcdefghijklmnopqrstuvwx here')
  eq(r.passes, 0, 'left alone')
})

await test('E a 24-hex ObjectId is not a password', async () => {
  const { redact } = await fresh()
  const r = redact('the document id 507f1f77bcf86cd799439011 was updated')
  eq(r.passes, 0, 'left alone')
})

await test('E a 24-character uppercase constant is not a password', async () => {
  const { redact } = await fresh()
  const r = redact('the constant ABCDEFGHIJKLMNOPQRSTUVWX is set')
  eq(r.passes, 0, 'left alone')
})

// Regression, and not a hypothetical one: the engine's own tool ids are
// `toolu_` followed by twenty-four mixed-case alphanumerics. With `_` outside
// the boundaries this rule ate every one of them, observed live in the session
// that shipped the rule.
await test('E an underscore-prefixed identifier is not a password', async () => {
  const { redact } = await fresh()
  const r = redact('the call toolu_01NYw3SHCmRGjDyGptdVkN2K returned')
  eq(r.passes, 0, 'left alone')
})

await test('E a hyphen-prefixed identifier is not a password', async () => {
  const { redact } = await fresh()
  const r = redact('the run wf-AbCdEfGhIjKlMnOpQrStUvWx finished')
  eq(r.passes, 0, 'left alone')
})

await test('E the bare password still matches at a sentence edge', async () => {
  const { redact } = await fresh()
  eq(shape(redact('AbCdEfGhIjKlMnOpQrStUvWx').text), '<P>', 'whole string')
  eq(shape(redact('(AbCdEfGhIjKlMnOpQrStUvWx)').text), '(<P>)', 'inside brackets')
})

// ---------------------------------------------------------------------------
// F — backslash escapes inside a double-quoted `-u` argument
//
// An Application Password is alphanumerics and spaces, so it never needs one of
// these. A wp-admin account password can hold anything, and inside double
// quotes a `"`, a `$` or a `\` has to be written with a backslash to survive the
// shell. The rule used to give up at that backslash and the unquoted rule took
// the fragment in front of it — half the password masked, the other half in the
// clear, and the command mangled on its way to curl.
// ---------------------------------------------------------------------------

/** `curl -u <arg> <url>` reduced to the one thing the shell hands the program. */
const asPrintf = (command) =>
  command.replace(/^curl -u /, "printf '%s' ").replace(/ https:\/\/\S+$/, '')

const ESCAPED = [
  ['an escaped double quote', String.raw`ab\"cd ef`, 'ab"cd ef'],
  ['an escaped dollar', String.raw`has\$dollar x`, 'has$dollar x'],
  ['an escaped backslash', String.raw`back\\slash x`, 'back\\slash x'],
  ['an escaped backtick', 'tick\\`bt x', 'tick`bt x'],
  // Bash leaves a backslash before anything else exactly where it is, so the
  // vault has to as well: `\b` is two characters of the password.
  ['a backslash bash does not read as an escape', String.raw`kept\bslash x`, String.raw`kept\bslash x`],
]

for (const [what, written, actual] of ESCAPED) {
  for (const [form, build] of [
    ['-u user:"pass"', (w) => `curl -u ${USER}:"${w}" https://wp.test/wp-json`],
    ['-u "user:pass"', (w) => `curl -u "${USER}:${w}" https://wp.test/wp-json`],
  ]) {
    await test(`F ${what}, ${form}`, async () => {
      const { redact, valueOf } = await fresh()
      const original = build(written)
      const r = redact(original)

      eq(r.passes, 1, 'one password, not a fragment')
      const [token] = passTokens(r.text)
      eq(valueOf.get(token), actual, 'the vault holds what the shell would have handed curl')

      // Nothing recognisable from the password is left on the line. The token
      // is taken out first: four hex digits can spell a fragment by accident.
      const rest = shape(r.text)
      for (const part of actual.split(' ')) {
        ok(!rest.includes(part), `${JSON.stringify(part)} is not in the clear`)
      }
      ok(!rest.includes('\\'), 'and no orphaned escape is left behind')
    })

    await test(`F ${what}, ${form}, round trip`, async () => {
      const { redact, expand } = await fresh()
      const original = build(written)
      const want = throughBash(asPrintf(original))
      ok(want.includes(actual), `the shell reads the original as ${JSON.stringify(actual)}`)

      const { command, missing } = expand(redact(original).text)
      eq(missing.length, 0, 'the vault knows both tokens')
      eq(throughBash(asPrintf(command)), want, 'the program is handed the same bytes as before')
    })
  }
}

await test('F a shell reference in a double-quoted half is still left alone', async () => {
  const { redact } = await fresh()
  for (const text of [
    'curl -u smashed:"$WP_APP_PASSWORD" https://wp.test/wp-json',
    'curl -u "smashed:$WP_APP_PASSWORD" https://wp.test/wp-json',
  ]) {
    const r = redact(text)
    eq(r.passes, 0, `no password minted for ${JSON.stringify(text)}`)
    ok(r.text.includes('$WP_APP_PASSWORD'), 'the reference survives')
  }
})

await test('F an escaped dollar is a literal, not a reference', async () => {
  const { redact, valueOf } = await fresh()
  const r = redact(String.raw`curl -u ${USER}:"\$WP_APP_PASSWORD" https://wp.test/wp-json`)
  eq(r.passes, 1, 'a backslash in front of it makes it the password itself')
  eq(valueOf.get(passTokens(r.text)[0]), '$WP_APP_PASSWORD', 'stored as the literal')
})

// ---------------------------------------------------------------------------
// A — the slash-command helper
// ---------------------------------------------------------------------------

await test('A looksLikeSlash', async () => {
  const { looksLikeSlash } = await fresh()
  for (const yes of ['/deploy', '  /deploy AAAA BBBB', '/wp-json', '\n/x']) {
    ok(looksLikeSlash(yes), `${JSON.stringify(yes)} is a slash command`)
  }
  for (const no of ['hello /deploy', '/ deploy', '//a comment', 'curl -u a:b', '', '/-dash']) {
    ok(!looksLikeSlash(no), `${JSON.stringify(no)} is not a slash command`)
  }
})

// ---------------------------------------------------------------------------
// Round trip — redact, then expand, through a real shell
// ---------------------------------------------------------------------------

/** What bash hands a program when the expanded command runs. */
function throughBash(command) {
  return execFileSync('bash', ['-c', command], { encoding: 'utf8' })
}

const ROUND_TRIP = [
  ['an App Password', PASS, `app password: "${PASS}"`],
  ['a password holding a single quote', "pa'ss w0rd", `app password: "pa'ss w0rd"`],
  ['a password of shell metacharacters', 'p@$$w0rd!;|&', `app password: 'p@$$w0rd!;|&'`],
  ['a password holding a double quote, $ and a backtick', 'has"dq $var `bt` \\back', 'app password: \'has"dq $var `bt` \\back\''],
]

for (const [what, secret, pinning] of ROUND_TRIP) {
  for (const [context, wrap] of [
    ['bare', (t) => t],
    ['single-quoted', (t) => `'${t}'`],
    ['double-quoted', (t) => `"${t}"`],
  ]) {
    await test(`ROUND-TRIP ${what}, ${context}`, async () => {
      const { redact, expand } = await fresh()
      const found = redact(pinning)
      const [token] = passTokens(found.text)
      ok(token, `the pinning form found a password in ${JSON.stringify(pinning)}`)
      ok(!found.text.includes(secret), 'and the prompt no longer holds it')

      const { command, missing } = expand(`printf '%s' ${wrap(token)}`)
      eq(missing.length, 0, 'the vault knows the token')
      ok(!command.includes(token), 'the placeholder was substituted')
      eq(throughBash(command), secret, 'the shell hands the program the original, byte for byte')
    })
  }
}

await test('ROUND-TRIP a username, bare', async () => {
  const { redact, expand } = await fresh()
  const found = redact(`username: ${USER}`)
  const [token] = userTokens(found.text)
  const { command } = expand(`printf '%s' ${token}`)
  eq(throughBash(command), USER, 'the username comes back whole')
})

await test('ROUND-TRIP both halves of a -u pair', async () => {
  const { redact, expand } = await fresh()
  const found = redact(`curl -u ${USER}:"${PASS}" https://wp.test/wp-json`)
  const command = found.text.replace(
    /^curl -u (\S+):"(\S+)".*$/,
    (_m, u, p) => `printf '%s|%s' ${u} "${p}"`,
  )
  const expanded = expand(command)
  eq(expanded.missing.length, 0, 'both tokens are known')
  eq(throughBash(expanded.command), `${USER}|${PASS}`, 'both halves survive the trip')
})

// ---------------------------------------------------------------------------
// Known limitations — recorded, not passed
// ---------------------------------------------------------------------------

await limitation('an empty password', async () => {
  const { redact } = await fresh()
  const r = redact(`curl -u ${USER}:'' https://wp.test/wp-json`)
  eq(shape(r.text), `curl -u <U>:'' https://wp.test/wp-json`, 'recorded behaviour changed')
  eq(r.passes, 0, 'recorded behaviour changed')
  return 'was: the literal two quote characters were minted as a password and the shell got them back re-quoted. The `usable` fix declines the empty half, so the command keeps its own `\'\'` — benign now. Kept on the page because it was one of the two cases flagged as broken; the other, a backslash escape inside a double-quoted `-u` half, is fixed and covered by section F'
})

// ---------------------------------------------------------------------------
// False positives — prose that must survive untouched
// ---------------------------------------------------------------------------

const PROSE = [
  'the user said the deploy went fine',
  'user experience matters more than the theme',
  'a user of the API can read posts',
  'the password reset flow is broken',
  'wp user application-password create smashed',
  'wp user list --role=editor',
  'the slug is abcdefghijklmnopqrstuvwx here',
  'the document id 507f1f77bcf86cd799439011 was updated',
  'password requirements are documented',
  'this user account was created yesterday',
  'each user of the site sees the same page',
  'the login form is on the left',
  'password strength is checked on submit',
]

for (const text of PROSE) {
  await test(`FALSE-POSITIVE ${JSON.stringify(text)}`, async () => {
    const { redact } = await fresh()
    const r = redact(text)
    eq(r.text, text, 'prose rewritten')
    eq(r.users + r.passes, 0, 'something was minted')
  })
}

await test('FALSE-POSITIVE a pinned name is still not hunted inside a word', async () => {
  const { redact } = await fresh()
  redact(`curl -u ${USER}:${PASS_BARE} https://wp.test/wp-json`)
  const r = redact(`the ${USER}_dev branch is stale`)
  eq(r.users, 0, 'smashed_dev is one word')
})

// ---------------------------------------------------------------------------
// The hooks themselves
// ---------------------------------------------------------------------------

/** Collects what `register` registers, so a test can drive one hook. */
function registrations(mod) {
  const found = []
  mod.register((event, matcherOrHook, maybeHook) => {
    const hook = maybeHook ?? matcherOrHook
    const matcher = maybeHook ? matcherOrHook : undefined
    found.push({ event, matcher, hook })
  }, {})
  return {
    all: found,
    find(event, key, value) {
      const hit = found.find(
        (r) => r.event === event && (key === undefined || (r.matcher && r.matcher[key] === value)),
      )
      if (!hit) throw new Error(`no hook registered for ${event} ${key ?? ''}=${value ?? ''}`)
      return hit.hook
    },
  }
}

/** A `$` that records every surface the plugin writes to. */
function engine() {
  const calls = { log: [], toast: [], status: [], notice: [] }
  return {
    calls,
    $: {
      plugin: { name: 'wp-credential-guard', root: HERE },
      ui: {
        log: (text) => calls.log.push(text),
        toast: (text, options) => calls.toast.push({ text, options }),
        status: (text) => calls.status.push(text),
        notice: (id, text) => calls.notice.push({ id, text }),
      },
    },
  }
}

/** A `next` that records what it was handed and answers `answer`. */
function nextThat(answer) {
  const seen = []
  const next = (e) => {
    seen.push(e)
    return Promise.resolve(typeof answer === 'function' ? answer(e) : answer)
  }
  next.seen = seen
  return next
}

await test('HOOK prompt.submit masks and annotates', async () => {
  const mod = await fresh()
  const hook = registrations(mod).find('prompt.submit')
  const { $, calls } = engine()
  const next = nextThat((e) => ({ text: e.text }))

  const r = await hook($, { text: `username: ${USER}, app password: ${PASS}`, origin: { kind: 'user' } }, next)

  eq(next.seen.length, 1, 'the chain ran')
  ok(!next.seen[0].text.includes(PASS), 'the password never reached the model')
  ok(!next.seen[0].text.includes(USER), 'nor did the username')
  ok(Array.isArray(r.context) && r.context.some((c) => c.includes('[WP-USER-xxxx]')), 'the note was appended')
  ok(calls.log.some((l) => l.includes('masked 1 username and 1 password')), 'the count was logged')
})

await test('HOOK prompt.submit leaves a clean prompt alone', async () => {
  const mod = await fresh()
  const hook = registrations(mod).find('prompt.submit')
  const { $, calls } = engine()
  const next = nextThat({ text: 'list the drafts' })

  const r = await hook($, { text: 'list the drafts', origin: { kind: 'user' } }, next)
  eq(r.context, undefined, 'no note on a prompt with nothing in it')
  eq(calls.log.length, 0, 'and nothing logged')
})

await test('HOOK prompt.submit shouts on a slash command', async () => {
  const mod = await fresh()
  const hook = registrations(mod).find('prompt.submit')
  const { $, calls } = engine()

  await hook($, { text: `/wp-deploy ${PASS}`, origin: { kind: 'user' } }, nextThat((e) => ({ text: e.text })))

  ok(calls.log.some((l) => l.includes('refused rather than masked')), 'the warning was logged')
  eq(calls.toast.length, 1, 'one toast')
  eq(calls.toast[0].options.timeoutMs, 20000, 'the toast is given a long timeout')
  eq(calls.status.length, 1, 'the status line was pinned')
  ok(calls.status[0].includes('refused'), 'and it says the prompt was refused')
})

// Rewriting the text is not enough on this path and never was. A live slash
// command carrying a credential reached the model with the `ARGUMENTS:` block
// masked by `skill.prompt` and the `<command-args>` envelope beside it holding
// the real password. Refusing the prompt is what keeps the value out of the
// model's context; the copy on disk is beyond every event in the set.
await test('HOOK prompt.submit refuses a slash command outright', async () => {
  const mod = await fresh()
  const hook = registrations(mod).find('prompt.submit')
  const { $ } = engine()
  const next = nextThat((e) => ({ text: e.text }))

  const r = await hook($, { text: `/wp-deploy ${PASS}`, origin: { kind: 'user' } }, next)

  ok(r.drop !== undefined, 'the prompt is dropped')
  eq(r.text, undefined, 'a drop carries no text')
  eq(next.seen.length, 0, 'and the chain beneath never ran')
  ok(r.drop.includes('the model never read the value'), 'the reason says what it bought')
  ok(
    !/nothing was stored|nothing was sent/.test(r.drop),
    'and does not assert the one thing that was only ever measured on one build',
  )
  ok(r.drop.includes('[WP-PASS-xxxx]'), 'and how to carry on afterwards')
  ok(!r.drop.includes(PASS), 'the reason never repeats the credential')
})

// The way back in after a refusal: a placeholder quoted into a slash command is
// reserved, nothing is minted out of its insides, so the hook stays out of the
// way instead of refusing the retry too.
await test('HOOK prompt.submit lets a placeholder through a slash command', async () => {
  const mod = await fresh()
  const hook = registrations(mod).find('prompt.submit')
  const { $, calls } = engine()

  const token = mod.redact(`app password: ${PASS}`).text.match(/\[WP-PASS-[0-9a-f]{4}\]/)[0]
  const next = nextThat((e) => ({ text: e.text }))
  const r = await hook($, { text: `/wp-deploy ${token}`, origin: { kind: 'user' } }, next)

  eq(r.drop, undefined, 'not refused')
  eq(next.seen.length, 1, 'the chain beneath ran')
  eq(next.seen[0].text, `/wp-deploy ${token}`, 'and the text was left alone')
  eq(calls.toast.length, 0, 'nothing shouted')
})

await test('HOOK prompt.submit hedges on an ordinary prompt', async () => {
  const mod = await fresh()
  const hook = registrations(mod).find('prompt.submit')
  const { $, calls } = engine()

  await hook($, { text: `app password: ${PASS}`, origin: { kind: 'user' } }, nextThat((e) => ({ text: e.text })))

  eq(calls.toast.length, 0, 'no toast')
  eq(calls.status.length, 0, 'no pinned line')
  ok(calls.log.some((l) => l.includes('if that was a slash command')), 'but it still says something')
})

await test('HOOK prompt.submit passes a drop through', async () => {
  const mod = await fresh()
  const hook = registrations(mod).find('prompt.submit')
  const { $ } = engine()

  const r = await hook($, { text: `app password: ${PASS}`, origin: { kind: 'user' } }, nextThat({ drop: 'no' }))
  eq(r.drop, 'no', 'the drop survives')
  eq(r.context, undefined, 'and no note is stapled to it')
})

await test('HOOK ui.render rewrites the row and keeps the origin', async () => {
  const mod = await fresh()
  const hook = registrations(mod).find('ui.render', 'component', 'UserMessage')
  const { $ } = engine()
  const next = nextThat({ type: 'engine', ref: 1 })
  const origin = { kind: 'user' }

  await hook($, {
    surface: 'terminal',
    component: 'UserMessage',
    requestId: 'm1',
    props: { text: `app password: ${PASS}`, origin },
  }, next)

  ok(!next.seen[0].props.text.includes(PASS), 'the screen no longer shows it')
  eq(next.seen[0].props.origin, origin, 'origin is carried on as received')
})

await test('HOOK tool.call Skill masks its args', async () => {
  const mod = await fresh()
  const hook = registrations(mod).find('tool.call', 'tool', 'Skill')
  const { $ } = engine()
  const next = nextThat({ result: {} })

  await hook($, { tool: 'Skill', tool_use_id: 't1', skill: 'deploy', args: `app password: ${PASS}` }, next)
  ok(!next.seen[0].args.includes(PASS), 'the skill never sees it')

  const bare = nextThat({ result: {} })
  await hook($, { tool: 'Skill', tool_use_id: 't2', skill: 'deploy' }, bare)
  eq(bare.seen[0].args, undefined, 'a call with no args passes through')
})

await test('HOOK skill.prompt masks the expanded text', async () => {
  const mod = await fresh()
  const hook = registrations(mod).find('skill.prompt')
  const { $, calls } = engine()

  const r = await hook($, { skill: 'deploy', text: 'ARGUMENTS: x' }, nextThat({ text: `app password: ${PASS}` }))
  ok(!r.text.includes(PASS), 'the model reads the mask')
  eq(Object.keys(r).join(), 'text', 'the result is a SkillPromptResult')
  eq(calls.log.length, 0, 'and it says nothing on a path the user cannot act on')
})

await test('HOOK Bash substitutes a known placeholder', async () => {
  const mod = await fresh()
  const reg = registrations(mod)
  const { $ } = engine()

  const found = mod.redact(`curl -u ${USER}:"${PASS}" https://wp.test/wp-json`)
  const hook = reg.find('tool.call', 'tool', 'Bash')
  const next = nextThat({ result: {} })

  await hook($, { tool: 'Bash', tool_use_id: 'b1', command: found.text }, next)
  eq(next.seen.length, 1, 'the call was let through')
  ok(next.seen[0].command.includes(PASS), 'the real password reached the shell')
  ok(!tokensIn(next.seen[0].command).length, 'and no placeholder is left in it')
})

await test('HOOK Bash leaves a command with no placeholder alone', async () => {
  const mod = await fresh()
  const hook = registrations(mod).find('tool.call', 'tool', 'Bash')
  const { $ } = engine()
  const next = nextThat({ result: {} })

  await hook($, { tool: 'Bash', tool_use_id: 'b2', command: 'ls -la' }, next)
  eq(next.seen[0].command, 'ls -la', 'untouched')
})

await test('HOOK Bash denies a placeholder the vault has never held', async () => {
  const mod = await fresh()
  const hook = registrations(mod).find('tool.call', 'tool', 'Bash')
  const { $ } = engine()
  const next = nextThat({ result: {} })

  const r = await hook($, {
    tool: 'Bash',
    tool_use_id: 'b3',
    command: 'curl -u [WP-USER-dead]:[WP-PASS-beef] https://wp.test/wp-json',
  }, next)

  eq(next.seen.length, 0, 'the chain never ran')
  ok(typeof r.deny === 'string', 'the call was denied')
  ok(r.deny.includes('[WP-USER-dead]'), 'the deny names the first token')
  ok(r.deny.includes('[WP-PASS-beef]'), 'and the second')
  ok(r.deny.includes('session-scoped'), 'and says why')
})

await test('HOOK Bash denies when only one of two tokens is unknown', async () => {
  const mod = await fresh()
  const hook = registrations(mod).find('tool.call', 'tool', 'Bash')
  const { $ } = engine()

  const found = mod.redact(`username: ${USER}`)
  const [known] = userTokens(found.text)
  const r = await hook($, {
    tool: 'Bash',
    tool_use_id: 'b4',
    command: `curl -u ${known}:[WP-PASS-beef] https://wp.test/wp-json`,
  }, nextThat({ result: {} }))

  ok(typeof r.deny === 'string', 'denied')
  ok(!r.deny.includes(known), 'the known token is not named')
  ok(!r.deny.includes(USER), 'and no real credential is in the message the model reads')
})

await test('HOOK registrations are the five the plugin documents', async () => {
  const mod = await fresh()
  const { all } = registrations(mod)
  eq(all.length, 5, 'five hooks')
  eq(
    all.map((r) => r.event).join(','),
    'prompt.submit,skill.prompt,tool.call,ui.render,tool.call',
    'in registration order',
  )
})

// ---------------------------------------------------------------------------
// The vault
// ---------------------------------------------------------------------------

await test('VAULT one credential keeps one placeholder', async () => {
  const { redact } = await fresh()
  const a = redact(`app password: ${PASS}`)
  const b = redact(`again, app password: ${PASS}`)
  eq(passTokens(a.text)[0], passTokens(b.text)[0], 'the same token twice')
})

await test('VAULT a new session gives a different placeholder', async () => {
  const one = await fresh()
  const two = await fresh()
  const a = passTokens(one.redact(`app password: ${PASS}`).text)[0]
  const b = passTokens(two.redact(`app password: ${PASS}`).text)[0]
  ok(a !== b, `the salt should differ between sessions (${a} vs ${b})`)
})

await test('VAULT a user and a password never collide', async () => {
  const { redact, valueOf } = await fresh()
  const r = redact(`username: ${USER} and app password: ${PASS}`)
  const [u] = userTokens(r.text)
  const [p] = passTokens(r.text)
  eq(valueOf.get(u), USER, 'the user token holds the user')
  eq(valueOf.get(p), PASS, 'the pass token holds the password')
})

await test('VAULT nothing ever hands a value back out', async () => {
  const mod = await fresh()
  ok(mod.register, 'register is exported')
  eq(
    Object.keys(mod).filter((k) => k !== 'register' && !EXPOSE.includes(k)).length,
    0,
    'the plugin exports only register (the rest is the harness prying it open)',
  )
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const line = '-'.repeat(72)
console.log(line)
for (const f of failures) console.log(`FAIL  ${f.name}\n      ${f.message.replace(/\n/g, '\n      ')}`)
if (failures.length) console.log(line)

for (const l of limitations) {
  console.log(`${l.held ? 'LIMIT' : 'MOVED'} ${l.name}\n      ${l.note}`)
}
if (limitations.length) console.log(line)

console.log(`passed ${passed}   failed ${failures.length}   known limitations ${limitations.length}`)
process.exit(failures.length || limitations.some((l) => !l.held) ? 1 : 0)
