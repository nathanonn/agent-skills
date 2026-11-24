// Pure logic for context-alert. No `$` calls here.

export type Trigger = 'percent' | 'tokens' | 'either'
export const TRIGGERS: readonly Trigger[] = ['percent', 'tokens', 'either']

export type Mode = 'auto' | 'ask' | 'off'
export const MODES: readonly Mode[] = ['auto', 'ask', 'off']

export type Config = {
  /** `auto`: a crossing starts the handoff-compact flow, no dialog. `ask`: the dialog. `off`: no alerts. */
  mode: Mode
  trigger: Trigger
  percent: number
  tokens: number
  stepPercent: number
  stepTokens: number
  notify: boolean
  whenBusy: 'dialog' | 'suggest'
  midTurnToast: boolean
  /** After a handoff-compact flow's compaction, nudge the session to carry on when no agent is still running. */
  continue: boolean
  /** Auto flows: minutes to wait for busy agents before compacting anyway; 0 = no limit. */
  maxWait: number
  /**
   * Tokens left before Claude Code's own auto-compact below which a flow stops waiting. `auto` (the default, D39) is
   * `min(80000, 15% of the auto-compact threshold)`; a number is used as is; 0 = no check.
   */
  reserve: number | 'auto'
  /** Auto cycles allowed per `cycleWindow` before auto falls back to the dialog; 0 = no cap. */
  maxCycles: number
  /** The window, in minutes, `maxCycles` counts over. */
  cycleWindow: number
  /** Any mode: Claude Code's own auto-compaction gets focus instructions (S4). */
  focusAutoCompact: boolean
  /** Auto mode: after Claude Code's own auto-compaction, write a handoff doc (if none since the last one), then continue (S4). */
  afterAutoCompact: boolean
  /** Auto mode, no known path: where a new handoff doc goes. Empty = unset (then ./handoff/). */
  handoffDir: string
}

export const DEFAULTS: Config = {
  mode: 'ask',
  trigger: 'percent',
  percent: 40,
  tokens: 300000,
  stepPercent: 15,
  stepTokens: 150000,
  notify: true,
  whenBusy: 'dialog',
  midTurnToast: true,
  continue: true,
  maxWait: 20,
  reserve: 'auto',
  maxCycles: 3,
  cycleWindow: 60,
  focusAutoCompact: true,
  afterAutoCompact: true,
  handoffDir: '',
}

/** Alerts are on in `ask` and `auto` mode. */
export const isEnabled = (cfg: Pick<Config, 'mode'>): boolean => cfg.mode !== 'off'

export type Asked = { pct: number; tokens: number; at: number }
export type SessionState = {
  asked: Asked[]
  /** Start times (ms) of auto cycles, newest last; pruned to the cycle window when read. */
  autoStarts?: number[]
  /** `/context-alert pause`: no alerts and no auto cycles for this session. */
  paused?: boolean
  /** Loop breaker: a compaction left the fill past the first threshold, so crossings use the dialog until it drops. */
  autoHeld?: boolean
  handoff?: string
  updatedAt?: number
  /** The threshold a mid-turn toast was shown for (so it shows once per tier). */
  toastedAt?: { pct: number; tokens: number }
}

export const emptyState = (): SessionState => ({ asked: [] })

export type SetResult =
  | { ok: true; key: keyof Config; value: Config[keyof Config] }
  | { ok: false; error: string }

const BOOL_KEYS = ['notify', 'midTurnToast', 'continue', 'focusAutoCompact', 'afterAutoCompact'] as const
/** Positive numbers only. */
const NUM_KEYS = ['percent', 'tokens', 'stepPercent', 'stepTokens', 'cycleWindow'] as const
/** `0` is allowed (no limit / no check / no cap). */
const ZERO_KEYS = ['maxWait', 'maxCycles'] as const
/** Whole numbers only. */
const INT_KEYS = ['tokens', 'stepTokens', 'maxCycles'] as const

