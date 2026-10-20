import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, nativeTheme, shell } from 'electron'
import icon from '../../resources/icon.png?asset'

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Script Box',
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141414' : '#ffffff',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  window.once('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url))
      void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Never navigate the app window away from the bundled UI
  window.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (!devUrl || !url.startsWith(devUrl))
      event.preventDefault()
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL)
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else
    void window.loadFile(join(__dirname, '../renderer/index.html'))

  return window
}
