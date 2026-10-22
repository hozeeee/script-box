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
  /** Known failure that the renderer shows with a translated message instead of `error` */
  errorCode?: 'no-release'
}

export interface AppInfo {
  version: string
  platform: string
  arch: string
  dataDir: string
  electron: string
}
