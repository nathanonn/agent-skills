import type { EngineInterface } from 'claude-code'
import {
  DEFAULTS, fmtNext, formatTokens, nextThreshold, parseSet, rearm, startsInWindow, triggerNote, type Config, type SessionState,
} from './logic'
import { CONFIG_KEY, loadConfig, loadSession, setAutoHeld, setPaused, updateSession } from './state'

const USAGE =
  'Usage: /context-alert [status | show] | set <key> <value> | pause | resume | reset | reset session\n' +
  'Keys: mode (auto/ask/off; enabled on/off is the old name for ask/off); ' +
  'notify, midTurnToast, continue, focusAutoCompact, afterAutoCompact (on/off, or true/false); ' +
  'percent, tokens, stepPercent, stepTokens, cycleWindow (numbers); maxWait (minutes, decimals ok), reserve (whole tokens or auto), maxCycles (whole number); 0 = no limit for maxWait, reserve, maxCycles; ' +
  'handoffDir (a folder, or none); trigger (percent/tokens/either); whenBusy (dialog/suggest, ask mode only)\n' +
  'pause: no alerts and no auto cycles for this session; resume: back on.'

function fmtLimits(c: Config): string {
  if (c.trigger === 'percent') return `first alert at ${c.percent}%, then every +${c.stepPercent} points (trigger: percent)`
  if (c.trigger === 'tokens') return `first alert at ${formatTokens(c.tokens)} tokens, then every +${formatTokens(c.stepTokens)} (trigger: tokens)`
  return `first alert at ${c.percent}% or ${formatTokens(c.tokens)} tokens, then every +${c.stepPercent} points or +${formatTokens(c.stepTokens)} (trigger: either)`
}

const onOff = (b: boolean): string => (b ? 'on' : 'off')
const limit = (n: number, unit: string): string => (n === 0 ? 'no limit' : `${n}${unit}`)

function fmtConfig(c: Config): string {
  return [
    `mode ${c.mode} · notify ${c.notify} · midTurnToast ${c.midTurnToast} · continue ${c.continue} · whenBusy ${c.whenBusy}`,
    fmtLimits(c),
    `maxWait ${limit(c.maxWait, ' min')} · reserve ${c.reserve === 'auto' ? 'auto (min 80k, 15% of the auto-compact threshold)' : c.reserve === 0 ? 'no check' : formatTokens(c.reserve)} · ` +
      `maxCycles ${limit(c.maxCycles, '')} per ${c.cycleWindow} min · focusAutoCompact ${onOff(c.focusAutoCompact)} · ` +
      `afterAutoCompact ${onOff(c.afterAutoCompact)} · handoffDir ${c.handoffDir || 'none (./handoff/)'}`,
  ].join('\n')
}

/** What goes in the store: the config, plus the 0.2 `enabled` flag so a downgrade does not turn alerts back on (F18). */
function storedConfig(c: Config): Config & { enabled: boolean } {
  return { ...c, enabled: c.mode !== 'off' }
}

/** What the session is doing right now, from the hooks module (flow, queued compaction, queued prompts). */
export type StatusExtra = { flow: string; queued: string; now: number; interactive?: boolean }

function autoState(cfg: Config, s: SessionState, cycles: number, interactive: boolean): string {
  if (cfg.mode !== 'auto') return `Auto: not on (mode ${cfg.mode})`
  if (!interactive) return 'Auto: never in a non-interactive run'
  if (s.paused) return 'Auto: paused (see the Paused line)'
  if (s.autoHeld) return 'Auto: held by the loop breaker until the fill drops below the first threshold'
  if (cfg.maxCycles > 0 && cycles >= cfg.maxCycles) return 'Auto: cycle cap reached, so crossings use the dialog'
  return 'Auto: on'
}

