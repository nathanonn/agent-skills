import type { EngineInterface } from 'claude-code'
import { emptyState, mergeConfig, staleSessionKeys, type Asked, type Config, type SessionState } from './logic'

export const CONFIG_KEY = 'config'
export const sessionKey = (sid: string) => `session:${sid}`

export async function loadConfig($: EngineInterface): Promise<Config> {
  return mergeConfig(await $.store.get(CONFIG_KEY))
}

export async function loadSession($: EngineInterface, sid: string): Promise<SessionState> {
  const v = (await $.store.get(sessionKey(sid))) as Partial<SessionState> | undefined
  return v && Array.isArray(v.asked) ? (v as SessionState) : emptyState()
}

// Read-modify-write of one session entry, one at a time inside this process, so
// detached work (path observers, toasts, alerts) cannot overwrite each other.
let tail: Promise<unknown> = Promise.resolve()

/** `fn` returns the same object to leave the entry alone, or a new one to save. */
export function updateSession(
  $: EngineInterface,
  sid: string,
  fn: (s: SessionState) => SessionState,
): Promise<SessionState> {
  const run = tail.then(async () => {
    const before = await loadSession($, sid)
    const after = fn(before)
    if (after === before) return before
    const saved = { ...after, updatedAt: await $.clock.now() }
    await $.store.set(sessionKey(sid), saved)
    return saved
  })
  tail = run.catch(() => undefined)
  return run
}

/** Record that a tier was actually delivered (a dialog opened, or a suggestion shown). */
export function recordTier($: EngineInterface, sid: string, entry: Asked): Promise<SessionState> {
  return updateSession($, sid, (s) => ({ ...s, asked: [...s.asked, entry] }))
}

/** Roll a recorded tier back (the dialog was refused, not answered or dismissed). */
export function unrecordTier($: EngineInterface, sid: string, entry: Asked): Promise<SessionState> {
  return updateSession($, sid, (s) => {
    const i = s.asked.map((a) => a.at === entry.at && a.pct === entry.pct && a.tokens === entry.tokens).lastIndexOf(true)
    return i < 0 ? s : { ...s, asked: s.asked.filter((_, j) => j !== i) }
  })
}

export async function rememberHandoffPath($: EngineInterface, path: string): Promise<void> {
  const sid = await $.session.id()
  await updateSession($, sid, (s) => (s.handoff === path ? s : { ...s, handoff: path }))
}

export async function pruneSessions($: EngineInterface): Promise<number> {
  const keys = (await $.store.keys()).filter((k) => k.startsWith('session:'))
  const entries: Record<string, unknown> = {}
  for (const k of keys) entries[k] = await $.store.get(k)
  const stale = staleSessionKeys(entries, await $.clock.now())
  for (const k of stale) await $.store.delete(k)
  return stale.length
}
