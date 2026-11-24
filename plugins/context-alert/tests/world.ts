// The fake engine beneath the plugin, shared by hooks.test.ts and flow.test.ts.
import { mock, type TestBody } from 'claude-code/testing'

export type On = Parameters<TestBody>[1]
export type Dollar = Parameters<TestBody>[0]

export const DAY = 86_400_000
export const NOW = 100 * DAY

export type World = {
  asks: { question: string; header: string; options: string[] }[]
  toasts: string[]
  suggests: string[]
  notifies: { text: string; title?: string }[]
  /** Whether the next $.prompt.suggest reports { isShown: true }; tests may flip it. */
  suggestShown: boolean
  submits: { text: string; asUser?: boolean }[]
  runs: { command: string; args: string }[]
  logs: string[]
  compacts: number
  /** The `instructions` each session.compact call carried (undefined when none). */
  compactInstructions: (string | undefined)[]
  /** The live agent list $.agent.list() answers; tests may change it between events. */
  agents: { id: string; status: string; description?: string; parentId?: string; kind?: string; teammateId?: string }[]
  /** $.agent.list() rejects while true; tests may flip it. */
  agentListFails: boolean
  /** Notifications and submitted prompts in the order the engine saw them ("notify" / "submit: <text>"). */
  order: string[]
  /** Hold $.agent.list()'s answer on the mocked clock for this long (set mid-test to let events land mid-await). */
  listDelayMs: number
  /** session.compact comes back vetoed while true (starts as Opts.compactRejects); tests may flip it. */
  compactVeto: boolean
  /** What $.session.usage() reports; tests may change it between events (the fill after a compaction, say). */
  usage: { percent?: number; tokens?: number }
  /** `context.breakdown.autoCompactThreshold` for a call that asks for a breakdown; undefined = auto-compact off. */
  autoCompactThreshold: number | undefined
  /** `context.breakdown.totalTokens` for a call that asks for a breakdown (the estimate that sits beside the threshold). */
  breakdownTotal: number | undefined
  /** The `tokensAfter` a landed session.compact reports (undefined: the engine did not record it). */
  tokensAfter: number | undefined
  /** A usage call that asks for a breakdown rejects while true. */
  breakdownFails: boolean
  /** How many usage calls asked for a breakdown. */
  breakdownCalls: number
  /** The `trigger` each session.compact call carried. */
  compactTriggers: string[]
  registered: string[]
  clock: ReturnType<typeof mock.clock>
  store: Map<string, unknown>
}

export type Opts = {
  /** What the dialog answers; default "Not now". */
  answer?: string | ((labels: string[]) => string)
  agents?: { id: string; status: string; description?: string; parentId?: string; kind?: string; teammateId?: string }[]
  /** Hold the dialog's answer on the mocked clock for this long. */
  askDelayMs?: number
  usage?: { percent?: number; tokens?: number }
  /** The room before Claude Code's own auto-compact: its threshold in tokens (default: auto-compact off). */
  autoCompactThreshold?: number
  store?: Record<string, unknown>
  /** Command names whose $.command.run the world refuses. */
  refuse?: string[]
  /** The dialog is dismissed (the call rejects), as in -p runs. */
  dismiss?: boolean
  /** The dialog rejects with this message (a host refusal, not a dismissal). */
  askError?: string
  /** session.compact comes back vetoed ({ skip }); the kit cannot make it reject. */
  compactRejects?: boolean
  /** A prompt.submit whose text this matches is dropped ({ drop }) by the engine. */
  dropPrompt?: (text: string) => boolean
  /** Tool name → how its calls end: refused by a hook (`deny`) or reported as an error (`error`). */
  toolResult?: Record<string, 'deny' | 'error'>
  /** What $.session.messages() returns (resume backfill). */
  messages?: unknown[]
}

