import { depsService, nodeTypeLibs } from '../services/deps'
import { broadcast, handle } from './helpers'

export function registerDepsIpc(): void {
  handle('deps:list', spaceId => depsService.list(spaceId))
  handle('deps:install', (spaceId, specs) => depsService.install(spaceId, specs))
  handle('deps:uninstall', (spaceId, names) => depsService.uninstall(spaceId, names))
  handle('deps:update', (spaceId, specs) => depsService.update(spaceId, specs))
  handle('deps:install-all', spaceId => depsService.installAll(spaceId))
  handle('deps:cancel', taskId => depsService.cancel(taskId))
  handle('deps:active', () => depsService.active())
  handle('deps:scan-missing', (spaceId, script) => depsService.scanMissing(spaceId, script))
  handle('deps:types', spaceId => depsService.typeLibs(spaceId))
  handle('deps:node-types', () => nodeTypeLibs())

  depsService.on('task', event => broadcast('deps:task', event))
}
