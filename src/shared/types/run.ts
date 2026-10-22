import type { RuntimeKind } from './runtime'

export type RunStatus = 'running' | 'success' | 'failed' | 'stopped'

export interface RunRecord {
  id: string
  spaceId: string
  script: string
  args: string[]
  runtimeKind: RuntimeKind
  runtimeVersion: string
  startedAt: number
  endedAt: number | null
  exitCode: number | null
  status: RunStatus
}

export interface RunStartOptions {
  cols: number
  rows: number
}

export interface RunOutputEvent {
  runId: string
  data: string
}

export interface RunExitEvent {
  record: RunRecord
}
