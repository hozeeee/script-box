import type { UpdateStatus } from '@shared/types'
import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

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
    autoUpdater.on('error', error => this.set(toErrorStatus(error, this.status.version)))
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
      this.set(toErrorStatus(error))
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
