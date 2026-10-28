import type { EngineInterface } from 'claude-code'
import {
  DEFAULTS, formatTokens, nextThreshold, parseSet, rearm, triggerNote, type Config, type SessionState,
} from './logic'
import { CONFIG_KEY, loadConfig, loadSession, updateSession } from './state'

const USAGE =
  'Usage: /context-alert [status | show] | set <key> <value> | reset | reset session\n' +
  'Keys: enabled, notify, midTurnToast (true/false); percent, tokens, stepPercent, stepTokens (numbers); trigger (percent/tokens/either); whenBusy (dialog/suggest)'

function fmtLimits(c: Config): string {
  if (c.trigger === 'percent') return `first alert at ${c.percent}%, then every +${c.stepPercent} points (trigger: percent)`
  if (c.trigger === 'tokens') return `first alert at ${formatTokens(c.tokens)} tokens, then every +${formatTokens(c.stepTokens)} (trigger: tokens)`
  return `first alert at ${c.percent}% or ${formatTokens(c.tokens)} tokens, then every +${c.stepPercent} points or +${formatTokens(c.stepTokens)} (trigger: either)`
}

function fmtNext(c: Config, t: { pct: number; tokens: number }): string {
  if (c.trigger === 'percent') return `${t.pct}%`
  if (c.trigger === 'tokens') return `${formatTokens(t.tokens)} tokens`
  return `${t.pct}% or ${formatTokens(t.tokens)} tokens`
}

function fmtConfig(c: Config): string {
  return [
    `enabled ${c.enabled} · notify ${c.notify} · midTurnToast ${c.midTurnToast} · whenBusy ${c.whenBusy}`,
    fmtLimits(c),
  ].join('\n')
}

export function statusText(
  cfg: Config, s: SessionState, fill: string, percent?: number, tokens?: number,
): string {
  // Show what the next measure will do: it clears tiers when the fill is already below the first threshold.
  const t = nextThreshold(rearm(s, cfg, percent, tokens), cfg)
  const asked = s.asked.length
    ? s.asked.map((a) => `${a.pct}% / ${formatTokens(a.tokens)} at ${new Date(a.at).toISOString().slice(0, 16).replace('T', ' ')} UTC`).join('; ')
    : 'none yet'
  return [
    'context-alert',
    fmtConfig(cfg),
    `Fill now: ${fill}`,
    `Asked this session: ${asked}`,
    `Next alert at: ${fmtNext(cfg, t)}`,
    `Known handoff path: ${s.handoff ?? 'none'}`,
  ].join('\n')
}

async function fillInfo($: EngineInterface): Promise<{ text: string; percent?: number; tokens?: number }> {
  try {
    const { context } = await $.session.usage()
    if (context.percent === undefined || context.tokens === undefined) return { text: 'unknown' }
    return {
      text: `${context.percent}% (${formatTokens(context.tokens)} of ${formatTokens(context.window)})`,
      percent: context.percent,
      tokens: context.tokens,
    }
  } catch {
    return { text: 'unknown' }
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
    const fill = await fillInfo($)
    return statusText(await loadConfig($), await loadSession($, sid), fill.text, fill.percent, fill.tokens)
  }

  if (sub === 'set') {
    const [key, ...vals] = rest
    if (!key || vals.length === 0) return `set needs a key and a value.\n${USAGE}`
    const r = parseSet(key, vals.join(' '))
    if (!r.ok) return r.error
    const prev = await loadConfig($)
    const cfg: Config = { ...prev, [r.key]: r.value }
    if (r.key === 'percent') cfg.trigger = 'percent'
    if (r.key === 'tokens') cfg.trigger = 'tokens'
    await $.store.set(CONFIG_KEY, cfg)
    fx.onConfig?.(cfg)
    const note = cfg.trigger !== prev.trigger ? `\n${triggerNote(cfg.trigger)}` : ''
    return `${r.key} = ${String(r.value)}${note}\n${fmtConfig(cfg)}`
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
