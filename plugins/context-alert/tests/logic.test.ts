import { test, describe, expect } from 'claude-code/testing'
import {
  DEFAULTS, emptyState, parseSet, mergeConfig, nextThreshold, shouldFire, rearm,
  extractHandoffPath, extractSkillHandoffPath, staleSessionKeys, formatTokens,
  shortPath, questionText, dialogOptions, resetTiers, isMarkdownWrite, shouldToast, handoffPathFromWrite, extractSlashHandoffPath,
  classifyAskError, isBusyStatus, skillNameOf, crossed, belowFirst,
  effectiveReserve, waitDecision, roomLeft, cycleAllowed, withAutoStart, appendInstructions, dirWithSlash,
} from '../hooks/logic'

const EITHER = { ...DEFAULTS, trigger: 'either' as const }
const asked = (pct: number, tokens: number) => ({ asked: [{ pct, tokens, at: 1 }] })

describe('thresholds', () => {
  test('percent fires first on a small window', () => {
    expect(shouldFire(emptyState(), EITHER, 41, 82000)).toBe(true)
  })
  test('tokens fire first on a big window', () => {
    expect(shouldFire(emptyState(), EITHER, 31, 310000)).toBe(true)
  })
  test('below both stays quiet', () => {
    expect(shouldFire(emptyState(), EITHER, 39, 299999)).toBe(false)
  })
  test('undefined figures never fire', () => {
    expect(shouldFire(emptyState(), EITHER, undefined, 900000)).toBe(false)
    expect(shouldFire(emptyState(), EITHER, 90, undefined)).toBe(false)
  })
  test('disabled never fires', () => {
    expect(shouldFire(emptyState(), { ...EITHER, mode: 'off' }, 90, 900000)).toBe(false)
  })
  test('re-asks at +15 points or +150k tokens', () => {
    const s = asked(41, 410000)
    expect(nextThreshold(s, DEFAULTS)).toEqual({ pct: 56, tokens: 560000 })
    expect(shouldFire(s, EITHER, 55, 500000)).toBe(false)
    expect(shouldFire(s, EITHER, 56, 500000)).toBe(true)
    expect(shouldFire(s, EITHER, 50, 560000)).toBe(true)
  })
  test('re-arms after a drop below the first threshold on both measures', () => {
    const s = asked(41, 410000)
    expect(rearm(s, EITHER, 5, 50000).asked).toEqual([])
    expect(rearm(s, EITHER, 5, 310000).asked.length).toBe(1)
    expect(rearm(s, EITHER, 45, 50000).asked.length).toBe(1)
    expect(rearm(s, EITHER, undefined, undefined).asked.length).toBe(1)
  })
})

describe('config', () => {
  test('accepts valid values', () => {
    expect(parseSet('percent', '20')).toEqual({ ok: true, key: 'percent', value: 20 })
    expect(parseSet('notify', 'false')).toEqual({ ok: true, key: 'notify', value: false })
    expect(parseSet('whenBusy', 'suggest')).toEqual({ ok: true, key: 'whenBusy', value: 'suggest' })
  })
  test('continue takes on/off (and true/false); it is on by default, also for an old config without the key', () => {
    expect(DEFAULTS.continue).toBe(true)
    expect(parseSet('continue', 'off')).toEqual({ ok: true, key: 'continue', value: false })
    expect(parseSet('continue', 'on')).toEqual({ ok: true, key: 'continue', value: true })
    expect(parseSet('continue', 'false')).toEqual({ ok: true, key: 'continue', value: false })
    expect(parseSet('continue', 'maybe').ok).toBe(false)
    expect(mergeConfig({ enabled: true, notify: false, percent: 30 }).continue).toBe(true)
    expect(mergeConfig({ continue: false }).continue).toBe(false)
    expect(mergeConfig({ continue: 'off' }).continue).toBe(true) // not a boolean: the default
  })
  test('refuses bad input', () => {
    expect(parseSet('bogus', '1').ok).toBe(false)
    expect(parseSet('percent', 'abc').ok).toBe(false)
    expect(parseSet('percent', '150').ok).toBe(false)
    expect(parseSet('percent', '0').ok).toBe(false)
    expect(parseSet('tokens', '1.5').ok).toBe(false)
    expect(parseSet('notify', 'yes').ok).toBe(false)
    expect(parseSet('whenBusy', 'x').ok).toBe(false)
  })
  test('mergeConfig falls back to defaults on junk', () => {
    expect(mergeConfig(null)).toEqual(DEFAULTS)
    expect(mergeConfig({ percent: 'x', tokens: 5000, whenBusy: 'suggest' }).tokens).toBe(5000)
    expect(mergeConfig({ percent: 'x' }).percent).toBe(40)
  })
})