export function mergeConfig(stored: unknown): Config {
  const out: Config = { ...DEFAULTS }
  if (stored && typeof stored === 'object') {
    const s = stored as Record<string, unknown>
    for (const k of BOOL_KEYS) if (typeof s[k] === 'boolean') out[k] = s[k] as boolean
    for (const k of NUM_KEYS) {
      const v = s[k]
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v
    }
    for (const k of ZERO_KEYS) {
      const v = s[k]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v
    }
    if (s.reserve === 'auto') out.reserve = 'auto'
    else if (typeof s.reserve === 'number' && Number.isFinite(s.reserve) && s.reserve >= 0 && Number.isInteger(s.reserve)) out.reserve = s.reserve
    // mode, else the 0.2 `enabled` flag: false reads as off, anything else as ask.
    if (s.mode === 'auto' || s.mode === 'ask' || s.mode === 'off') out.mode = s.mode
    else if (s.enabled === false) out.mode = 'off'
    if (typeof s.handoffDir === 'string') out.handoffDir = s.handoffDir.trim()
    if (s.trigger === 'percent' || s.trigger === 'tokens' || s.trigger === 'either') out.trigger = s.trigger
    if (s.whenBusy === 'dialog' || s.whenBusy === 'suggest') out.whenBusy = s.whenBusy
  }
  return out
}

export function parseSet(key: string, raw: string): SetResult {
  const value = raw.trim()
  if (key === 'enabled') {
    // The 0.2 name, kept as an alias: on is `mode ask`, off is `mode off`.
    const v = value.toLowerCase()
    if (v === 'true' || v === 'on') return { ok: true, key: 'mode', value: 'ask' }
    if (v === 'false' || v === 'off') return { ok: true, key: 'mode', value: 'off' }
    return { ok: false, error: `enabled takes on or off (true or false), got "${value}"` }
  }
  if (key === 'mode') {
    const v = value.toLowerCase()
    if (v === 'auto' || v === 'ask' || v === 'off') return { ok: true, key, value: v }
    return { ok: false, error: `mode takes auto, ask or off, got "${value}"` }
  }
  if ((BOOL_KEYS as readonly string[]).includes(key)) {
    const v = value.toLowerCase()
    if (v === 'true' || v === 'on') return { ok: true, key: key as keyof Config, value: true }
    if (v === 'false' || v === 'off') return { ok: true, key: key as keyof Config, value: false }
    return { ok: false, error: `${key} takes on or off (true or false), got "${value}"` }
  }
  const zeroOk = (ZERO_KEYS as readonly string[]).includes(key)
  if ((NUM_KEYS as readonly string[]).includes(key) || zeroOk) {
    if (!/^\d+(\.\d+)?$/.test(value)) {
      return { ok: false, error: `${key} takes a ${zeroOk ? 'number (0 = no limit)' : 'positive number'}, got "${value}"` }
    }
    const n = Number(value)
    if (n <= 0 && !zeroOk) return { ok: false, error: `${key} must be above 0` }
    if ((key === 'percent' || key === 'stepPercent') && n > 100) {
      return { ok: false, error: `${key} must be between 1 and 100` }
    }
    if ((INT_KEYS as readonly string[]).includes(key) && !Number.isInteger(n)) {
      return { ok: false, error: `${key} takes a whole number${key === 'maxCycles' ? '' : ' of tokens'}` }
    }
    return { ok: true, key: key as keyof Config, value: n }
  }
  if (key === 'reserve') {
    // `auto` (or `default`) puts back the window-scaled default; a number is used as is, 0 = no check.
    if (value.toLowerCase() === 'auto' || value.toLowerCase() === 'default') return { ok: true, key, value: 'auto' }
    if (!/^\d+$/.test(value)) return { ok: false, error: `reserve takes a whole number of tokens (0 = no check), or auto, got "${value}"` }
    return { ok: true, key, value: Number(value) }
  }
  if (key === 'handoffDir') {
    if (!value) return { ok: false, error: 'handoffDir takes a folder path, or none to clear it' }
    return { ok: true, key, value: value.toLowerCase() === 'none' ? '' : value }
  }
  if (key === 'whenBusy') {
    if (value === 'dialog' || value === 'suggest') return { ok: true, key, value }
    return { ok: false, error: `whenBusy takes dialog or suggest, got "${value}"` }
  }
  if (key === 'trigger') {
    if (value === 'percent' || value === 'tokens' || value === 'either') return { ok: true, key, value }
    return { ok: false, error: `trigger takes percent, tokens or either, got "${value}"` }
  }
  const keys = ['mode', 'enabled', ...BOOL_KEYS, ...NUM_KEYS, ...ZERO_KEYS, 'reserve', 'handoffDir', 'trigger', 'whenBusy'].join(', ')
  return { ok: false, error: `unknown key "${key}". Keys: ${keys}` }
}

