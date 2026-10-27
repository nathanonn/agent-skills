import { test, expect, mock, type TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]
type Dollar = Parameters<TestBody>[0]

const DAY = 86_400_000
const NOW = 100 * DAY

type World = {
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
  registered: string[]
  clock: ReturnType<typeof mock.clock>
  store: Map<string, unknown>
}

type Opts = {
  /** What the dialog answers; default "Not now". */
  answer?: string | ((labels: string[]) => string)
  agents?: { id: string; status: string }[]
  /** Hold the dialog's answer on the mocked clock for this long. */
  askDelayMs?: number
  usage?: { percent?: number; tokens?: number }
  store?: Record<string, unknown>
  /** Command names whose $.command.run the world refuses. */
  refuse?: string[]
  /** The dialog is dismissed (the call rejects), as in -p runs. */
  dismiss?: boolean
  /** The dialog rejects with this message (a host refusal, not a dismissal). */
  askError?: string
  /** session.compact comes back vetoed ({ skip }); the kit cannot make it reject. */
  compactRejects?: boolean
  /** What $.session.messages() returns (resume backfill). */
  messages?: unknown[]
}

// Every hook below stands for the engine: nothing sits beneath the plugin.
function world($: Dollar, on: On, o: Opts = {}): World {
  const w: World = {
    asks: [], toasts: [], suggests: [], notifies: [], suggestShown: true, submits: [], runs: [], logs: [], compacts: 0,
    registered: [], store: new Map(), clock: undefined as never,
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
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 1_000_000, percent: o.usage?.percent, tokens: o.usage?.tokens },
      rateLimits: [],
    },
  }))
  on('session.messages', () => ({ value: (o.messages ?? []) as never }))
  on('session.compact', () => {
    w.compacts++
    // The kit skips a hook that throws, so a rejection cannot be driven here; a veto ({ skip }) takes the same exit.
    if (o.compactRejects) return { skip: 'compaction refused while a turn runs' } as never
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] } as never
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('classic.Stop', () => ({}) as never)
  on('agent.list', () => ({ value: (o.agents ?? []) as never }))
  on('ui.notify', (_, e) => {
    w.notifies.push({ text: e.text, title: (e as { title?: string }).title })
    return { value: { isSent: false, reason: 'disabled' } }
  })
  on('ui.toast', (_, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.log', (_, e) => { w.logs.push(e.text); return { value: undefined } })
  on('command.register', (_, e) => { w.registered.push(e.name); return { value: { command: e.name } } })
  on('prompt.suggest', (_, e) => { w.suggests.push(e.text); return { isShown: w.suggestShown } })
  on('prompt.submit', (_, e) => { w.submits.push({ text: e.text, asUser: (e.origin as { asUser?: boolean }).asUser }); return { text: e.text } })
  on('command.run', (_, e) => {
    w.runs.push({ command: e.command, args: e.args })
    if (o.refuse?.includes(e.command)) throw new Error(`unknown command ${e.command}`)
    return { text: `ran ${e.command}` }
  })
  on('tool.call', async (_, e) => {
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

const measure = (
  $: Dollar, percent: number | undefined, tokens: number | undefined, changed: ('context' | 'rateLimits')[] = ['context'],
) =>
  $.session.measure({
    context: { window: 1_000_000, percent, tokens },
    rateLimits: [],
    changed,
  })

// A slash command as the person types it (the engine stamps the origin and presentation).
const typed = ($: Dollar, command: string, args: string) =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

const turnStart = ($: Dollar, agentId?: string) =>
  $.turn.start({ text: 'go', turnId: agentId ? 'ta' : 'tm', ...(agentId ? { agentId } : {}) } as never)
const turnEnd = ($: Dollar, agentId?: string) =>
  $.turn.complete({
    answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', turnId: agentId ? 'ta' : 'tm',
    ...(agentId ? { agentId } : {}),
  } as never)

const settle = async (w: World) => { await w.clock.settle(); await w.clock.settle(); await w.clock.settle() }

test('below threshold: no dialog', async ($, on) => {
  const w = world($, on)
  await measure($, 39, 120_000)
  await settle(w)
  expect(w.asks.length).toBe(0)
})

test('crossing: tier stored and the dialog asked with four options', async ($, on) => {
  const w = world($, on)
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
  expect(w.asks[0]!.header).toBe('Context')
  expect(w.asks[0]!.options).toEqual(['Handoff, then compact', 'Handoff only', 'Compact now', 'Not now'])
  expect(w.asks[0]!.question).toContain('41%')
  const stored = w.store.get('session:S1') as { asked: { pct: number; tokens: number }[] }
  expect(stored.asked.length).toBe(1)
  expect(stored.asked[0]!.pct).toBe(41)
})

test('second measure in the same tier does not ask again', async ($, on) => {
  const w = world($, on)
  await measure($, 41, 410_000)
  await settle(w)
  await measure($, 44, 440_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
})

test('next tier (+15 points) asks again', async ($, on) => {
  const w = world($, on)
  await measure($, 41, 410_000)
  await settle(w)
  await measure($, 56, 560_000)
  await settle(w)
  expect(w.asks.length).toBe(2)
})

test('a drop below the first threshold re-arms', async ($, on) => {
  const w = world($, on)
  await measure($, 41, 410_000)
  await settle(w)
  await measure($, 5, 50_000)
  await settle(w)
  const cleared = w.store.get('session:S1') as { asked: unknown[] }
  expect(cleared.asked.length).toBe(0)
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(2)
})

test('unknown fill is skipped', async ($, on) => {
  const w = world($, on)
  await measure($, undefined, undefined)
  await settle(w)
  expect(w.asks.length).toBe(0)
  expect(w.store.get('session:S1')).toBeUndefined()
})

test('the measure hook returns before the dialog is answered (never blocks)', async ($, on) => {
  const w = world($, on, { answer: 'Compact now', askDelayMs: 5000 })
  const r = await measure($, 41, 410_000)
  expect(r.changed).toEqual(['context'])
  expect(w.runs.length).toBe(0)
  await w.clock.advance(5000)
  await settle(w)
  expect(w.runs).toEqual([{ command: 'compact', args: '' }])
})

test('answers: Not now does nothing, Compact now compacts, free text is submitted as the user', async ($, on) => {
  const a = world($, on, { answer: 'Not now' })
  await measure($, 41, 410_000)
  await settle(a)
  expect(a.compacts).toBe(0)
  expect(a.submits.length).toBe(0)
  expect(a.runs.length).toBe(0)
})

test('Compact now queues /compact through $.command.run', async ($, on) => {
  const w = world($, on, { answer: 'Compact now' })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.runs).toEqual([{ command: 'compact', args: '' }])
  expect(w.compacts).toBe(0)
})

test('Compact now: /compact refused, then session.compact', async ($, on) => {
  const w = world($, on, { answer: 'Compact now', refuse: ['compact'] })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.runs.map((r) => r.command)).toEqual(['compact'])
  expect(w.compacts).toBe(1)
  expect(w.toasts.length).toBe(0)
})

test('Compact now: both refused, a toast says to run /compact and the reason is logged', async ($, on) => {
  const w = world($, on, { answer: 'Compact now', refuse: ['compact'], compactRejects: true })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.compacts).toBe(1)
  expect(w.toasts).toContain("Compaction couldn't start; run /compact")
  expect(w.logs.some((l) => l.includes('compaction refused while a turn runs'))).toBe(true)
})

test('free text under Other goes to Claude as the user', async ($, on) => {
  const w = world($, on, { answer: 'handoff then compact' })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.submits).toEqual([{ text: 'handoff then compact', asUser: true }])
})

test('handoff with no known path: a prompt asks Claude for the destination', async ($, on) => {
  const w = world($, on, { answer: 'Handoff only' })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.runs.length).toBe(0)
  expect(w.submits.length).toBe(1)
  expect(w.submits[0]!.text).toContain('handoff-doc')
  expect(w.submits[0]!.text).toContain('AskUserQuestion')
  expect(w.submits[0]!.text).toContain('`handoff-doc`')
  expect(w.submits[0]!.text).toContain('`context-alert:handoff-doc`')
  expect(w.logs.some((l) => l.includes('no known path'))).toBe(true)
})