describe('handoff path', () => {
  test('from command args', () => {
    expect(extractHandoffPath('handoff/20261027_02_slug.md')).toBe('handoff/20261027_02_slug.md')
    expect(extractHandoffPath('"my dir/x.md"')).toBe('my dir/x.md')
    expect(extractHandoffPath('')).toBeUndefined()
    expect(extractHandoffPath('please write one')).toBeUndefined()
    expect(extractHandoffPath(undefined)).toBeUndefined()
  })
  test('from the Skill tool input', () => {
    expect(extractSkillHandoffPath({ skill: 'handoff-doc', args: 'a/b.md' })).toBe('a/b.md')
    expect(extractSkillHandoffPath({ skill: 'context-alert:handoff-doc', args: 'a/b.md' })).toBe('a/b.md')
    expect(extractSkillHandoffPath({ skill: 'other', args: 'a/b.md' })).toBeUndefined()
    expect(extractSkillHandoffPath({ skill: 'handoff-doc' })).toBeUndefined()
    expect(extractSkillHandoffPath('nope')).toBeUndefined()
  })
})

describe('pruning and labels', () => {
  const now = 100 * 86400000
  test('prunes sessions older than 30 days only', () => {
    const keys = staleSessionKeys({
      'session:old': { updatedAt: now - 31 * 86400000 },
      'session:new': { updatedAt: now - 1000 },
      'session:none': {},
      config: { updatedAt: 0 },
    }, now)
    expect(keys.sort()).toEqual(['session:none', 'session:old'])
  })
  test('formats', () => {
    expect(formatTokens(410000)).toBe('410k')
    expect(formatTokens(1000000)).toBe('1M')
    expect(formatTokens(500)).toBe('500')
    expect(shortPath('/a/b/handoff/x.md')).toBe('…/handoff/x.md')
    expect(dialogOptions(undefined)).toEqual({
      thenCompact: 'Handoff, then compact', only: 'Handoff only', compact: 'Compact now', notNow: 'Not now',
    })
    expect(dialogOptions('/a/b/c.md').thenCompact).toBe('Update handoff, then compact')
    expect(dialogOptions('/a/b/c.md').only).toBe('Update handoff only')
    expect(questionText(41, 410000, 1000000)).toBe(
      'The context window is now at 41% (410k of 1M tokens). Write a handoff doc before compaction?')
    expect(questionText(41, 410000, 1000000, '/a/b/c.md')).toContain('Handoff doc: …/b/c.md')
  })
})

describe('mid-turn toast', () => {
  test('toasts once per tier and re-arms with the tiers', () => {
    const t = nextThreshold(emptyState(), DEFAULTS)
    expect(shouldToast(emptyState(), EITHER, 45, 450000)).toBe(true)
    const toasted = { ...emptyState(), toastedAt: t }
    expect(shouldToast(toasted, EITHER, 46, 460000)).toBe(false)
    expect(shouldToast(toasted, { ...EITHER, midTurnToast: false }, 90, 900000)).toBe(false)
    expect(rearm(toasted, EITHER, 5, 50000).toastedAt).toBeUndefined()
  })
})

describe('path-like tightening', () => {
  test('and/or, w/, URLs and plain words are not paths', () => {
    expect(extractHandoffPath('update and/or append')).toBeUndefined()
    expect(extractHandoffPath('w/ notes')).toBeUndefined()
    expect(extractHandoffPath('see https://example.com/page')).toBeUndefined()
    expect(extractHandoffPath('src/handoff')).toBeUndefined()
  })
  test('a suffix or a leading /, ./ or ~ is a path', () => {
    expect(extractHandoffPath('/tmp/h')).toBe('/tmp/h')
    expect(extractHandoffPath('./h/x')).toBe('./h/x')
    expect(extractHandoffPath('~/h')).toBe('~/h')
    expect(extractHandoffPath('notes.txt')).toBe('notes.txt')
    expect(extractHandoffPath('H/X.MD')).toBe('H/X.MD')
    expect(extractHandoffPath('update and/or /p/h/x.md')).toBe('/p/h/x.md')
  })
})