/** The fill at which the next alert fires. */
export function nextThreshold(state: SessionState, cfg: Config): { pct: number; tokens: number } {
  const last = state.asked[state.asked.length - 1]
  return last
    ? { pct: last.pct + cfg.stepPercent, tokens: last.tokens + cfg.stepTokens }
    : { pct: cfg.percent, tokens: cfg.tokens }
}

/** Is this fill at or past `t`, counting only the measure(s) the trigger mode uses? Both values must be known. */
export function crossed(
  cfg: Config,
  t: { pct: number; tokens: number },
  percent: number | undefined,
  tokens: number | undefined,
): boolean {
  if (percent === undefined || tokens === undefined) return false
  const byPercent = percent >= t.pct
  const byTokens = tokens >= t.tokens
  if (cfg.trigger === 'percent') return byPercent
  if (cfg.trigger === 'tokens') return byTokens
  return byPercent || byTokens
}

/** Is the fill still below the FIRST threshold, in the active measure(s)? */
export function belowFirst(cfg: Config, percent: number | undefined, tokens: number | undefined): boolean {
  if (percent === undefined || tokens === undefined) return false
  return !crossed(cfg, { pct: cfg.percent, tokens: cfg.tokens }, percent, tokens)
}

/** A one-line note when a `set` changed the trigger mode. */
export function triggerNote(trigger: Trigger): string {
  if (trigger === 'percent') return 'Trigger is now percent only (token limit ignored). Use `/context-alert set trigger either` to use both.'
  if (trigger === 'tokens') return 'Trigger is now tokens only (percent limit ignored). Use `/context-alert set trigger either` to use both.'
  return 'Trigger is now either: whichever limit is crossed first.'
}

export function shouldFire(
  state: SessionState,
  cfg: Config,
  percent: number | undefined,
  tokens: number | undefined,
): boolean {
  if (!isEnabled(cfg)) return false
  return crossed(cfg, nextThreshold(state, cfg), percent, tokens)
}

/** Fill fell below the FIRST threshold on the active measure(s) (compact, /clear): clear the tiers. */
export function rearm(
  state: SessionState,
  cfg: Config,
  percent: number | undefined,
  tokens: number | undefined,
): SessionState {
  if (state.asked.length === 0 && !state.toastedAt && !state.autoHeld) return state
  if (belowFirst(cfg, percent, tokens)) {
    const { toastedAt: _gone, autoHeld: _held, ...rest } = state // the loop breaker lets go once the fill is down
    return { ...rest, asked: [] }
  }
  return state
}

/** A compaction happened: the next alert is the first threshold again, whatever the fill. */
export function resetTiers(state: SessionState): SessionState {
  if (state.asked.length === 0 && !state.toastedAt) return state
  const { toastedAt: _gone, ...rest } = state
  return { ...rest, asked: [] }
}

/** "Handoff, then compact" waits this many main turns for the handoff doc to be written, then gives up. */
export const COMPACT_AFTER_MAX_TURNS = 3

/** A mid-turn toast is due: the next tier is crossed and was not toasted yet. */
export function shouldToast(
  state: SessionState,
  cfg: Config,
  percent: number | undefined,
  tokens: number | undefined,
): boolean {
  if (!cfg.midTurnToast || !shouldFire(state, cfg, percent, tokens)) return false
  const t = nextThreshold(state, cfg)
  return !(state.toastedAt && state.toastedAt.pct === t.pct && state.toastedAt.tokens === t.tokens)
}

// A path-like token: a .md/.markdown/.txt suffix, or a leading /, ./ or ~ (so "and/or" and URLs are not paths).
const PATHLIKE = /^(\/|\.\/|~)|\.(md|markdown|txt)$/i

