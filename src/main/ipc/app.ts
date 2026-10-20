import { app, BrowserWindow, dialog, shell } from 'electron'
import { paths } from '../paths'
import { handle } from './helpers'

export function registerAppIpc(): void {
  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    dataDir: paths.root,
    electron: process.versions.electron,
  }))

  handle('app:open-path', async (path) => {
    const error = await shell.openPath(path)
    if (error)
      throw new Error(error)
  })

  handle('app:open-external', async (url) => {
    if (!/^https?:\/\//i.test(url))
      throw new Error(`Refused to open ${url}`)
    await shell.openExternal(url)
  })

  handle('app:select-scripts', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Scripts', extensions: ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'] }],
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })
}
