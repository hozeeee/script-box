import { applyProxy, testConnection } from '../services/network'
import { settingsStore } from '../services/settings'
import { broadcast, handle } from './helpers'

export function registerSettingsIpc(): void {
  handle('settings:get', () => settingsStore.get())
  handle('settings:update', patch => settingsStore.update(patch))
  handle('settings:test-connection', url => testConnection(url))

  settingsStore.on('change', (settings) => {
    void applyProxy(settings.network.proxy).catch(error => console.error('[settings] apply proxy failed:', error))
    broadcast('settings:changed', settings)
  })
}
