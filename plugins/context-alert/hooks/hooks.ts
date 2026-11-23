import type { EngineInterface, Register } from 'claude-code'
import { getConfig, newRuntime, refreshConfig, resetConversation, tryAlert, type Runtime } from './alert'
import { handleCommand } from './command'
import { afterCompaction, noteFlowWrite, onFlowCommand, onFlowPrompt, onFlowTurnEnd } from './flow'
import {
  belowFirst, crossed, extractHandoffPath, extractSkillHandoffPath, extractSlashHandoffPath, formatTokens, handoffPathFromWrite,
  isHandoffSkill, isMarkdownWrite, nextThreshold, rearm, shouldToast, skillNameOf, type SessionState,
} from './logic'
import { loadSession, pruneSessions, rememberHandoffPath, updateSession } from './state'

const quiet = () => undefined

// Every hook calls next(e) first and hands anything slow to a promise it does not await.
// Each detached function below catches its own errors, so none can reject unhandled.

type Measure = {
  context: { percent?: number; tokens?: number; window: number }
  changed: readonly string[]
}

/**
 * act only when the context unit moved, or an alert is pending. Never while a main turn runs:
 * then the alert stays pending and turn.complete (or the next idle measure) asks.
 */
async function onMeasure($: EngineInterface, rt: Runtime, e: Measure): Promise<void> {
  const contextMoved = e.changed.includes('context')
  if (!contextMoved && !rt.pending) return
  const cfg = await refreshConfig($, rt) // also how a setting changed in another session reaches this one
  const { percent, tokens, window } = e.context
  if (contextMoved) {
    const sid = await $.session.id()
    await updateSession($, sid, (s) => rearm(s, cfg, percent, tokens)) // a drop re-arms even mid-turn
  }
  if (rt.mainTurnRunning) {
    const over = crossed(cfg, { pct: cfg.percent, tokens: cfg.tokens }, percent, tokens)
    if (contextMoved && cfg.enabled && over) rt.pending = true
    return
  }
  await tryAlert($, rt, contextMoved ? { percent, tokens, window } : undefined)
}

async function onToolCallToast($: EngineInterface, rt: Runtime): Promise<void> {
  const cfg = await getConfig($, rt)
  if (!cfg.enabled || !cfg.midTurnToast) return
  const { context } = await $.session.usage()
  // Cheap exit before touching the session store: nothing below the first threshold can toast.
  const { percent, tokens } = context
  if (percent === undefined || tokens === undefined) return
  if (belowFirst(cfg, percent, tokens)) return
  const sid = await $.session.id()
  let toasted = false
  await updateSession($, sid, (s: SessionState) => {
    if (!shouldToast(s, cfg, percent, tokens)) return s
    toasted = true
    return { ...s, toastedAt: nextThreshold(s, cfg) }
  })
  if (toasted) {
    $.ui.toast(`Context at ${percent}% (${formatTokens(tokens)}). A handoff prompt follows when this turn ends.`)
  }
}

async function onSessionStart($: EngineInterface, rt: Runtime): Promise<void> {
  try {
    await $.command.register({
      name: 'context-alert',
      description: 'Show or set the context-window handoff alert',
      argumentHint: '[status | show | set <key> <value> | reset [session]]',
    })
  } catch (err) {
    $.ui.log(`context-alert: could not register /context-alert: ${String(err)}`)
  }
  try {
    await $.command.register({
      name: 'handoff-compact',
      description: 'Write or update the handoff doc, wait for running agents, then compact (now: skip the wait)',
      argumentHint: '[now] [path]',
    })
  } catch (err) {
    $.ui.log(`context-alert: could not register /handoff-compact: ${String(err)}`)
  }
  await refreshConfig($, rt).catch(quiet)
  await pruneSessions($).catch(quiet)
  await backfillHandoff($).catch(quiet)
}

/**
 * On a fresh process (session.start never fires for an in-process /resume or /clear): when the store has no
 * handoff path, take the latest one from the transcript. Three sources, latest wins: a handoff-doc Skill call,
 * a Write or Edit of a .md under a handoff/ folder, and a typed `/handoff-doc <path>` in a user message.
 */
async function backfillHandoff($: EngineInterface): Promise<void> {
  const sid = await $.session.id()
  if ((await loadSession($, sid)).handoff) return
  let found: string | undefined
  for (const m of await $.session.messages()) {
    if (m.role === 'user') found = extractSlashHandoffPath(m.text) ?? found
    for (const u of m.toolUses) {
      if (u.tool === 'Skill') found = extractSkillHandoffPath(u.input) ?? found
      const filePath = (u.input as { file_path?: unknown } | undefined)?.file_path
      found = handoffPathFromWrite(u.tool, filePath) ?? found
    }
  }
  if (found) await updateSession($, sid, (s) => (s.handoff ? s : { ...s, handoff: found }))
}

