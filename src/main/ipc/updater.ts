import { updaterService } from '../services/updater'
import { broadcast, handle } from './helpers'

export function registerUpdaterIpc(): void {
  handle('updater:status', () => updaterService.get())
  handle('updater:check', () => updaterService.check())
  handle('updater:download', () => updaterService.download())
  handle('updater:install', () => updaterService.install())
  handle('updater:reveal', () => updaterService.reveal())

  updaterService.on('status', status => broadcast('updater:status', status))
}