describe('write recorder', () => {
  test('Write and Edit of a .md under handoff/', () => {
    expect(handoffPathFromWrite('Write', '/p/handoff/a.md')).toBe('/p/handoff/a.md')
    expect(handoffPathFromWrite('Edit', 'handoff/a.md')).toBe('handoff/a.md')
    expect(handoffPathFromWrite('Write', '/p/handoff/sub/a.md')).toBe('/p/handoff/sub/a.md')
  })
  test('anything else is ignored', () => {
    expect(handoffPathFromWrite('Read', '/p/handoff/a.md')).toBeUndefined()
    expect(handoffPathFromWrite('Write', '/p/handoff/a.txt')).toBeUndefined()
    expect(handoffPathFromWrite('Write', '/p/handoffs/a.md')).toBeUndefined()
    expect(handoffPathFromWrite('Write', '/p/notes/handoff.md')).toBeUndefined()
    expect(handoffPathFromWrite('Write', undefined)).toBeUndefined()
  })
})

describe('slash command in a user message', () => {
  test('typed form and command markup', () => {
    expect(extractSlashHandoffPath('/handoff-doc /p/h/a.md')).toBe('/p/h/a.md')
    expect(extractSlashHandoffPath('/context-alert:handoff-doc "my dir/a.md"')).toBe('my dir/a.md')
    expect(extractSlashHandoffPath('<command-name>/handoff-doc</command-name>\n<command-args>/p/h/a.md</command-args>')).toBe('/p/h/a.md')
  })
  test('other text is ignored', () => {
    expect(extractSlashHandoffPath('please run /handoff-doc later')).toBeUndefined()
    expect(extractSlashHandoffPath('/handoff-doc')).toBeUndefined()
    expect(extractSlashHandoffPath('/other /p/h/a.md')).toBeUndefined()
    expect(extractSlashHandoffPath(undefined)).toBeUndefined()
  })
})

describe('busy status, ask failure and skill name helpers', () => {
  test('busy statuses', () => {
    for (const s of ['pending', 'running', 'waiting']) expect(isBusyStatus(s)).toBe(true)
    for (const s of ['idle', 'completed', 'failed', 'killed', undefined]) expect(isBusyStatus(s)).toBe(false)
  })
  test('ask failures: only a clear refusal is a refusal', () => {
    expect(classifyAskError(new Error('dismissed')).kind).toBe('dismissed')
    expect(classifyAskError(new Error('The user cancelled')).kind).toBe('dismissed')
    expect(classifyAskError(new Error('Another dialog is already open')).kind).toBe('refused')
    expect(classifyAskError(new Error('denied by a hook: busy')).kind).toBe('refused')
    expect(classifyAskError(new Error('no one to ask')).kind).toBe('unknown')
    expect(classifyAskError('weird').reason).toBe('weird')
  })
  test('skill name at the top level or under input', () => {
    expect(skillNameOf({ skill: 'handoff-doc' })).toBe('handoff-doc')
    expect(skillNameOf({ input: { skill: 'x:handoff-doc' } })).toBe('x:handoff-doc')
    expect(skillNameOf(null)).toBeUndefined()
  })
})

describe('compaction resets the tiers', () => {
  test('resetTiers clears asked and toastedAt whatever the fill', () => {
    const s = { asked: [{ pct: 12, tokens: 118000, at: 1 }], handoff: '/h.md', toastedAt: { pct: 27, tokens: 268000 } }
    const r = resetTiers(s)
    expect(r.asked).toEqual([])
    expect(r.toastedAt).toBeUndefined()
    expect(r.handoff).toBe('/h.md')
    expect(nextThreshold(r, DEFAULTS)).toEqual({ pct: 40, tokens: 300000 })
    const empty = emptyState()
    expect(resetTiers(empty)).toBe(empty)
  })
  test('isMarkdownWrite', () => {
    expect(isMarkdownWrite('Write', '/x/notes/plan.md')).toBe(true)
    expect(isMarkdownWrite('Edit', 'README.MD')).toBe(true)
    expect(isMarkdownWrite('Write', '/x/a.ts')).toBe(false)
    expect(isMarkdownWrite('Read', '/x/a.md')).toBe(false)
    expect(isMarkdownWrite('Write', undefined)).toBe(false)
  })
})

