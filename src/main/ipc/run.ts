import { historyStore, runnerService } from '../services/runner'
import { broadcast, handle, listen } from './helpers'

export function registerRunIpc(): void {
  handle('run:start', (spaceId, script, options) => runnerService.start(spaceId, script, options))
  handle('run:stop', runId => runnerService.stop(runId))
  handle('run:active', () => runnerService.active())
  listen('run:write', (runId, data) => runnerService.write(runId, data))
  listen('run:resize', (runId, cols, rows) => runnerService.resize(runId, cols, rows))

  handle('history:list', spaceId => historyStore.list(spaceId))
  handle('history:log', (spaceId, runId) => historyStore.readLog(spaceId, runId))
  handle('history:remove', (spaceId, runId) => historyStore.remove(spaceId, runId))
  handle('history:clear', spaceId => historyStore.clear(spaceId))

  runnerService.on('output', event => broadcast('run:output', event))
  runnerService.on('exit', record => broadcast('run:exit', { record }))
}