test('/context-alert set percent 35 then status reflects it, and 36% now fires', async ($, on) => {
  const w = world($, on)
  const set = await typed($, 'context-alert', 'set percent 35')
  expect(set.text).toContain('percent = 35')
  const status = await typed($, 'context-alert', '')
  expect(status.text).toContain('first alert at 35%')
  expect(status.text).toContain('Asked this session: none yet')
  await measure($, 36, 100_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
  const after = await typed($, 'context-alert', 'status')
  expect(after.text).toContain('36%')
  expect(after.text).toContain('Next alert at: 51%')
})

test('/context-alert refuses bad input and reset restores defaults', async ($, on) => {
  const w = world($, on)
  expect((await typed($, 'context-alert', 'set percent abc')).text).toContain('positive number')
  expect((await typed($, 'context-alert', 'set nope 1')).text).toContain('unknown key')
  await typed($, 'context-alert', 'set notify false')
  const reset = await typed($, 'context-alert', 'reset')
  expect(reset.text).toContain('defaults')
  expect((w.store.get('config') as { notify: boolean }).notify).toBe(true)
})

test('enabled=false: no dialog, no toast', async ($, on) => {
  const w = world($, on, { usage: { percent: 90, tokens: 900_000 } })
  await typed($, 'context-alert', 'set enabled false')
  await measure($, 90, 900_000)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await settle(w)
  expect(w.asks.length).toBe(0)
  expect(w.toasts.length).toBe(0)
})

test('/handoff-doc <path> is observed and the next dialog offers an update', async ($, on) => {
  const w = world($, on)
  const r = await typed($, 'handoff-doc', '/proj/handoff/20261027_02_slug.md')
  expect(r.text).toBe('ran handoff-doc')
  await settle(w)
  expect((w.store.get('session:S1') as { handoff: string }).handoff).toBe('/proj/handoff/20261027_02_slug.md')
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks[0]!.options.slice(0, 2)).toEqual(['Update handoff, then compact', 'Update handoff only'])
  expect(w.asks[0]!.question).toContain('…/handoff/20261027_02_slug.md')
})

