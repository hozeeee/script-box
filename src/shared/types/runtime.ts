export interface RemoteNodeVersion {
  version: string
  date: string
  lts: string | false
  npm?: string
}

export interface InstalledRuntime {
  version: string
  dir: string
  npmVersion: string | null
}

export type RuntimeInstallPhase = 'download' | 'verify' | 'extract' | 'done' | 'error' | 'canceled'

export interface RuntimeInstallProgress {
  version: string
  phase: RuntimeInstallPhase
  received: number
  total: number
  error?: string
}
