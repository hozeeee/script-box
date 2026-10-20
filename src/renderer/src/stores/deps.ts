import type { DepTask } from '@shared/types'
import { invoke, on } from '@renderer/api'
import { create } from 'zustand'

export interface DepTaskSession {
  task: DepTask
  chunks: string[]
  exitCode: number | null
  done: boolean
}

interface DepsState {
  /** Latest task per space */
  tasks: Record<string, DepTaskSession>
  /** Bumped whenever a task finishes so lists and editor types can refresh */
  revision: Record<string, number>
  install: (spaceId: string, specs: string[]) => Promise<DepTask>
  uninstall: (spaceId: string, names: string[]) => Promise<DepTask>
  update: (spaceId: string, specs: string[]) => Promise<DepTask>
  installAll: (spaceId: string) => Promise<DepTask>
  cancel: (taskId: string) => Promise<void>
  sync: () => Promise<void>
  /** Start following a task unless it is already the tracked one */
  track: (task: DepTask) => DepTask
}

export const useDepsStore = create<DepsState>((set, get) => ({
  tasks: {},
  revision: {},
  install: async (spaceId, specs) => get().track(await invoke('deps:install', spaceId, specs)),
  uninstall: async (spaceId, names) => get().track(await invoke('deps:uninstall', spaceId, names)),
  update: async (spaceId, specs) => get().track(await invoke('deps:update', spaceId, specs)),
  installAll: async spaceId => get().track(await invoke('deps:install-all', spaceId)),
  cancel: taskId => invoke('deps:cancel', taskId),
  async sync() {
    for (const task of await invoke('deps:active'))
      get().track(task)
  },
  track(task) {
    const { tasks } = get()
    if (tasks[task.spaceId]?.task.id !== task.id)
      set({ tasks: { ...tasks, [task.spaceId]: { task, chunks: [], exitCode: null, done: false } } })
    return task
  },
}))

on('deps:task', (event) => {
  if (event.type === 'start') {
    useDepsStore.getState().track(event.task)
    return
  }
  const { tasks, revision } = useDepsStore.getState()
  const session = tasks[event.spaceId]
  if (!session || session.task.id !== event.taskId)
    return
  if (event.type === 'data') {
    session.chunks.push(event.data)
    return
  }
  useDepsStore.setState({
    tasks: { ...tasks, [event.spaceId]: { ...session, exitCode: event.code, done: true } },
    revision: { ...revision, [event.spaceId]: (revision[event.spaceId] ?? 0) + 1 },
  })
})