test('the bundled copy and the Skill tool are observed too', async ($, on) => {
  const w = world($, on)
  await typed($, 'context-alert:handoff-doc', 'notes/a.md')
  await settle(w)
  expect((w.store.get('session:S1') as { handoff: string }).handoff).toBe('notes/a.md')
  await $.tool.call({ tool: 'Skill', skill: 'handoff-doc', args: '/x/h/b.md' } as never)
  await settle(w)
  expect((w.store.get('session:S1') as { handoff: string }).handoff).toBe('/x/h/b.md')
  expect(w.logs.some((l) => l.includes('Skill tool input shape'))).toBe(true)
})

test('a handoff-doc call with no path records nothing', async ($, on) => {
  const w = world($, on)
  await typed($, 'handoff-doc', '')
  await settle(w)
  expect(w.store.get('session:S1')).toBeUndefined()
})

test('handoff with a known path runs the project skill through $.command.run', async ($, on) => {
  const w = world($, on, { answer: (l) => l[0]!, store: { 'session:S1': { asked: [], handoff: '/p/h/a.md', updatedAt: NOW } } })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.runs).toEqual([{ command: 'handoff-doc', args: '/p/h/a.md' }])
  expect(w.submits.length).toBe(0)
  expect(w.logs.some((l) => l.includes('command handoff-doc'))).toBe(true)
})

test('whenBusy=suggest with a running agent: toast and suggestion, no dialog', async ($, on) => {
  const w = world($, on, { agents: [{ id: 'a1', status: 'running' }] })
  await typed($, 'context-alert', 'set whenBusy suggest')
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(0)
  expect(w.suggests).toEqual(['write a handoff doc'])
  expect(w.toasts.some((t) => t.includes('41%'))).toBe(true)
  // the tier is still recorded, so it does not repeat
  expect((w.store.get('session:S1') as { asked: unknown[] }).asked.length).toBe(1)
})

test('whenBusy=suggest with nothing running: the dialog opens as usual', async ($, on) => {
  const w = world($, on, { agents: [{ id: 'a1', status: 'idle' }] })
  await typed($, 'context-alert', 'set whenBusy suggest')
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
  expect(w.suggests.length).toBe(0)
})

test('mid-turn toast: once per tier, and the turn-end dialog still fires', async ($, on) => {
  const w = world($, on, { usage: { percent: 45, tokens: 450_000 } })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await settle(w)
  await $.tool.call({ tool: 'Bash', command: 'pwd' })
  await settle(w)
  expect(w.toasts.length).toBe(1)
  expect(w.toasts[0]).toContain('45%')
  expect(w.asks.length).toBe(0)
  await measure($, 45, 450_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
})

test('mid-turn toast stays quiet below the threshold and in subagents', async ($, on) => {
  const w = world($, on, { usage: { percent: 30, tokens: 200_000 } })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await settle(w)
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'sub1' })
  await settle(w)
  expect(w.toasts.length).toBe(0)
})

test('mid-turn toast off', async ($, on) => {
  const w = world($, on, { usage: { percent: 60, tokens: 600_000 } })
  await typed($, 'context-alert', 'set midTurnToast false')
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await settle(w)
  expect(w.toasts.length).toBe(0)
})

