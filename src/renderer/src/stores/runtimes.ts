import type { InstalledRuntime, RemoteNodeVersion, RemoteRuntimeVersion, RuntimeInstallProgress, RuntimeKind } from '@shared/types'
import { invoke, on } from '@renderer/api'
import { create } from 'zustand'

interface RuntimesState {
  installed: InstalledRuntime[]
  remote: RemoteRuntimeVersion[]
  remoteLoading: boolean
  /** In-flight or failed installs, keyed by version */
  progress: Record<string, RuntimeInstallProgress>
  loadInstalled: (kind?: RuntimeKind) => Promise<void>
  loadRemote: (kind: RuntimeKind, force?: boolean) => Promise<void>
  install: (kind: RuntimeKind, version: string) => Promise<void>
  cancel: (kind: RuntimeKind, version: string) => Promise<void>
  remove: (kind: RuntimeKind, version: string) => Promise<void>
  dismiss: (version: string) => void
  /** Convenience helpers for Node.js only consumers */
  nodeInstalled: () => InstalledRuntime[]
  nodeRemote: () => RemoteNodeVersion[]
}

export const useRuntimesStore = create<RuntimesState>((set, get) => ({
  installed: [],
  remote: [],
  remoteLoading: false,
  progress: {},
  /** Without `kind` reloads every runtime kind; with `kind` only replaces that kind */
  async loadInstalled(kind) {
    const [installed, installing] = await Promise.all([
      invoke('runtime:list-installed', kind),
      invoke('runtime:installing', kind),
    ])
    const others = kind ? get().installed.filter(item => item.kind !== kind) : []
    set({
      installed: [...others, ...installed],
      progress: { ...get().progress, ...Object.fromEntries(installing.map(item => [item.version, item])) },
    })
  },
  async loadRemote(kind, force) {
    set({ remoteLoading: true })
    try {
      set({ remote: await invoke('runtime:list-remote', kind, force) })
    }
    finally {
      set({ remoteLoading: false })
    }
  },
  install: (kind, version) => invoke('runtime:install', kind, version),
  cancel: (kind, version) => invoke('runtime:cancel', kind, version),
  async remove(kind, version) {
    await invoke('runtime:remove', kind, version)
    await get().loadInstalled(kind)
  },
  dismiss(version) {
    const { [version]: _, ...rest } = get().progress
    set({ progress: rest })
  },
  nodeInstalled: () => get().installed.filter(i => i.kind === 'node'),
  nodeRemote: () => get().remote.filter((r): r is RemoteNodeVersion => r.kind === 'node'),
}))

on('runtime:progress', (progress) => {
  const store = useRuntimesStore.getState()
  if (progress.phase === 'done' || progress.phase === 'canceled') {
    store.dismiss(progress.version)
    if (progress.phase === 'done')
      void store.loadInstalled(progress.kind)
    return
  }
  useRuntimesStore.setState({ progress: { ...store.progress, [progress.version]: progress } })
})
