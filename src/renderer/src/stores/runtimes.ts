import type { InstalledRuntime, RemoteNodeVersion, RuntimeInstallProgress } from '@shared/types'
import { invoke, on } from '@renderer/api'
import { create } from 'zustand'

interface RuntimesState {
  installed: InstalledRuntime[]
  remote: RemoteNodeVersion[]
  remoteLoading: boolean
  /** In-flight or failed installs, keyed by version */
  progress: Record<string, RuntimeInstallProgress>
  loadInstalled: () => Promise<void>
  loadRemote: (force?: boolean) => Promise<void>
  install: (version: string) => Promise<void>
  cancel: (version: string) => Promise<void>
  remove: (version: string) => Promise<void>
  dismiss: (version: string) => void
}

export const useRuntimesStore = create<RuntimesState>((set, get) => ({
  installed: [],
  remote: [],
  remoteLoading: false,
  progress: {},
  async loadInstalled() {
    const [installed, installing] = await Promise.all([
      invoke('runtime:list-installed'),
      invoke('runtime:installing'),
    ])
    set({ installed, progress: { ...get().progress, ...Object.fromEntries(installing.map(item => [item.version, item])) } })
  },
  async loadRemote(force) {
    set({ remoteLoading: true })
    try {
      set({ remote: await invoke('runtime:list-remote', force) })
    }
    finally {
      set({ remoteLoading: false })
    }
  },
  install: version => invoke('runtime:install', version),
  cancel: version => invoke('runtime:cancel', version),
  async remove(version) {
    await invoke('runtime:remove', version)
    await get().loadInstalled()
  },
  dismiss(version) {
    const { [version]: _, ...rest } = get().progress
    set({ progress: rest })
  },
}))

on('runtime:progress', (progress) => {
  const store = useRuntimesStore.getState()
  if (progress.phase === 'done' || progress.phase === 'canceled') {
    store.dismiss(progress.version)
    if (progress.phase === 'done')
      void store.loadInstalled()
    return
  }
  useRuntimesStore.setState({ progress: { ...store.progress, [progress.version]: progress } })
})
