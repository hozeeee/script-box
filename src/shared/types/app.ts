export type UpdateState
  = | 'idle'
    | 'unsupported'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'preparing'
    | 'downloaded'
    | 'error'

export type ManualUpdateReason = 'mac-unsigned' | 'mac-signature'

export interface DownloadedUpdate {
  version: string
  path: string
  manualInstall: boolean
  manualReason?: ManualUpdateReason
  appPath?: string
  quarantineCommand?: string
}

export interface UpdateStatus {
  state: UpdateState
  version?: string
  percent?: number
  error?: string
  /** 可翻译的更新错误；下载记录不随检查或安装失败丢失。 */
  errorCode?: 'no-release' | 'mac-signature' | 'cache-missing'
  downloaded?: DownloadedUpdate
  manualReason?: ManualUpdateReason
}

export interface AppInfo {
  version: string
  platform: string
  arch: string
  dataDir: string
  electron: string
}