describe('trigger mode', () => {
  const P = { ...DEFAULTS, percent: 35 }
  const T = { ...DEFAULTS, trigger: 'tokens' as const }
  test('default trigger is percent', () => {
    expect(DEFAULTS.trigger).toBe('percent')
    expect(mergeConfig(null).trigger).toBe('percent')
  })
  test('mergeConfig: missing or invalid trigger reads as percent, valid kept', () => {
    expect(mergeConfig({ percent: 50 }).trigger).toBe('percent')
    expect(mergeConfig({ trigger: 'bogus' }).trigger).toBe('percent')
    expect(mergeConfig({ trigger: 5 }).trigger).toBe('percent')
    expect(mergeConfig({ trigger: 'tokens' }).trigger).toBe('tokens')
    expect(mergeConfig({ trigger: 'either' }).trigger).toBe('either')
  })
  test('parseSet trigger', () => {
    expect(parseSet('trigger', 'either')).toEqual({ ok: true, key: 'trigger', value: 'either' })
    expect(parseSet('trigger', ' tokens ')).toEqual({ ok: true, key: 'trigger', value: 'tokens' })
    expect(parseSet('trigger', 'percent').ok).toBe(true)
    expect(parseSet('trigger', 'both').ok).toBe(false)
  })
  test('percent mode ignores tokens: 30% / 300k does not fire for percent 35', () => {
    expect(shouldFire(emptyState(), P, 30, 300000)).toBe(false)
    expect(shouldFire(emptyState(), P, 35, 10000)).toBe(true)
  })
  test('tokens mode ignores percent', () => {
    expect(shouldFire(emptyState(), T, 90, 100000)).toBe(false)
    expect(shouldFire(emptyState(), T, 10, 300000)).toBe(true)
  })
  test('either fires on whichever is crossed', () => {
    expect(shouldFire(emptyState(), EITHER, 41, 1000)).toBe(true)
    expect(shouldFire(emptyState(), EITHER, 1, 300000)).toBe(true)
    expect(shouldFire(emptyState(), EITHER, 39, 299999)).toBe(false)
  })
  test('unknown percent or tokens never fires, in every mode', () => {
    for (const c of [DEFAULTS, T, EITHER]) {
      expect(shouldFire(emptyState(), c, undefined, 900000)).toBe(false)
      expect(shouldFire(emptyState(), c, 90, undefined)).toBe(false)
    }
  })
  test('steps follow the mode', () => {
    const s = asked(41, 410000) // next: 56% / 560k
    expect(shouldFire(s, DEFAULTS, 50, 560000)).toBe(false)
    expect(shouldFire(s, DEFAULTS, 56, 100)).toBe(true)
    expect(shouldFire(s, T, 90, 559999)).toBe(false)
    expect(shouldFire(s, T, 1, 560000)).toBe(true)
    expect(shouldFire(s, EITHER, 50, 560000)).toBe(true)
  })
  test('crossed and belowFirst', () => {
    expect(crossed(DEFAULTS, { pct: 40, tokens: 300000 }, 30, 999999)).toBe(false)
    expect(belowFirst(DEFAULTS, 30, 999999)).toBe(true)
    expect(belowFirst(T, 90, 299999)).toBe(true)
    expect(belowFirst(EITHER, 30, 300000)).toBe(false)
    expect(belowFirst(EITHER, undefined, 1)).toBe(false)
  })
  test('rearm in percent mode ignores tokens', () => {
    const s = asked(41, 410000)
    expect(rearm(s, DEFAULTS, 5, 900000).asked).toEqual([])
    expect(rearm(s, T, 90, 50000).asked).toEqual([])
    expect(rearm(s, EITHER, 5, 900000).asked.length).toBe(1)
  })
  test('shouldToast in percent mode ignores tokens', () => {
    expect(shouldToast(emptyState(), DEFAULTS, 30, 900000)).toBe(false)
    expect(shouldToast(emptyState(), DEFAULTS, 41, 1000)).toBe(true)
    expect(shouldToast(emptyState(), T, 90, 1000)).toBe(false)
  })
})