// Every hook below stands for the engine: nothing sits beneath the plugin.
export function world($: Dollar, on: On, o: Opts = {}): World {
  const w: World = {
    asks: [], toasts: [], suggests: [], notifies: [], suggestShown: true, submits: [], runs: [], logs: [], compacts: 0,
    registered: [], store: new Map(), clock: undefined as never, compactInstructions: [],
    agents: (o.agents ?? []).map((a) => ({ ...a })), agentListFails: false, order: [], listDelayMs: 0,
    compactVeto: o.compactRejects === true, usage: { ...(o.usage ?? {}) }, autoCompactThreshold: o.autoCompactThreshold,
    breakdownTotal: undefined, tokensAfter: undefined, breakdownFails: false, breakdownCalls: 0, compactTriggers: [],
  }
  for (const [k, v] of Object.entries(o.store ?? {})) w.store.set(k, JSON.parse(JSON.stringify(v)))
  on('store.get', (_, e) => ({ value: w.store.get(e.key) }))
  on('store.set', (_, e) => { w.store.set(e.key, JSON.parse(JSON.stringify(e.value))); return { value: undefined } })
  on('store.delete', (_, e) => { w.store.delete(e.key); return { value: undefined } })
  on('store.keys', () => ({ value: [...w.store.keys()] }))
  w.clock = mock.clock(on, { now: NOW })
  on('session.id', () => ({ value: 'S1' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', (_, e) => {
    const asked = (e as { breakdown?: unknown }).breakdown !== undefined
    if (asked) w.breakdownCalls++
    if (asked && w.breakdownFails) return { deny: 'usage breakdown unavailable' } as never
    return {
      value: {
        startedAt: 0,
        context: {
          window: 1_000_000, percent: w.usage.percent, tokens: w.usage.tokens,
          ...(asked && (w.autoCompactThreshold !== undefined || w.breakdownTotal !== undefined)
            ? {
                breakdown: {
                  ...(w.autoCompactThreshold !== undefined ? { autoCompactThreshold: w.autoCompactThreshold } : {}),
                  ...(w.breakdownTotal !== undefined ? { totalTokens: w.breakdownTotal } : {}),
                  isAutoCompactEnabled: w.autoCompactThreshold !== undefined,
                },
              }
            : {}),
        },
        rateLimits: [],
      },
    } as never
  })
  on('session.messages', () => ({ value: (o.messages ?? []) as never }))
  on('session.compact', (_, e) => {
    w.compacts++
    w.compactInstructions.push(e.instructions)
    w.compactTriggers.push(e.trigger)
    // The kit skips a hook that throws, so a rejection cannot be driven here; a veto ({ skip }) takes the same exit.
    if (w.compactVeto) return { skip: 'compaction refused while a turn runs' } as never
    return {
      messages: [{ role: 'user', text: 'summary', toolUses: [] }],
      ...(w.tokensAfter !== undefined ? { tokensAfter: w.tokensAfter } : {}),
    } as never
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('classic.Stop', () => ({}) as never)
  on('agent.list', async () => {
    if (w.listDelayMs) await w.clock.sleep(w.listDelayMs)
    if (w.agentListFails) return { deny: 'agent list unavailable' } as never
    return { value: w.agents.map((a) => ({ kind: 'local_agent', description: '', type: 'general-purpose', ...a })) as never }
  })
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('ui.notify', (_, e) => {
    w.notifies.push({ text: e.text, title: (e as { title?: string }).title })
    w.order.push('notify')
    return { value: { isSent: false, reason: 'disabled' } }
  })
  on('ui.toast', (_, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.log', (_, e) => { w.logs.push(e.text); return { value: undefined } })
  on('command.register', (_, e) => { w.registered.push(e.name); return { value: { command: e.name } } })
  on('prompt.suggest', (_, e) => { w.suggests.push(e.text); return { isShown: w.suggestShown } })
  on('prompt.submit', (_, e) => {
    if (o.dropPrompt?.(e.text)) return { drop: 'dropped by a test hook' } as never
    w.submits.push({ text: e.text, asUser: (e.origin as { asUser?: boolean }).asUser })
    w.order.push(`submit: ${e.text}`)
    return { text: e.text }
  })
  on('command.run', (_, e) => {
    w.runs.push({ command: e.command, args: e.args })
    if (o.refuse?.includes(e.command)) throw new Error(`unknown command ${e.command}`)
    return { text: `ran ${e.command}` }
  })
  on('tool.call', async (_, e) => {
    const how = o.toolResult?.[e.tool]
    if (how === 'deny') return { deny: 'permission denied' } as never
    if (how === 'error') return { isError: true, result: 'boom', text: 'boom' } as never
    if (e.tool !== 'AskUserQuestion') return { result: {} } as never
    // A hook's { deny } is how the kit makes $.ui.ask reject (a thrown error just skips the hook).
    if (o.dismiss) return { deny: 'dismissed' } as never
    if (o.askError) return { deny: o.askError } as never
    const q = (e as unknown as { questions: { question: string; header: string; options: { label: string }[] }[] }).questions[0]!
    const labels = q.options.map((x) => x.label)
    w.asks.push({ question: q.question, header: q.header, options: labels })
    if (o.askDelayMs) await w.clock.sleep(o.askDelayMs)
    const a = typeof o.answer === 'function' ? o.answer(labels) : (o.answer ?? 'Not now')
    return { result: { questions: [], answers: { [q.question]: a } } } as never
  })
  return w
}

export const measure = (
  $: Dollar, percent: number | undefined, tokens: number | undefined, changed: ('context' | 'rateLimits')[] = ['context'],
) =>
  $.session.measure({
    context: { window: 1_000_000, percent, tokens },
    rateLimits: [],
    changed,
  })

// A slash command as the person types it (the engine stamps the origin and presentation).
export const typed = ($: Dollar, command: string, args: string) =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

export const turnStart = ($: Dollar, agentId?: string) =>
  $.turn.start({ text: 'go', turnId: agentId ? 'ta' : 'tm', ...(agentId ? { agentId } : {}) } as never)
export const turnEnd = ($: Dollar, agentId?: string) =>
  $.turn.complete({
    answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', turnId: agentId ? 'ta' : 'tm',
    ...(agentId ? { agentId } : {}),
  } as never)

export const settle = async (w: World) => { await w.clock.settle(); await w.clock.settle(); await w.clock.settle() }

// A main-thread turn, as the engine reports it, for the handoff turn.
export const turnEndAs = ($: Dollar, reason: 'answer' | 'aborted' | 'error') =>
  $.turn.complete({ answer: 'done', durationMs: 1, isAborted: reason === 'aborted', reason, turnId: 'tm' } as never)
export const writeMd = ($: Dollar, file_path: string) =>
  $.tool.call({ tool: 'Write', file_path, content: '# handoff' } as never)