test('session.start registers /context-alert and prunes old session entries', async ($, on) => {
  const w = world($, on, {
    store: {
      'session:old': { asked: [], updatedAt: NOW - 40 * DAY },
      'session:fresh': { asked: [], updatedAt: NOW - 1 * DAY },
      config: { percent: 40 },
    },
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await settle(w)
  expect(w.registered).toEqual(['context-alert'])
  const keys = [...w.store.keys()]
  expect(keys.includes('session:old')).toBe(false)
  expect(keys.includes('session:fresh')).toBe(true)
  expect(keys.includes('config')).toBe(true)
})

test('fallback chain: project skill refused, then the bundled copy', async ($, on) => {
  const w = world($, on, {
    answer: (l) => l[0]!, refuse: ['handoff-doc'],
    store: { 'session:S1': { asked: [], handoff: '/p/h/a.md', updatedAt: NOW } },
  })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.runs.map((r) => r.command)).toEqual(['handoff-doc', 'context-alert:handoff-doc'])
  expect(w.submits.length).toBe(0)
})

test('fallback chain: both refused, a prompt asks Claude to update the known path', async ($, on) => {
  const w = world($, on, {
    answer: (l) => l[0]!, refuse: ['handoff-doc', 'context-alert:handoff-doc'],
    store: { 'session:S1': { asked: [], handoff: '/p/h/a.md', updatedAt: NOW } },
  })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.submits.length).toBe(1)
  expect(w.submits[0]!.text).toContain('/p/h/a.md')
  expect(w.logs.some((l) => l.includes('prompt (update, known path)'))).toBe(true)
})

test('a dismissed dialog (or -p run) stays silent and the tier is still recorded', async ($, on) => {
  const w = world($, on, { dismiss: true })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.compacts + w.submits.length + w.runs.length).toBe(0)
  expect((w.store.get('session:S1') as { asked: unknown[] }).asked.length).toBe(1)
})

// ---- Fixes applied 2026-10-27 (review/01-pre-live-review.md) ----

const askedCount = (w: World) => (w.store.get('session:S1') as { asked: unknown[] } | undefined)?.asked.length ?? 0
const stopWith = ($: Dollar, tasks: { id: string; type: string; status: string; description: string }[]) =>
  $.classic.Stop({ stop_hook_active: false, background_tasks: tasks } as never)

test('a measure during a main turn waits; the dialog opens when the turn completes', async ($, on) => {
  const w = world($, on, { usage: { percent: 41, tokens: 410_000 } })
  await turnStart($)
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(0)
  expect(askedCount(w)).toBe(0) // the tier is not consumed while nothing was delivered
  await turnEnd($)
  await settle(w)
  expect(w.asks.length).toBe(1)
  expect(askedCount(w)).toBe(1)
})

test('a sub-agent turn does not count as the main loop running', async ($, on) => {
  const w = world($, on)
  await turnStart($, 'sub1')
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
  await turnEnd($, 'sub1')
})

test('a measure after the turn ended asks at once; a rate-limit-only measure does not', async ($, on) => {
  const w = world($, on)
  await turnStart($)
  await turnEnd($)
  await measure($, 90, 900_000, ['rateLimits'])
  await settle(w)
  expect(w.asks.length).toBe(0)
  await measure($, 90, 900_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
})

test('a drop below the thresholds mid-turn still re-arms', async ($, on) => {
  const w = world($, on, { store: { 'session:S1': { asked: [{ pct: 41, tokens: 410_000, at: 1 }], updatedAt: NOW } } })
  await turnStart($)
  await measure($, 5, 50_000)
  await settle(w)
  expect(askedCount(w)).toBe(0)
})

test('suggest not shown: tier kept, one toast and one notification, retried at the next idle measure', async ($, on) => {
  const w = world($, on, { agents: [{ id: 'a1', status: 'running' }], usage: { percent: 41, tokens: 410_000 } })
  await typed($, 'context-alert', 'set whenBusy suggest')
  w.suggestShown = false
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.suggests.length).toBe(1)
  expect(w.toasts.length).toBe(1)
  expect(w.notifies.length).toBe(1)
  expect(w.notifies[0]!.title).toBe('Context at 41%')
  expect(askedCount(w)).toBe(0)
  expect(w.logs.some((l) => l.includes('suggestion not shown'))).toBe(true)
  w.suggestShown = true
  await measure($, 41, 410_000, ['rateLimits']) // only the pending alert makes this one act
  await settle(w)
  expect(w.suggests.length).toBe(2)
  expect(w.toasts.length).toBe(1)
  expect(w.notifies.length).toBe(1)
  expect(askedCount(w)).toBe(1)
  await measure($, 41, 410_000, ['rateLimits'])
  await settle(w)
  expect(w.suggests.length).toBe(2) // delivered, nothing pending
})

