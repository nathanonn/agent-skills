import type { EngineInterface } from 'claude-code'
import {
  DEFAULTS, formatTokens, nextThreshold, parseSet, type Config, type SessionState,
} from './logic'
import { CONFIG_KEY, loadConfig, loadSession, updateSession } from './state'

const USAGE =
  'Usage: /context-alert [status | show] | set <key> <value> | reset | reset session\n' +
  'Keys: enabled, notify, midTurnToast (true/false); percent, tokens, stepPercent, stepTokens (numbers); whenBusy (dialog/suggest)'

function fmtConfig(c: Config): string {
  return [
    `enabled ${c.enabled} · notify ${c.notify} · midTurnToast ${c.midTurnToast} · whenBusy ${c.whenBusy}`,
    `first alert at ${c.percent}% or ${formatTokens(c.tokens)} tokens, then every +${c.stepPercent} points or +${formatTokens(c.stepTokens)}`,
  ].join('\n')
}

export function statusText(cfg: Config, s: SessionState, fill: string): string {
  const t = nextThreshold(s, cfg)
  const asked = s.asked.length
    ? s.asked.map((a) => `${a.pct}% / ${formatTokens(a.tokens)} at ${new Date(a.at).toISOString().slice(0, 16).replace('T', ' ')} UTC`).join('; ')
    : 'none yet'
  return [
    'context-alert',
    fmtConfig(cfg),
    `Fill now: ${fill}`,
    `Asked this session: ${asked}`,
    `Next alert at: ${t.pct}% or ${formatTokens(t.tokens)} tokens`,
    `Known handoff path: ${s.handoff ?? 'none'}`,
  ].join('\n')
}

async function fillText($: EngineInterface): Promise<string> {
  try {
    const { context } = await $.session.usage()
    if (context.percent === undefined || context.tokens === undefined) return 'unknown'
    return `${context.percent}% (${formatTokens(context.tokens)} of ${formatTokens(context.window)})`
  } catch {
    return 'unknown'
  }
}

/** Callbacks so the hooks module can keep its caches in step with a command. */
export type CommandEffects = {
  onConfig?: (cfg: Config) => void
  onResetSession?: () => void
}

/** Serves `/context-alert <args>`; returns the text to print. */
export async function handleCommand($: EngineInterface, args: string, fx: CommandEffects = {}): Promise<string> {
  const [sub = 'status', ...rest] = args.trim().split(/\s+/).filter(Boolean)

  if (sub === 'status' || sub === 'show') {
    const sid = await $.session.id()
    return statusText(await loadConfig($), await loadSession($, sid), await fillText($))
  }

  if (sub === 'set') {
    const [key, ...vals] = rest
    if (!key || vals.length === 0) return `set needs a key and a value.\n${USAGE}`
    const r = parseSet(key, vals.join(' '))
    if (!r.ok) return r.error
    const cfg = { ...(await loadConfig($)), [r.key]: r.value }
    await $.store.set(CONFIG_KEY, cfg)
    fx.onConfig?.(cfg)
    return `${r.key} = ${String(r.value)}\n${fmtConfig(cfg)}`
  }

  if (sub === 'reset') {
    // Only `reset` and `reset session`: a typo must not wipe the settings.
    if (rest.length > 1 || (rest.length === 1 && rest[0] !== 'session')) return USAGE
    if (rest[0] === 'session') {
      const sid = await $.session.id()
      await updateSession($, sid, (s) => {
        const { toastedAt: _t, ...keep } = s
        return { ...keep, asked: [] }
      })
      fx.onResetSession?.()
      return 'Cleared the asked tiers for this session. The next measure may alert again.'
    }
    await $.store.set(CONFIG_KEY, { ...DEFAULTS })
    fx.onConfig?.({ ...DEFAULTS })
    return `Settings back to defaults.\n${fmtConfig(DEFAULTS)}`
  }

  return USAGE
}
