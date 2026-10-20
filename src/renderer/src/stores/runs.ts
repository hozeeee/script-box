import type { RunRecord } from '@shared/types'
import { invoke, on } from '@renderer/api'
import { create } from 'zustand'

/** Keep at most this many output chunks per run in memory for re-mounting terminals */
const MAX_CHUNKS = 5000

export interface RunSession {
  record: RunRecord
  chunks: string[]
}

interface RunsState {
  sessions: Record<string, RunSession>
  /** Latest run id per `${spaceId}/${script}` */
  latest: Record<string, string>
  start: (spaceId: string, script: string) => Promise<RunRecord>
  stop: (runId: string) => Promise<void>
  /** Remove a finished session from the tab bar */
  close: (runId: string) => void
  sync: () => Promise<void>
}

export const runKey = (spaceId: string, script: string): string => `${spaceId}/${script}`

export const useRunsStore = create<RunsState>((set, get) => ({
  sessions: {},
  latest: {},
  async start(spaceId, script) {
    const record = await invoke('run:start', spaceId, script, { cols: 120, rows: 30 })
    const key = runKey(spaceId, script)
    const sessions = { ...get().sessions }
    const previous = get().latest[key]
    if (previous && sessions[previous]?.record.status !== 'running')
      delete sessions[previous]
    sessions[record.id] = { record, chunks: [] }
    set({ sessions, latest: { ...get().latest, [key]: record.id } })
    return record
  },
  stop: runId => invoke('run:stop', runId),
  close(runId) {
    const { [runId]: session, ...sessions } = get().sessions
    if (!session)
      return
    const key = runKey(session.record.spaceId, session.record.script)
    const latest = { ...get().latest }
    if (latest[key] === runId)
      delete latest[key]
    set({ sessions, latest })
  },
  async sync() {
    const active = await invoke('run:active')
    const sessions = { ...get().sessions }
    const latest = { ...get().latest }
    for (const record of active) {
      sessions[record.id] ??= { record, chunks: [] }
      latest[runKey(record.spaceId, record.script)] = record.id
    }
    set({ sessions, latest })
  },
}))

on('run:output', ({ runId, data }) => {
  const session = useRunsStore.getState().sessions[runId]
  if (!session)
    return
  // Mutate in place: terminals read chunks once on mount, then follow the event stream
  session.chunks.push(data)
  if (session.chunks.length > MAX_CHUNKS)
    session.chunks.splice(0, session.chunks.length - MAX_CHUNKS)
})

on('run:exit', ({ record }) => {
  const { sessions } = useRunsStore.getState()
  const session = sessions[record.id]
  if (session)
    useRunsStore.setState({ sessions: { ...sessions, [record.id]: { ...session, record } } })
})