test('suggest with notify off sends no notification', async ($, on) => {
  const w = world($, on, { agents: [{ id: 'a1', status: 'running' }] })
  await typed($, 'context-alert', 'set whenBusy suggest')
  await typed($, 'context-alert', 'set notify false')
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.notifies.length).toBe(0)
  expect(w.suggests.length).toBe(1)
})

test('no second dialog while one is pending, and no tier recorded meanwhile', async ($, on) => {
  const w = world($, on, { askDelayMs: 5000 })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
  await measure($, 56, 560_000) // next tier, but the first dialog is still open
  await settle(w)
  expect(w.asks.length).toBe(1)
  expect(askedCount(w)).toBe(1)
  await w.clock.advance(5000)
  await settle(w)
  await measure($, 56, 560_000)
  await settle(w)
  expect(w.asks.length).toBe(2)
  expect(askedCount(w)).toBe(2)
})

for (const status of ['pending', 'running', 'waiting']) {
  test(`an agent that is ${status} counts as busy`, async ($, on) => {
    const w = world($, on, { agents: [{ id: 'a1', status }] })
    await typed($, 'context-alert', 'set whenBusy suggest')
    await measure($, 41, 410_000)
    await settle(w)
    expect(w.asks.length).toBe(0)
    expect(w.suggests.length).toBe(1)
  })
}

test('an idle or finished agent is not busy', async ($, on) => {
  const w = world($, on, { agents: [{ id: 'a1', status: 'idle' }, { id: 'a2', status: 'completed' }] })
  await typed($, 'context-alert', 'set whenBusy suggest')
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
})

test('background tasks from the last Stop make the session busy; an empty list clears it', async ($, on) => {
  const w = world($, on)
  await typed($, 'context-alert', 'set whenBusy suggest')
  await stopWith($, [{ id: 'b1', type: 'shell', status: 'running', description: 'sleep 60' }])
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(0)
  expect(w.suggests.length).toBe(1)
  await stopWith($, [])
  await typed($, 'context-alert', 'reset session')
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
})

test('a refused dialog is logged, the tier rolled back and retried at the next idle point', async ($, on) => {
  const w = world($, on, { askError: 'Another dialog is already open', usage: { percent: 41, tokens: 410_000 } })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(0)
  expect(askedCount(w)).toBe(0)
  expect(w.logs.some((l) => l.includes('Another dialog is already open'))).toBe(true)
  await turnStart($)
  await turnEnd($) // pending retry at the idle point
  await settle(w)
  expect(w.logs.filter((l) => l.includes('Another dialog is already open')).length).toBeGreaterThan(1)
})

test('a refusal cannot loop forever: after three the tier is consumed', async ($, on) => {
  const w = world($, on, { askError: 'Another dialog is already open', usage: { percent: 41, tokens: 410_000 } })
  for (let i = 0; i < 6; i++) { await measure($, 41, 410_000); await settle(w) }
  expect(askedCount(w)).toBe(1)
})

test('a dismissal is logged and keeps the tier', async ($, on) => {
  const w = world($, on, { dismiss: true })
  await measure($, 41, 410_000)
  await settle(w)
  expect(askedCount(w)).toBe(1)
  expect(w.logs.some((l) => l.includes('dismissed'))).toBe(true)
})

test('a Write or Edit of a .md under handoff/ on the main thread is remembered, latest wins', async ($, on) => {
  const w = world($, on)
  await $.tool.call({ tool: 'Write', file_path: '/p/handoff/20261027_01_a.md', content: 'x' } as never)
  await settle(w)
  expect((w.store.get('session:S1') as { handoff: string }).handoff).toBe('/p/handoff/20261027_01_a.md')
  await $.tool.call({ tool: 'Edit', file_path: '/p/handoff/20261027_02_b.md', old_string: 'a', new_string: 'b' } as never)
  await settle(w)
  expect((w.store.get('session:S1') as { handoff: string }).handoff).toBe('/p/handoff/20261027_02_b.md')
})