describe('autopilot (0.3.0): config', () => {
  test('defaults', () => {
    expect(DEFAULTS).toMatchObject({
      mode: 'ask', maxWait: 20, reserve: 'auto', maxCycles: 3, cycleWindow: 60, focusAutoCompact: true, afterAutoCompact: true, handoffDir: '',
    })
  })
  test('mergeConfig migrates enabled: false to off, otherwise ask; mode wins over enabled', () => {
    expect(mergeConfig({ enabled: false }).mode).toBe('off')
    expect(mergeConfig({ enabled: true }).mode).toBe('ask')
    expect(mergeConfig({}).mode).toBe('ask')
    expect(mergeConfig(undefined).mode).toBe('ask')
    expect(mergeConfig({ mode: 'auto', enabled: false }).mode).toBe('auto')
    expect(mergeConfig({ mode: 'off' }).mode).toBe('off')
    expect(mergeConfig({ mode: 'loud', enabled: false }).mode).toBe('off')
    expect(mergeConfig({ mode: 'loud' }).mode).toBe('ask')
  })
  test('mergeConfig keeps zeros for the limits that allow them, and refuses negatives and junk', () => {
    const c = mergeConfig({ maxWait: 0, reserve: 0, maxCycles: 0, cycleWindow: 0 })
    expect(c.maxWait).toBe(0)
    expect(c.reserve).toBe(0)
    expect(c.maxCycles).toBe(0)
    expect(c.cycleWindow).toBe(60) // 0 is not a window
    const d = mergeConfig({ maxWait: -1, reserve: 'x', maxCycles: Number.NaN, handoffDir: 5, focusAutoCompact: 'no' })
    expect(d).toMatchObject({ maxWait: 20, reserve: 'auto', maxCycles: 3, handoffDir: '', focusAutoCompact: true })
    expect(mergeConfig({ handoffDir: ' /p/h ', focusAutoCompact: false, afterAutoCompact: false })).toMatchObject({
      handoffDir: '/p/h', focusAutoCompact: false, afterAutoCompact: false,
    })
  })
  test('parseSet: mode', () => {
    expect(parseSet('mode', 'auto')).toEqual({ ok: true, key: 'mode', value: 'auto' })
    expect(parseSet('mode', 'ASK')).toEqual({ ok: true, key: 'mode', value: 'ask' })
    expect(parseSet('mode', 'off')).toEqual({ ok: true, key: 'mode', value: 'off' })
    expect(parseSet('mode', 'on').ok).toBe(false)
  })
  test('parseSet: enabled is an alias of mode ask / off', () => {
    expect(parseSet('enabled', 'on')).toEqual({ ok: true, key: 'mode', value: 'ask' })
    expect(parseSet('enabled', 'true')).toEqual({ ok: true, key: 'mode', value: 'ask' })
    expect(parseSet('enabled', 'off')).toEqual({ ok: true, key: 'mode', value: 'off' })
    expect(parseSet('enabled', 'False')).toEqual({ ok: true, key: 'mode', value: 'off' })
    expect(parseSet('enabled', 'auto').ok).toBe(false)
  })
  test('parseSet: zero-allowed numbers', () => {
    for (const k of ['maxWait', 'reserve', 'maxCycles']) expect(parseSet(k, '0')).toEqual({ ok: true, key: k, value: 0 })
    expect(parseSet('maxWait', '2.5')).toEqual({ ok: true, key: 'maxWait', value: 2.5 })
    expect(parseSet('reserve', '80000')).toEqual({ ok: true, key: 'reserve', value: 80000 })
    expect(parseSet('reserve', '1.5').ok).toBe(false)
    expect(parseSet('maxCycles', '2.5').ok).toBe(false)
    expect(parseSet('maxWait', '-3').ok).toBe(false)
    expect(parseSet('maxWait', 'abc').ok).toBe(false)
  })
  test('parseSet: positive numbers refuse 0 (cycleWindow, and the old keys)', () => {
    expect(parseSet('cycleWindow', '30')).toEqual({ ok: true, key: 'cycleWindow', value: 30 })
    expect(parseSet('cycleWindow', '0').ok).toBe(false)
    expect(parseSet('percent', '0').ok).toBe(false)
    expect(parseSet('tokens', '0').ok).toBe(false)
  })
  test('parseSet: the new booleans', () => {
    expect(parseSet('focusAutoCompact', 'off')).toEqual({ ok: true, key: 'focusAutoCompact', value: false })
    expect(parseSet('afterAutoCompact', 'On')).toEqual({ ok: true, key: 'afterAutoCompact', value: true })
    expect(parseSet('afterAutoCompact', 'maybe').ok).toBe(false)
  })
  test('parseSet: handoffDir is a string and none clears it', () => {
    expect(parseSet('handoffDir', ' /p/notes ')).toEqual({ ok: true, key: 'handoffDir', value: '/p/notes' })
    expect(parseSet('handoffDir', 'none')).toEqual({ ok: true, key: 'handoffDir', value: '' })
    expect(parseSet('handoffDir', 'NONE')).toEqual({ ok: true, key: 'handoffDir', value: '' })
    expect(parseSet('handoffDir', '').ok).toBe(false)
  })
  test('parseSet: the unknown-key message lists the new keys', () => {
    const r = parseSet('nope', '1')
    expect(r.ok).toBe(false)
    for (const k of ['mode', 'maxWait', 'reserve', 'maxCycles', 'cycleWindow', 'focusAutoCompact', 'afterAutoCompact', 'handoffDir']) {
      expect((r as { error: string }).error).toContain(k)
    }
  })
  test('mode off never fires; auto and ask do', () => {
    expect(shouldFire(emptyState(), { ...DEFAULTS, mode: 'off' }, 90, 900000)).toBe(false)
    expect(shouldFire(emptyState(), { ...DEFAULTS, mode: 'auto' }, 90, 900000)).toBe(true)
    expect(shouldFire(emptyState(), { ...DEFAULTS, mode: 'ask' }, 90, 900000)).toBe(true)
  })
  test('rearm below the first threshold also lets go of the loop breaker hold', () => {
    const held = { asked: [], autoHeld: true }
    expect(rearm(held, DEFAULTS, 10, 100000).autoHeld).toBeUndefined()
    expect(rearm(held, DEFAULTS, 50, 500000).autoHeld).toBe(true)
    expect(rearm(held, DEFAULTS, undefined, undefined).autoHeld).toBe(true)
  })
})

