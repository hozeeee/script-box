import type { DownloadedUpdate, ManualUpdateReason, UpdateStatus } from '@shared/types'
import type { UpdateDownloadedEvent } from 'electron-updater'
import type { CachedUpdate } from './cache'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { app, autoUpdater as nativeUpdater, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { paths } from '../../paths'
import { readJson, writeJson } from '../../utils/fs'
import { hashUpdate, validateCachedUpdate } from './cache'
import { detectMacManualReason, isMacSignatureError, macAppPath, quarantineCommand } from './mac'

// No public release on GitHub yet (only drafts / pre-releases / bare tags); `/releases/latest`
// then redirects to `/releases`, which answers 406 to the JSON request of electron-updater
const NO_RELEASE_PATTERN = /ERR_UPDATER_NO_PUBLISHED_VERSIONS|ERR_UPDATER_LATEST_VERSION_NOT_FOUND|No published versions|Unable to find latest version/
const MAX_ERROR_LENGTH = 300

function toErrorStatus(error: unknown, version?: string): UpdateStatus {
  const message = error instanceof Error ? error.message : String(error)
  const code = (error as { code?: unknown } | null)?.code
  if (NO_RELEASE_PATTERN.test(`${typeof code === 'string' ? code : ''} ${message}`))
    return { state: 'error', version, errorCode: 'no-release' }
  // electron-updater appends response headers and the whole feed to the message, keep the headline only
  const headline = message.split('\n')[0].trim()
  return {
    state: 'error',
    version,
    error: headline.length > MAX_ERROR_LENGTH ? `${headline.slice(0, MAX_ERROR_LENGTH)}…` : headline,
  }
}

export class UpdaterService extends EventEmitter<{ status: [UpdateStatus] }> {
  private status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'unsupported' }
  private initialization?: Promise<void>
  private cached: CachedUpdate | null = null
  private manualReason?: ManualUpdateReason
  private nativeReady = false
  private busy = false
  private installRequested = false
  private recordTask?: Promise<void>
  private saving: Promise<void> = Promise.resolve()

  private saveRecord(): Promise<void> {
    const record = this.cached ? { ...this.cached } : null
    const task = this.saving.catch(() => {}).then(() => writeJson(this.recordPath, record))
    this.saving = task
    return task
  }

  private get recordPath(): string {
    return join(paths.updates, 'downloaded.json')
  }

  initialize(): Promise<void> {
    return this.initialization ??= this.init()
  }

  private async init(): Promise<void> {
    if (!app.isPackaged)
      return
    this.manualReason = await detectMacManualReason()
    this.cached = await validateCachedUpdate(await readJson<unknown>(this.recordPath, null), version => autoUpdater.currentVersion.compare(version) < 0)
    if (process.platform === 'darwin')
      this.manualReason ??= this.cached?.manualReason
    // 下载仍由 electron-updater 校验；无可用签名的 Mac 不把 ZIP 交给 Squirrel 安装。
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = !this.manualReason
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    autoUpdater.on('update-available', (info) => {
      if (this.cached?.version === info.version)
        this.showDownloaded()
      else
        this.set({ state: 'available', version: info.version })
    })
    autoUpdater.on('update-not-available', info => this.set({ state: 'not-available', version: info.version }))
    autoUpdater.on('download-progress', progress => this.set({
      state: 'downloading',
      version: this.status.version,
      percent: Math.round(progress.percent),
    }))
    autoUpdater.on('update-downloaded', (info) => {
      // Mac 的此事件仅表示 ZIP 下载完成；原生事件才表示签名校验及安装准备完成。
      this.set({ state: 'preparing', version: info.version })
      this.recordTask = this.recordDownloaded(info).catch(error => this.fail(error))
    })
    autoUpdater.on('error', error => this.fail(error))
    if (process.platform === 'darwin') {
      nativeUpdater.on('update-downloaded', () => {
        this.nativeReady = true
        void this.recordTask?.then(() => {
          if (this.nativeReady && !this.manualReason)
            this.showDownloaded()
        })
      })
    }
    if (this.cached)
      this.showDownloaded()
    else
      this.set({ state: 'idle' })
  }

  private downloaded(): DownloadedUpdate | undefined {
    if (!this.cached)
      return undefined
    const bundle = process.platform === 'darwin' ? macAppPath() : undefined
    const appPath = bundle?.startsWith('/Volumes/') || bundle?.includes('/AppTranslocation/') ? '/Applications/Script Box.app' : bundle
    return {
      version: this.cached.version,
      path: this.cached.path,
      manualInstall: !!this.manualReason,
      manualReason: this.manualReason,
      appPath,
      quarantineCommand: appPath ? quarantineCommand(appPath) : undefined,
    }
  }

  private set(status: UpdateStatus): void {
    this.status = { ...status, downloaded: this.downloaded(), manualReason: this.manualReason }
    this.emit('status', this.status)
  }

  private showDownloaded(): void {
    if (!this.cached)
      return
    this.set({ state: 'downloaded', version: this.cached.version })
    if (this.installRequested && this.nativeReady && !this.manualReason) {
      this.installRequested = false
      try {
        autoUpdater.quitAndInstall()
      }
      catch (error) {
        this.fail(error)
      }
    }
  }

  private async recordDownloaded(info: UpdateDownloadedEvent): Promise<void> {
    this.cached = {
      version: info.version,
      path: info.downloadedFile,
      sha512: await hashUpdate(info.downloadedFile),
      platform: process.platform,
      arch: process.arch,
      manualReason: this.manualReason,
    }
    await this.saveRecord()
    if (process.platform !== 'darwin')
      this.nativeReady = true
    if (this.manualReason || this.nativeReady)
      this.showDownloaded()
  }

  private fail(error: unknown): void {
    this.installRequested = false
    if (process.platform === 'darwin' && isMacSignatureError(error)) {
      this.manualReason = 'mac-signature'
      this.nativeReady = false
      autoUpdater.autoInstallOnAppQuit = false
      if (this.cached) {
        this.cached.manualReason = this.manualReason
        void this.saveRecord().catch(error => console.error('[updater] save manual install status:', error))
        this.showDownloaded()
        return
      }
      this.set({ state: 'error', version: this.status.version, errorCode: 'mac-signature' })
      return
    }
    this.set(toErrorStatus(error, this.status.version))
  }

  get(): UpdateStatus {
    return this.status
  }

  async check(): Promise<UpdateStatus> {
    await this.initialize()
    if (!app.isPackaged || this.busy || this.status.state === 'preparing')
      return this.status
    this.busy = true
    try {
      await autoUpdater.checkForUpdates()
    }
    catch (error) {
      this.fail(error)
    }
    finally {
      this.busy = false
    }
    return this.status
  }

  async download(): Promise<void> {
    await this.initialize()
    if (!app.isPackaged || this.busy || this.status.state !== 'available')
      return
    this.busy = true
    this.nativeReady = false
    this.recordTask = undefined
    this.set({ state: 'downloading', version: this.status.version, percent: 0 })
    try {
      await autoUpdater.downloadUpdate()
      await this.recordTask
    }
    catch (error) {
      await this.recordTask
      this.fail(error)
    }
    finally {
      this.busy = false
    }
  }

  private async validateDownload(): Promise<boolean> {
    this.cached = await validateCachedUpdate(this.cached, version => autoUpdater.currentVersion.compare(version) < 0)
    if (this.cached)
      return true
    await this.saveRecord()
    this.nativeReady = false
    this.set({ state: 'error', errorCode: 'cache-missing' })
    return false
  }

  async reveal(): Promise<void> {
    await this.initialize()
    if (await this.validateDownload())
      shell.showItemInFolder(this.cached!.path)
  }

  async install(): Promise<void> {
    await this.initialize()
    if (!app.isPackaged || this.busy || this.status.state === 'preparing')
      return
    this.busy = true
    try {
      if (!await this.validateDownload())
        return
      if (this.manualReason) {
        shell.showItemInFolder(this.cached!.path)
        return
      }
      this.set({ state: 'preparing', version: this.cached!.version })
      if (this.nativeReady) {
        autoUpdater.quitAndInstall()
        return
      }
      // 进程重启后先检查版本，再让库校验并复用缓存，不能直接 quitAndInstall。
      this.installRequested = true
      const result = await autoUpdater.checkForUpdates()
      if (!result?.isUpdateAvailable || result.updateInfo.version !== this.cached!.version) {
        this.installRequested = false
        return
      }
      this.set({ state: 'preparing', version: this.cached!.version })
      this.recordTask = undefined
      await autoUpdater.downloadUpdate()
      await this.recordTask
    }
    catch (error) {
      await this.recordTask
      this.fail(error)
    }
    finally {
      this.busy = false
    }
  }
}

export const updaterService = new UpdaterService()