test('other writes and sub-agent writes are not remembered', async ($, on) => {
  const w = world($, on)
  await $.tool.call({ tool: 'Write', file_path: '/p/notes/a.md', content: 'x' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/p/handoff/a.json', content: 'x' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/p/handoff/a.md', content: 'x', agentId: 'sub1' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/p/handoff/a.md' } as never)
  await settle(w)
  expect(w.store.get('session:S1')).toBeUndefined()
})

test('show is an alias of status', async ($, on) => {
  world($, on)
  const show = await typed($, 'context-alert', 'show')
  expect(show.text).toContain('Next alert at')
  expect(show.text).toContain('Known handoff path')
})

test('only "reset" and "reset session" reset; a typo prints usage and keeps the settings', async ($, on) => {
  const w = world($, on)
  await typed($, 'context-alert', 'set notify false')
  const typo = await typed($, 'context-alert', 'reset sesion')
  expect(typo.text).toContain('Usage')
  expect(typo.text).toContain('show')
  expect((w.store.get('config') as { notify: boolean }).notify).toBe(false)
  expect((await typed($, 'context-alert', 'reset session now')).text).toContain('Usage')
  expect((w.store.get('config') as { notify: boolean }).notify).toBe(false)
  expect((await typed($, 'context-alert', 'reset session')).text).toContain('Cleared')
  expect((await typed($, 'context-alert', 'reset')).text).toContain('defaults')
})

test('a non-interactive run sends no notification; an interactive one does', async ($, on) => {
  const w = world($, on)
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  await settle(w)
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.notifies.length).toBe(0)
})

test('the dialog sends the notification when notify is on', async ($, on) => {
  const w = world($, on)
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.notifies.length).toBe(1)
})

test('the mid-turn toast promises a handoff prompt, not a dialog', async ($, on) => {
  const w = world($, on, { usage: { percent: 45, tokens: 450_000 } })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await settle(w)
  expect(w.toasts[0]).toContain('A handoff prompt follows when this turn ends.')
})

test('the Skill shape is logged only for a handoff skill call', async ($, on) => {
  const w = world($, on)
  await $.tool.call({ tool: 'Skill', skill: 'commit', args: '' } as never)
  await settle(w)
  expect(w.logs.some((l) => l.includes('Skill tool input shape'))).toBe(false)
  await $.tool.call({ tool: 'Skill', skill: 'context-alert:handoff-doc', args: '/x/h/c.md' } as never)
  await settle(w)
  expect(w.logs.some((l) => l.includes('Skill tool input shape'))).toBe(true)
})

test('resume backfill: typed /handoff-doc, a Skill call and a handoff Write, latest wins', async ($, on) => {
  const w = world($, on, {
    messages: [
      { role: 'user', text: '/handoff-doc /p/h/a.md', toolUses: [] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 't1', tool: 'Skill', input: { skill: 'handoff-doc', args: '/p/h/b.md' } }] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 't2', tool: 'Write', input: { file_path: '/p/handoff/c.md' } }] },
    ],
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await settle(w)
  expect((w.store.get('session:S1') as { handoff: string }).handoff).toBe('/p/handoff/c.md')
})

test('resume backfill from a typed /handoff-doc alone', async ($, on) => {
  const w = world($, on, { messages: [{ role: 'user', text: '/handoff-doc /p/h/a.md', toolUses: [] }] })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await settle(w)
  expect((w.store.get('session:S1') as { handoff: string }).handoff).toBe('/p/h/a.md')
})

test('/context-alert set is picked up by the next alert (config cache refreshed)', async ($, on) => {
  const w = world($, on)
  await typed($, 'context-alert', 'set enabled false')
  await measure($, 90, 900_000)
  await settle(w)
  expect(w.asks.length).toBe(0)
  await typed($, 'context-alert', 'set enabled true')
  await measure($, 90, 900_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
})

// A main-thread turn, as the engine reports it, for the handoff turn.
const turnEndAs = ($: Dollar, reason: 'answer' | 'aborted' | 'error') =>
  $.turn.complete({ answer: 'done', durationMs: 1, isAborted: reason === 'aborted', reason, turnId: 'tm' } as never)
const writeMd = ($: Dollar, file_path: string) =>
  $.tool.call({ tool: 'Write', file_path, content: '# handoff' } as never)

test('Handoff only: the handoff runs and nothing compacts after its turn', async ($, on) => {
  const w = world($, on, { answer: 'Handoff only' })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.submits.length).toBe(1)
  await turnStart($)
  await writeMd($, '/proj/handoff/20261027_03_x.md')
  await turnEndAs($, 'answer')
  await settle(w)
  expect(w.runs.some((r) => r.command === 'compact')).toBe(false)
})