describe('autopilot (0.3.0): wait or go, cycles', () => {
  const base = { busy: true, room: 200_000, reserve: 80_000, waitedMs: 0, maxWaitMs: 20 * 60_000, auto: true }
  test('no agent busy: go', () => {
    expect(waitDecision({ ...base, busy: false })).toEqual({ go: true, why: 'no-agents' })
  })
  test('room under reserve: go, for any flow', () => {
    expect(waitDecision({ ...base, room: 79_999 })).toEqual({ go: true, why: 'room' })
    expect(waitDecision({ ...base, room: 79_999, auto: false })).toEqual({ go: true, why: 'room' })
    expect(waitDecision({ ...base, room: 80_000 }).go).toBe(false)
    expect(waitDecision({ ...base, room: -5 }).why).toBe('room') // already past the threshold
  })
  test('unknown room is never "no room"; reserve 0 is no check', () => {
    expect(waitDecision({ ...base, room: undefined }).go).toBe(false)
    expect(waitDecision({ ...base, room: 1, reserve: 0 }).go).toBe(false)
  })
  test('maxWait: auto flows only; 0 is no limit', () => {
    expect(waitDecision({ ...base, waitedMs: 20 * 60_000 })).toEqual({ go: true, why: 'maxWait' })
    expect(waitDecision({ ...base, waitedMs: 20 * 60_000 - 1 }).go).toBe(false)
    expect(waitDecision({ ...base, waitedMs: 99 * 60_000, auto: false }).go).toBe(false)
    expect(waitDecision({ ...base, waitedMs: 99 * 60_000, maxWaitMs: 0 }).go).toBe(false)
  })
  test('room wins over maxWait when both apply', () => {
    expect(waitDecision({ ...base, room: 1, waitedMs: 99 * 60_000 }).why).toBe('room')
  })
  test('roomLeft', () => {
    expect(roomLeft(500_000, 450_000)).toBe(50_000)
    expect(roomLeft(undefined, 450_000)).toBeUndefined()
    expect(roomLeft(500_000, undefined)).toBeUndefined()
  })
  test('cycleAllowed: counts starts inside the window; maxCycles 0 is no cap', () => {
    const cfg = { maxCycles: 2, cycleWindow: 60 }
    const now = 1_000_000_000
    expect(cycleAllowed([], now, cfg)).toEqual({ ok: true, count: 0 })
    expect(cycleAllowed(undefined, now, cfg)).toEqual({ ok: true, count: 0 })
    expect(cycleAllowed([now - 1000], now, cfg)).toEqual({ ok: true, count: 1 })
    expect(cycleAllowed([now - 1000, now - 2000], now, cfg)).toEqual({ ok: false, count: 2 })
    expect(cycleAllowed([now - 61 * 60_000, now - 2000], now, cfg)).toEqual({ ok: true, count: 1 })
    expect(cycleAllowed([now - 60 * 60_000, now - 2000], now, cfg).count).toBe(1) // exactly the window old has left it
    expect(cycleAllowed([1, 2, 3, 4, 5].map((i) => now - i), now, { maxCycles: 0, cycleWindow: 60 }).ok).toBe(true)
  })
  test('withAutoStart appends and drops the old ones', () => {
    const s = withAutoStart({ asked: [], autoStarts: [1, 999_999_000] }, 1_000_000_000, { cycleWindow: 60 })
    expect(s.autoStarts).toEqual([999_999_000, 1_000_000_000])
  })
  test('appendInstructions and dirWithSlash', () => {
    expect(appendInstructions(undefined, 'F')).toBe('F')
    expect(appendInstructions('  ', 'F')).toBe('F')
    expect(appendInstructions('mine', 'F')).toBe('mine\n\nF')
    expect(dirWithSlash('')).toBe('./handoff/')
    expect(dirWithSlash(undefined)).toBe('./handoff/')
    expect(dirWithSlash('/a/b')).toBe('/a/b/')
    expect(dirWithSlash('/a/b/')).toBe('/a/b/')
  })
})

