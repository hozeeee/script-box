export type RuntimeKind = 'node' | 'python'

export interface RemoteNodeVersion {
  kind: 'node'
  version: string
  date: string
  lts: string | false
  npm?: string
}

export interface RemotePythonVersion {
  kind: 'python'
  version: string
  date: string
  eol?: boolean
}

export type RemoteRuntimeVersion = RemoteNodeVersion | RemotePythonVersion

export interface InstalledRuntime {
  kind: RuntimeKind
  version: string
  dir: string
  npmVersion?: string | null
}

export type RuntimeInstallPhase = 'prepare' | 'download' | 'verify' | 'extract' | 'install' | 'done' | 'error' | 'canceled'

export interface RuntimeInstallProgress {
  kind: RuntimeKind
  version: string
  phase: RuntimeInstallPhase
  received: number
  total: number
  detail?: string
  error?: string
}
