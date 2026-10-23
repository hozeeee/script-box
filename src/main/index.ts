import { electronApp, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc'
import { applyProxy } from './services/network'
import { historyStore, runnerService } from './services/runner'
import { settingsStore } from './services/settings'
import { updaterService } from './services/updater'
import { createMainWindow } from './window'

async function bootstrap(): Promise<void> {
  electronApp.setAppUserModelId('com.scriptbox.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const settings = await settingsStore.load()
  await applyProxy(settings.network.proxy).catch(error => console.error('[main] apply proxy failed:', error))
  await historyStore.recoverStale().catch(error => console.error('[main] recover history failed:', error))

  registerIpc()
  await updaterService.initialize().catch(error => console.error('[main] restore update failed:', error))
  createMainWindow()

  if (settings.update.autoCheck)
    setTimeout(() => void updaterService.check(), 5_000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
      createMainWindow()
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
}
else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (window) {
      if (window.isMinimized())
        window.restore()
      window.focus()
    }
  })

  app.whenReady().then(bootstrap).catch((error) => {
    console.error('[main] bootstrap failed:', error)
    app.quit()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
      app.quit()
  })

  app.on('before-quit', () => runnerService.stopAll())
}