describe('autopilot after review 03', () => {
  test('effectiveReserve: auto scales with the threshold, capped at 80k; a number is used as is', () => {
    expect(effectiveReserve('auto', 167_000)).toBe(25_050) // a 200k window
    expect(effectiveReserve('auto', 967_000)).toBe(80_000) // a 1M window
    expect(effectiveReserve('auto', 500_000)).toBe(75_000)
    expect(effectiveReserve('auto', undefined)).toBe(0) // unknown threshold: no check
    expect(effectiveReserve(80_000, 167_000)).toBe(80_000)
    expect(effectiveReserve(0, 967_000)).toBe(0)
    expect(effectiveReserve(12_345, undefined)).toBe(12_345)
  })
  test('reserve: auto is stored as auto, numbers as numbers, junk falls back to auto', () => {
    expect(mergeConfig({ reserve: 'auto' }).reserve).toBe('auto')
    expect(mergeConfig({ reserve: 0 }).reserve).toBe(0)
    expect(mergeConfig({ reserve: 50_000 }).reserve).toBe(50_000)
    expect(mergeConfig({ reserve: 1.5 }).reserve).toBe('auto')
    expect(mergeConfig({ reserve: -1 }).reserve).toBe('auto')
    expect(mergeConfig({ reserve: 'lots' }).reserve).toBe('auto')
  })
  test('parseSet reserve: auto, default, whole numbers, zero; decimals and junk refused', () => {
    expect(parseSet('reserve', 'auto')).toEqual({ ok: true, key: 'reserve', value: 'auto' })
    expect(parseSet('reserve', 'Default')).toEqual({ ok: true, key: 'reserve', value: 'auto' })
    expect(parseSet('reserve', '0')).toEqual({ ok: true, key: 'reserve', value: 0 })
    expect(parseSet('reserve', '80000')).toEqual({ ok: true, key: 'reserve', value: 80000 })
    expect(parseSet('reserve', '1.5').ok).toBe(false)
    expect(parseSet('reserve', '-5').ok).toBe(false)
    expect(parseSet('reserve', 'lots').ok).toBe(false)
  })
  test('decimals: maxWait and cycleWindow take them, reserve and maxCycles do not (D41)', () => {
    expect(parseSet('maxWait', '0.5')).toEqual({ ok: true, key: 'maxWait', value: 0.5 })
    expect(parseSet('cycleWindow', '0.5')).toEqual({ ok: true, key: 'cycleWindow', value: 0.5 })
    expect(parseSet('reserve', '0.5').ok).toBe(false)
    expect(parseSet('maxCycles', '0.5').ok).toBe(false)
  })
})
