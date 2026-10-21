import { shell } from 'electron'
import { scriptService } from '../services/script'
import { handle } from './helpers'

export function registerScriptIpc(): void {
  handle('script:list', spaceId => scriptService.list(spaceId))
  handle('script:entries', (spaceId, directory) => scriptService.entries(spaceId, directory))
  handle('script:reveal', async (spaceId, name) => shell.showItemInFolder(await scriptService.revealPath(spaceId, name)))
  handle('script:read', (spaceId, name) => scriptService.read(spaceId, name))
  handle('script:mtime', (spaceId, name) => scriptService.mtime(spaceId, name))
  handle('script:sources', spaceId => scriptService.sources(spaceId))
  handle('script:write', (spaceId, name, content) => scriptService.write(spaceId, name, content))
  handle('script:create', (spaceId, name) => scriptService.create(spaceId, name))
  handle('script:import', (spaceId, paths) => scriptService.import(spaceId, paths))
  handle('script:rename', (spaceId, from, to) => scriptService.rename(spaceId, from, to))
  handle('script:remove', (spaceId, name) => scriptService.remove(spaceId, name))
  handle('script:save-run-config', (spaceId, name, config) => scriptService.saveRunConfig(spaceId, name, config))
}