test('Handoff, then compact: compacts once the handoff turn wrote a .md and ended', async ($, on) => {
  const w = world($, on, { answer: 'Handoff, then compact' })
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.submits.length).toBe(1)
  await turnStart($)
  expect(w.runs.some((r) => r.command === 'compact')).toBe(false)
  await writeMd($, '/proj/docs/session-notes.md')
  await turnEndAs($, 'answer')
  await settle(w)
  expect(w.runs.filter((r) => r.command === 'compact').length).toBe(1)
  expect(w.toasts).toContain('Handoff doc written. Compacting.')
})

test('Handoff, then compact: waits across a turn with no write, then compacts', async ($, on) => {
  const w = world($, on, { answer: 'Handoff, then compact' })
  await measure($, 41, 410_000)
  await settle(w)
  await turnStart($)
  await turnEndAs($, 'answer') // Claude asked for the path in plain text
  await settle(w)
  expect(w.runs.some((r) => r.command === 'compact')).toBe(false)
  await turnStart($)
  await writeMd($, '/proj/handoff/a.md')
  await turnEndAs($, 'answer')
  await settle(w)
  expect(w.runs.filter((r) => r.command === 'compact').length).toBe(1)
})

test('Handoff, then compact: an interrupted handoff turn does not compact', async ($, on) => {
  const w = world($, on, { answer: 'Handoff, then compact' })
  await measure($, 41, 410_000)
  await settle(w)
  await turnStart($)
  await writeMd($, '/proj/handoff/a.md')
  await turnEndAs($, 'aborted')
  await settle(w)
  expect(w.runs.some((r) => r.command === 'compact')).toBe(false)
  expect(w.toasts.some((t) => t.includes('did not finish'))).toBe(true)
})

test('Handoff, then compact: gives up after three turns without a write', async ($, on) => {
  const w = world($, on, { answer: 'Handoff, then compact' })
  await measure($, 41, 410_000)
  await settle(w)
  for (let i = 0; i < 3; i++) { await turnStart($); await turnEndAs($, 'answer'); await settle(w) }
  expect(w.toasts.some((t) => t.includes('No handoff doc was written'))).toBe(true)
  await turnStart($)
  await writeMd($, '/proj/handoff/a.md')
  await turnEndAs($, 'answer')
  await settle(w)
  expect(w.runs.some((r) => r.command === 'compact')).toBe(false)
})

test('a compaction resets the tiers to the first threshold, even when the fill stays above it', async ($, on) => {
  const w = world($, on, {
    store: {
      config: { percent: 12 },
      'session:S1': { asked: [{ pct: 12, tokens: 118_000, at: 1 }], toastedAt: { pct: 27, tokens: 268_000 }, updatedAt: NOW },
    },
  })
  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as never)
  await settle(w)
  const s = w.store.get('session:S1') as { asked: unknown[]; toastedAt?: unknown }
  expect(s.asked).toEqual([])
  expect(s.toastedAt).toBeUndefined()
  await measure($, 13, 130_000) // the step-up would have waited for 27%
  await settle(w)
  expect(w.asks.length).toBe(1)
})

test('a vetoed compaction keeps the tiers', async ($, on) => {
  const w = world($, on, {
    compactRejects: true,
    store: { 'session:S1': { asked: [{ pct: 41, tokens: 410_000, at: 1 }], updatedAt: NOW } },
  })
  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as never)
  await settle(w)
  expect((w.store.get('session:S1') as { asked: unknown[] }).asked.length).toBe(1)
})