export function statusText(
  cfg: Config, s: SessionState, fill: string, percent?: number, tokens?: number, extra?: StatusExtra,
): string {
  // Show what the next measure will do: it clears tiers when the fill is already below the first threshold.
  const t = nextThreshold(rearm(s, cfg, percent, tokens), cfg)
  const asked = s.asked.length
    ? s.asked.map((a) => `${a.pct}% / ${formatTokens(a.tokens)} at ${new Date(a.at).toISOString().slice(0, 16).replace('T', ' ')} UTC`).join('; ')
    : 'none yet'
  const cycles = startsInWindow(s.autoStarts, extra?.now ?? 0, cfg).length
  return [
    'context-alert',
    fmtConfig(cfg),
    `Fill now: ${fill}`,
    `Asked this session: ${asked}`,
    `Next alert at: ${fmtNext(cfg, t)}`,
    `Known handoff path: ${s.handoff ?? 'none'}`,
    ...(extra
      ? [
          ...(s.paused
            ? [`Paused: yes, in every mode (/context-alert resume to undo). The focus rewrite of Claude Code's own auto-compaction ${cfg.focusAutoCompact ? 'is on and still runs while paused' : 'is off (focusAutoCompact)'}`]
            : []),
          autoState(cfg, s, cycles, extra.interactive !== false),
          `Auto cycles in the last ${cfg.cycleWindow} min: ${cycles}${cfg.maxCycles > 0 ? ` of ${cfg.maxCycles}` : ' (no cap)'}`,
          `Flow: ${extra.flow}`,
          `Queued: ${extra.queued}`,
        ]
      : []),
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
  /** Returns a note for the reply when the change stopped something. */
  onConfig?: (cfg: Config) => string | void
  onResetSession?: () => void
  /** `pause`: stop an auto flow and drop what is queued. */
  onPause?: () => void
  /** `resume`: an alert may be due now. */
  onResume?: () => void
  /** The flow and queued prompts, for `status`. */
  runtimeStatus?: () => Promise<{ flow: string; queued: string; interactive?: boolean }>
}

/** Serves `/context-alert <args>`; returns the text to print. */
export async function handleCommand($: EngineInterface, args: string, fx: CommandEffects = {}): Promise<string> {
  const [sub = 'status', ...rest] = args.trim().split(/\s+/).filter(Boolean)

  if (sub === 'status' || sub === 'show') {
    const sid = await $.session.id()
    const fill = await fillInfo($)
    let extra: StatusExtra | undefined
    try {
      const rs = (await fx.runtimeStatus?.()) ?? { flow: 'unknown', queued: 'unknown' }
      extra = { ...rs, now: await $.clock.now() }
    } catch { extra = { flow: 'unknown', queued: 'unknown', now: await $.clock.now() } }
    return statusText(await loadConfig($), await loadSession($, sid), fill.text, fill.percent, fill.tokens, extra)
  }

  if (sub === 'pause' || sub === 'resume') {
    if (rest.length > 0) return USAGE
    const sid = await $.session.id()
    if (sub === 'pause') {
      await setPaused($, sid, true)
      fx.onPause?.()
      return 'Paused for this session: no alerts and no auto cycles. `/context-alert resume` undoes it. `/handoff-compact` still works.'
    }
    await setPaused($, sid, false)
    await setAutoHeld($, sid, false) // a resume also lets go of the loop breaker's hold
    fx.onResume?.()
    return 'Resumed: alerts and auto cycles are back on.'
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
    await $.store.set(CONFIG_KEY, storedConfig(cfg))
    const stopped = fx.onConfig?.(cfg)
    const note = (cfg.trigger !== prev.trigger ? `\n${triggerNote(cfg.trigger)}` : '') + (stopped ? `\n${stopped}` : '')
    return `${r.key} = ${String(r.value)}${note}\n${fmtConfig(cfg)}`
  }

  if (sub === 'reset') {
    // Only `reset` and `reset session`: a typo must not wipe the settings.
    if (rest.length > 1 || (rest.length === 1 && rest[0] !== 'session')) return USAGE
    if (rest[0] === 'session') {
      const sid = await $.session.id()
      await updateSession($, sid, (s) => {
        const { toastedAt: _t, autoStarts: _a, autoHeld: _h, ...keep } = s
        return { ...keep, asked: [] }
      })
      fx.onResetSession?.()
      return 'Cleared the asked tiers, the auto cycle count and any auto hold for this session. The next measure may alert again. (A pause stays: use resume.)'
    }
    await $.store.set(CONFIG_KEY, storedConfig(DEFAULTS))
    fx.onConfig?.({ ...DEFAULTS })
    return `Settings back to defaults.\n${fmtConfig(DEFAULTS)}`
  }

  return USAGE
}