export const register: Register = (on) => {
  const rt = newRuntime()

  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    void onMeasure($, rt, e).catch(quiet)
    return r
  })

  // follow the main loop's turns (sub-agent turns carry an agentId and are ignored).
  on('turn.start', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) {
      rt.mainTurnRunning = true
      rt.epoch++
      rt.compacting = false // the compaction ran or was dropped; either way the session moved on
      rt.notifyOnCompact = false // so a dropped compaction's notification cannot ride a later auto-compaction
      rt.nudgeAfterCompact = undefined // nor its continue nudge
      rt.turnOrigin = rt.nextTurnOrigin // undefined: a prompt this mod did not see (its own, or queued mid-turn)
      rt.nextTurnOrigin = undefined
    }
    return r
  })
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) {
      rt.mainTurnRunning = false
      // A flow holds every alert (tryAlert re-marks it pending), so a pending tier cannot open a dialog first.
      if (rt.flow) void onFlowTurnEnd($, rt, e).catch(quiet)
      if (rt.pending) void tryAlert($, rt).catch(quiet)
    }
    return r
  })

  // A compaction of the main conversation (manual, auto, a plugin's) starts the tiers over at the first
  // threshold. The step-up only applies while the person keeps going without compacting.
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    const skipped = (r as { skip?: string } | undefined)?.skip
    if (e.agentId === undefined && e.trigger !== 'precompute') rt.compacting = false
    if (e.agentId === undefined && e.trigger !== 'precompute' && skipped) { rt.notifyOnCompact = false; rt.nudgeAfterCompact = undefined }
    if (e.agentId === undefined && e.trigger !== 'precompute' && !skipped) {
      void afterCompaction($, rt, e.instructions, e.trigger).catch(quiet) // tiers reset (D15), any flow ends (D26)
    }
    return r
  })

  // background work the agent list cannot see (shells, monitors, workflows), as of the last Stop.
  // A sub-agent ends under classic.SubagentStop; the agent_id check is belt and braces (BaseHookInput).
  on('classic.Stop', async ($, e, next) => {
    const r = await next(e)
    if (e.agent_id === undefined) rt.backgroundTasks = Array.isArray(e.background_tasks) ? e.background_tasks.length : 0
    return r
  })

  // Mid-turn toast, and the path recorder. Observe only; sub-agent calls are skipped
  // (their fill and their writes are not the main thread's).
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) {
      void onToolCallToast($, rt).catch(quiet)
      // A denied or failed Write/Edit wrote nothing: it neither records a path nor counts as the handoff written.
      const res = r as { deny?: string; isError?: true } | undefined
      if (res?.deny !== undefined || res?.isError) return r
      const filePath = (e as unknown as { file_path?: unknown }).file_path
      const written = handoffPathFromWrite(e.tool, filePath)
      if (written) void rememberHandoffPath($, written).catch(quiet)
      // The handoff-compact flow: any .md written counts (the doc may live outside a handoff/ folder).
      if (rt.flow && isMarkdownWrite(e.tool, filePath)) noteFlowWrite(rt.flow, e.tool, filePath as string)
    }
    return r
  })

  // The Skill tool: learn the handoff path. The raw shape of a handoff-skill call goes to the debug log only.
  // Main loop only: a sub-agent's handoff-doc call is not this session's handoff.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
    void (async () => {
      const raw = e as unknown as Record<string, unknown>
      if (!isHandoffSkill(skillNameOf(raw))) return
      $.ui.log(`context-alert: Skill tool input shape: ${JSON.stringify(raw).slice(0, 400)}`, { to: 'debug' })
      const path = extractSkillHandoffPath(raw) ?? extractSkillHandoffPath(raw.input)
      if (path) await rememberHandoffPath($, path)
    })().catch(quiet)
    return r
  })

  // The person types /handoff-doc <path> (or the bundled copy). command.run carries no agentId: a slash
  // command is the person's (or a plugin's) and a sub-agent cannot type one, so there is nothing to filter.
  on('command.run', { command: 'handoff-doc' }, async ($, e, next) => {
    const r = await next(e)
    const path = extractHandoffPath(e.args)
    if (path) void rememberHandoffPath($, path).catch(quiet)
    return r
  })
  on('command.run', { command: 'context-alert:handoff-doc' }, async ($, e, next) => {
    const r = await next(e)
    const path = extractHandoffPath(e.args)
    if (path) void rememberHandoffPath($, path).catch(quiet)
    return r
  })

  // /handoff-compact [now] [path]: answers at once with no text (toasts and the handoff turn say the rest);
  // the flow runs detached, after the hook has returned.
  on('command.run', { command: 'handoff-compact' }, async ($, e) => {
    void onFlowCommand($, rt, e.args).catch(quiet)
    return {}
  })

  // A typed (or Remote Control) message cancels a flow that waits for agents. prompt.submit carries no agentId:
  // a sub-agent's prompt never raises it here. This mod's own prompts (kind plugin) skip its hooks anyway.
  // The origin is noted before next(e), as the turn it starts begins inside it; a prompt typed or delivered
  // over a running turn (turnId set) starts no turn of its own now, so it is not noted.
  on('prompt.submit', async ($, e, next) => {
    const noted = e.turnId === undefined
      ? { kind: e.origin.kind, ...('name' in e.origin ? { name: e.origin.name } : {}) }
      : undefined
    if (noted) rt.nextTurnOrigin = noted
    const r = await next(e)
    if (noted && (r as { drop?: string } | undefined)?.drop && rt.nextTurnOrigin === noted) rt.nextTurnOrigin = undefined
    try { onFlowPrompt($, rt, e) } catch { /* ignore */ }
    return r
  })

  // /clear or an in-process /resume: a new conversation under the same process. Nothing of the old one's flow,
  // queued compaction or pending alert may carry over (session.start does not fire for either).
  on('session.end', async ($, e, next) => {
    const r = await next(e)
    if (e.reason === 'clear' || e.reason === 'resume') resetConversation(rt)
    return r
  })

  on('command.run', { command: 'context-alert' }, async ($, e) => {
    try {
      return {
        text: await handleCommand($, e.args, {
          onConfig: (cfg) => { rt.config = cfg },
          onResetSession: () => {
            rt.pending = false; rt.suggestAnnounced = undefined; rt.refusals = 0; rt.flow = undefined
            rt.notifyOnCompact = false; rt.nudgeAfterCompact = undefined; rt.compacting = false; rt.epoch++
          },
        }),
      }
    } catch (err) {
      return { text: `context-alert: ${String(err)}` }
    }
  })

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    rt.interactive = e.isInteractive
    void onSessionStart($, rt).catch(quiet)
    return r
  })
}
