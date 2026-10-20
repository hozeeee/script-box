export type UpdateState
  = | 'idle'
    | 'unsupported'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'

export interface UpdateStatus {
  state: UpdateState
  version?: string
  percent?: number
  error?: string
}

export interface AppInfo {
  version: string
  platform: string
  arch: string
  dataDir: string
  electron: string
}
