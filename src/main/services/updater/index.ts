import type { UpdateStatus } from '@shared/types'
import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

class UpdaterService extends EventEmitter<{ status: [UpdateStatus] }> {
  private status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'unsupported' }
  private initialized = false

  private init(): void {
    if (this.initialized || !app.isPackaged)
      return
    this.initialized = true
    // Requests go through session.defaultSession, so the configured proxy applies here too
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    autoUpdater.on('update-available', info => this.set({ state: 'available', version: info.version }))
    autoUpdater.on('update-not-available', info => this.set({ state: 'not-available', version: info.version }))
    autoUpdater.on('download-progress', progress => this.set({
      state: 'downloading',
      version: this.status.version,
      percent: Math.round(progress.percent),
    }))
    autoUpdater.on('update-downloaded', info => this.set({ state: 'downloaded', version: info.version }))
    autoUpdater.on('error', error => this.set({ state: 'error', version: this.status.version, error: error.message }))
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.emit('status', status)
  }

  get(): UpdateStatus {
    return this.status
  }

  async check(): Promise<UpdateStatus> {
    if (!app.isPackaged)
      return this.status
    this.init()
    try {
      await autoUpdater.checkForUpdates()
    }
    catch (error) {
      this.set({ state: 'error', error: error instanceof Error ? error.message : String(error) })
    }
    return this.status
  }

  async download(): Promise<void> {
    if (this.status.state !== 'available')
      return
    this.init()
    await autoUpdater.downloadUpdate()
  }

  install(): void {
    if (this.status.state === 'downloaded')
      autoUpdater.quitAndInstall()
  }
}

export const updaterService = new UpdaterService()