test('Not now, keep going: the next alert steps up (+15 points)', async ($, on) => {
  const w = world($, on)
  await measure($, 41, 410_000)
  await settle(w)
  await measure($, 50, 500_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
  await measure($, 56, 560_000)
  await settle(w)
  expect(w.asks.length).toBe(2)
})

// ---- Main session only: no sub-agent event (agentId set) may act or change state ----

const SUB = 'a1'
const subCompact = ($: Dollar) =>
  $.session.compact({
    trigger: 'auto', agentId: SUB, messages: [{ role: 'user', text: 'hi', toolUses: [] }],
  } as never)

test('main only: a sub-agent handoff Skill call does not set the handoff path or log the shape', async ($, on) => {
  const w = world($, on)
  await $.tool.call({ tool: 'Skill', skill: 'handoff-doc', args: '/x/h/sub.md', agentId: SUB } as never)
  await settle(w)
  expect(w.store.get('session:S1')).toBeUndefined()
  expect(w.logs.some((l) => l.includes('Skill tool input shape'))).toBe(false)
  await $.tool.call({ tool: 'Skill', skill: 'handoff-doc', args: '/x/h/main.md' } as never)
  await settle(w)
  expect((w.store.get('session:S1') as { handoff: string }).handoff).toBe('/x/h/main.md')
})

test('main only: a sub-agent Write of a handoff .md does not overwrite the recorded path', async ($, on) => {
  const w = world($, on)
  await writeMd($, '/p/handoff/main.md')
  await settle(w)
  await $.tool.call({ tool: 'Write', file_path: '/p/handoff/sub.md', content: 'x', agentId: SUB } as never)
  await settle(w)
  expect((w.store.get('session:S1') as { handoff: string }).handoff).toBe('/p/handoff/main.md')
})

test('main only: sub-agent tool calls at high fill never toast', async ($, on) => {
  const w = world($, on, { usage: { percent: 80, tokens: 800_000 } })
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: 'ls', agentId: SUB } as never)
  await settle(w)
  expect(w.toasts.length).toBe(0)
  expect(w.store.get('session:S1')).toBeUndefined()
})

test('main only: a sub-agent turn ending does not open a pending alert', async ($, on) => {
  const w = world($, on, { usage: { percent: 41, tokens: 410_000 } })
  await turnStart($)
  await measure($, 41, 410_000)
  await settle(w)
  await turnStart($, SUB)
  await turnEnd($, SUB)
  await settle(w)
  expect(w.asks.length).toBe(0)
  await turnEnd($)
  await settle(w)
  expect(w.asks.length).toBe(1)
})

test('main only: a sub-agent turn does not start or end the main turn', async ($, on) => {
  const w = world($, on, { usage: { percent: 41, tokens: 410_000 } })
  await turnStart($, SUB) // main is not running, so a measure may still alert
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
  await typed($, 'context-alert', 'reset session')
  await turnStart($)
  await turnEnd($, SUB) // must not mark the main turn finished
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
})

test('main only: sub-agent writes and turns do not drive "Handoff, then compact"', async ($, on) => {
  const w = world($, on, { answer: 'Handoff, then compact' })
  await measure($, 41, 410_000)
  await settle(w)
  await turnStart($)
  await turnStart($, SUB)
  await $.tool.call({ tool: 'Write', file_path: '/p/handoff/sub.md', content: 'x', agentId: SUB } as never)
  for (let i = 0; i < 4; i++) { await turnEnd($, SUB); await settle(w) } // would hit the three-turn give-up if counted
  expect(w.runs.some((r) => r.command === 'compact')).toBe(false)
  expect(w.toasts.some((t) => t.includes('Handoff doc written') || t.includes('No handoff doc'))).toBe(false)
  await turnEnd($) // main wrote nothing yet: still waiting, one turn counted
  await settle(w)
  expect(w.runs.some((r) => r.command === 'compact')).toBe(false)
  await turnStart($)
  await writeMd($, '/p/handoff/main.md')
  await turnEnd($)
  await settle(w)
  expect(w.runs.filter((r) => r.command === 'compact').length).toBe(1)
})

test('main only: a sub-agent session.compact does not reset the tiers or clear the compaction flow', async ($, on) => {
  const w = world($, on)
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(1)
  await subCompact($)
  await settle(w)
  await measure($, 42, 420_000) // a real reset would ask again at the first threshold
  await settle(w)
  expect(w.asks.length).toBe(1)
  await measure($, 56, 560_000) // the step-up tier still applies
  await settle(w)
  expect(w.asks.length).toBe(2)
})

test('main only: a sub-agent session.compact leaves "Handoff, then compact" armed', async ($, on) => {
  const w = world($, on, { answer: 'Handoff, then compact' })
  await measure($, 41, 410_000)
  await settle(w)
  await turnStart($)
  await subCompact($)
  await writeMd($, '/p/handoff/main.md')
  await turnEnd($)
  await settle(w)
  expect(w.runs.filter((r) => r.command === 'compact').length).toBe(1)
})

test('main only: a Stop carrying an agent_id does not change the background-task count', async ($, on) => {
  const w = world($, on)
  await typed($, 'context-alert', 'set whenBusy suggest')
  await $.classic.Stop({
    stop_hook_active: false, agent_id: SUB,
    background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'sleep 60' }],
  } as never)
  await measure($, 41, 410_000)
  await settle(w)
  expect(w.asks.length).toBe(1) // not busy: the dialog opens
  expect(w.suggests.length).toBe(0)
})
