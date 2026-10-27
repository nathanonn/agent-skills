// Pure logic for context-alert. No `$` calls here.

export type Config = {
  enabled: boolean
  percent: number
  tokens: number
  stepPercent: number
  stepTokens: number
  notify: boolean
  whenBusy: 'dialog' | 'suggest'
  midTurnToast: boolean
}

export const DEFAULTS: Config = {
  enabled: true,
  percent: 40,
  tokens: 300000,
  stepPercent: 15,
  stepTokens: 150000,
  notify: true,
  whenBusy: 'dialog',
  midTurnToast: true,
}

export type Asked = { pct: number; tokens: number; at: number }
export type SessionState = {
  asked: Asked[]
  handoff?: string
  updatedAt?: number
  /** The threshold a mid-turn toast was shown for (so it shows once per tier). */
  toastedAt?: { pct: number; tokens: number }
}

export const emptyState = (): SessionState => ({ asked: [] })

export type SetResult =
  | { ok: true; key: keyof Config; value: Config[keyof Config] }
  | { ok: false; error: string }

const BOOL_KEYS = ['enabled', 'notify', 'midTurnToast'] as const
const NUM_KEYS = ['percent', 'tokens', 'stepPercent', 'stepTokens'] as const

export function mergeConfig(stored: unknown): Config {
  const out: Config = { ...DEFAULTS }
  if (stored && typeof stored === 'object') {
    const s = stored as Record<string, unknown>
    for (const k of BOOL_KEYS) if (typeof s[k] === 'boolean') out[k] = s[k] as boolean
    for (const k of NUM_KEYS) {
      const v = s[k]
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v
    }
    if (s.whenBusy === 'dialog' || s.whenBusy === 'suggest') out.whenBusy = s.whenBusy
  }
  return out
}

export function parseSet(key: string, raw: string): SetResult {
  const value = raw.trim()
  if ((BOOL_KEYS as readonly string[]).includes(key)) {
    if (value === 'true' || value === 'false') {
      return { ok: true, key: key as keyof Config, value: value === 'true' }
    }
    return { ok: false, error: `${key} takes true or false, got "${value}"` }
  }
  if ((NUM_KEYS as readonly string[]).includes(key)) {
    if (!/^\d+(\.\d+)?$/.test(value)) return { ok: false, error: `${key} takes a positive number, got "${value}"` }
    const n = Number(value)
    if (n <= 0) return { ok: false, error: `${key} must be above 0` }
    if ((key === 'percent' || key === 'stepPercent') && n > 100) {
      return { ok: false, error: `${key} must be between 1 and 100` }
    }
    if ((key === 'tokens' || key === 'stepTokens') && !Number.isInteger(n)) {
      return { ok: false, error: `${key} takes a whole number of tokens` }
    }
    return { ok: true, key: key as keyof Config, value: n }
  }
  if (key === 'whenBusy') {
    if (value === 'dialog' || value === 'suggest') return { ok: true, key, value }
    return { ok: false, error: `whenBusy takes dialog or suggest, got "${value}"` }
  }
  const keys = [...BOOL_KEYS, ...NUM_KEYS, 'whenBusy'].join(', ')
  return { ok: false, error: `unknown key "${key}". Keys: ${keys}` }
}

/** The fill at which the next alert fires. */
export function nextThreshold(state: SessionState, cfg: Config): { pct: number; tokens: number } {
  const last = state.asked[state.asked.length - 1]
  return last
    ? { pct: last.pct + cfg.stepPercent, tokens: last.tokens + cfg.stepTokens }
    : { pct: cfg.percent, tokens: cfg.tokens }
}

export function shouldFire(
  state: SessionState,
  cfg: Config,
  percent: number | undefined,
  tokens: number | undefined,
): boolean {
  if (!cfg.enabled || percent === undefined || tokens === undefined) return false
  const t = nextThreshold(state, cfg)
  return percent >= t.pct || tokens >= t.tokens
}

/** Fill fell below the FIRST threshold on both measures (compact, /clear): clear the tiers. */
export function rearm(
  state: SessionState,
  cfg: Config,
  percent: number | undefined,
  tokens: number | undefined,
): SessionState {
  if (percent === undefined || tokens === undefined) return state
  if (state.asked.length === 0 && !state.toastedAt) return state
  if (percent < cfg.percent && tokens < cfg.tokens) {
    const { toastedAt: _gone, ...rest } = state
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