/** First path-like token of `/handoff-doc <path>` args, quotes stripped. */
export function extractHandoffPath(args: unknown): string | undefined {
  if (typeof args !== 'string') return undefined
  const tokens = args.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  for (const raw of tokens) {
    const t = raw.replace(/^["']|["']$/g, '')
    if (t && !t.startsWith('--') && PATHLIKE.test(t)) return t
  }
  return undefined
}

export function isHandoffSkill(name: unknown): boolean {
  return name === 'handoff-doc' || (typeof name === 'string' && name.endsWith(':handoff-doc'))
}

/** Skill tool input, assumed `{ skill, args }`; lenient about shape. */
export function extractSkillHandoffPath(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined
  const i = input as Record<string, unknown>
  if (!isHandoffSkill(i.skill ?? i.name)) return undefined
  return extractHandoffPath(i.args ?? i.arguments)
}

/** The skill name in a Skill tool call, whichever shape carries it (top level or under `input`). */
export function skillNameOf(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const direct = r.skill ?? r.name
  if (direct !== undefined) return direct
  const input = r.input
  if (input && typeof input === 'object') {
    const i = input as Record<string, unknown>
    return i.skill ?? i.name
  }
  return undefined
}

/** a Write or Edit of a .md file under a `handoff/` directory is the session's handoff doc. */
export function handoffPathFromWrite(tool: unknown, filePath: unknown): string | undefined {
  if (tool !== 'Write' && tool !== 'Edit') return undefined
  if (typeof filePath !== 'string' || !/\.md$/i.test(filePath)) return undefined
  return /(^|\/)handoff\/[^/]+/.test(filePath) ? filePath : undefined
}

/** "Handoff, then compact": a Write or Edit of any .md file counts as the handoff being written. */
export function isMarkdownWrite(tool: unknown, filePath: unknown): boolean {
  return (tool === 'Write' || tool === 'Edit') && typeof filePath === 'string' && /\.md$/i.test(filePath)
}

/**
 * `/handoff-doc <path>` (or `/context-alert:handoff-doc <path>`) in a user message.
 * Accepts the plain typed form and the command-markup form; the real transcript form is unverified.
 */
export function extractSlashHandoffPath(text: unknown): string | undefined {
  if (typeof text !== 'string' || !text) return undefined
  const markup = text.match(/<command-name>\s*\/?(?:context-alert:)?handoff-doc\s*<\/command-name>[\s\S]*?<command-args>([\s\S]*?)<\/command-args>/)
  if (markup) return extractHandoffPath(markup[1])
  const plain = text.match(/(?:^|\n)\s*\/(?:context-alert:)?handoff-doc[ \t]+([^\n]+)/)
  return plain ? extractHandoffPath(plain[1]) : undefined
}

/** an agent in one of these states is doing, or about to do, work of its own. */
export function isBusyStatus(status: unknown): boolean {
  return status === 'pending' || status === 'running' || status === 'waiting'
}

export type AskFailure = { kind: 'dismissed' | 'refused' | 'unknown'; reason: string }

/**
 * the d.ts says `$.ui.ask` "rejects when dismissed, and in a -p run" and defines no rejection payload,
 * so this reads the message text. Only a reason that clearly names a refusal rolls the tier back.
 */
export function classifyAskError(err: unknown): AskFailure {
  const reason = err instanceof Error ? err.message : String(err)
  if (/dismiss|cancel|declin|abort|interrupt|escape|user (rejected|denied)/i.test(reason)) return { kind: 'dismissed', reason }
  if (/already|another|busy|in progress|concurren|limit|refus|denied|deny|not allowed|unavailable|queue/i.test(reason)) return { kind: 'refused', reason }
  return { kind: 'unknown', reason }
}

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/** Store keys (`session:*`) whose last update is older than 30 days. */
export function staleSessionKeys(store: Record<string, unknown>, now: number): string[] {
  const out: string[] = []
  for (const [key, v] of Object.entries(store)) {
    if (!key.startsWith('session:')) continue
    const at = (v as { updatedAt?: unknown } | null)?.updatedAt
    if (typeof at !== 'number' || now - at > SESSION_MAX_AGE_MS) out.push(key)
  }
  return out
}

/** 410000 -> "410k", 1000000 -> "1M", 1250000 -> "1.25M". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(2))}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

/** ".../dir/20261027_02_slug.md" from a long path. */
export function shortPath(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts.length <= 2 ? p : `…/${parts.slice(-2).join('/')}`
}

export function questionText(percent: number, tokens: number, window: number, handoff?: string): string {
  const base = `The context window is now at ${percent}% (${formatTokens(tokens)} of ${formatTokens(window)} tokens). Write a handoff doc before compaction?`
  return handoff ? `${base} Handoff doc: ${shortPath(handoff)}` : base
}

export type DialogOptions = { thenCompact: string; only: string; compact: string; notNow: string }

/** The four answers, in the order the dialog shows them. With a known path the handoff options say "Update". */
export function dialogOptions(path: string | undefined): DialogOptions {
  const verb = path ? 'Update handoff' : 'Handoff'
  return { thenCompact: `${verb}, then compact`, only: `${verb} only`, compact: 'Compact now', notNow: 'Not now' }
}

// ---- autopilot (0.3.0, proposal 07) ----

const MINUTE_MS = 60_000

/** Auto cycle start times still inside the window (`now` minus `cycleWindow` minutes). */
export function startsInWindow(starts: readonly number[] | undefined, now: number, cfg: Pick<Config, 'cycleWindow'>): number[] {
  return (starts ?? []).filter((t) => now - t < cfg.cycleWindow * MINUTE_MS)
}

/** May another auto cycle start? `maxCycles` 0 is no cap. `count` is the cycles already in the window. */
export function cycleAllowed(
  starts: readonly number[] | undefined, now: number, cfg: Pick<Config, 'maxCycles' | 'cycleWindow'>,
): { ok: boolean; count: number } {
  const count = startsInWindow(starts, now, cfg).length
  return { ok: cfg.maxCycles === 0 || count < cfg.maxCycles, count }
}

/** Record an auto cycle start, dropping the ones that left the window. */
export function withAutoStart(s: SessionState, now: number, cfg: Pick<Config, 'cycleWindow'>): SessionState {
  return { ...s, autoStarts: [...startsInWindow(s.autoStarts, now, cfg), now] }
}

export type WaitWhy = 'no-agents' | 'room' | 'maxWait' | 'wait'

/**
 * S2's tree: compact when no agent is busy, when the room left before Claude Code's own auto-compact is under
 * `reserve` (any flow), or when an auto flow has waited `maxWaitMs` (0 = no limit). An unknown room (auto-compact
 * off, or unreadable) never counts as "no room". `reserve` 0 is no check.
 */
export function waitDecision(o: {
  busy: boolean
  room: number | undefined
  reserve: number
  waitedMs: number
  maxWaitMs: number
  auto: boolean
}): { go: boolean; why: WaitWhy } {
  if (!o.busy) return { go: true, why: 'no-agents' }
  if (o.room !== undefined && o.reserve > 0 && o.room < o.reserve) return { go: true, why: 'room' }
  if (o.auto && o.maxWaitMs > 0 && o.waitedMs >= o.maxWaitMs) return { go: true, why: 'maxWait' }
  return { go: false, why: 'wait' }
}

export const RESERVE_CAP = 80_000
export const RESERVE_SHARE = 0.15

/**
 * The reserve in force (D39): a number the person set is used as is (0 = no check); `auto` is
 * `min(80k, 15% of the auto-compact threshold)`, and 0 (skip the check) when the threshold is unknown.
 */
export function effectiveReserve(reserve: Config['reserve'], threshold: number | undefined): number {
  if (reserve !== 'auto') return reserve
  if (typeof threshold !== 'number') return 0
  return Math.min(RESERVE_CAP, Math.round(threshold * RESERVE_SHARE))
}

/** Tokens left before auto-compact runs, or undefined when either figure is unknown. */
export function roomLeft(threshold: number | undefined, tokens: number | undefined): number | undefined {
  if (typeof threshold !== 'number' || typeof tokens !== 'number') return undefined
  return threshold - tokens
}

/** "5%" / "300k tokens" / "40% or 300k tokens": the next alert, in the active measure(s). */
export function fmtNext(c: Config, t: { pct: number; tokens: number }): string {
  if (c.trigger === 'percent') return `${t.pct}%`
  if (c.trigger === 'tokens') return `${formatTokens(t.tokens)} tokens`
  return `${t.pct}% or ${formatTokens(t.tokens)} tokens`
}

/** The auto folder with a trailing slash. */
export function dirWithSlash(dir: string | undefined): string {
  const d = dir && dir.trim() ? dir.trim() : './handoff/'
  return d.endsWith('/') ? d : `${d}/`
}

/** `existing` then the focus, or the focus alone. */
export function appendInstructions(existing: string | undefined, focus: string): string {
  return existing && existing.trim() ? `${existing.trim()}\n\n${focus}` : focus
}

export const NO_PATH_AUTO_FOCUS = 'Keep the work in progress, the decisions made and the open follow-ups in the summary.'

export const CYCLE_NOTE = (count: number, minutes: number): string =>
  `Auto paused: ${count} ${count === 1 ? 'cycle' : 'cycles'} in the last ${minutes} min.`
