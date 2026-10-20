import { AppError } from '@shared/errors'
import { shell } from 'electron'
import { spacePaths } from '../paths'
import { depsService } from '../services/deps'
import { runnerService } from '../services/runner'
import { spaceService } from '../services/space'
import { handle } from './helpers'

export function registerSpaceIpc(): void {
  handle('space:list', () => spaceService.list())
  handle('space:get', id => spaceService.get(id))
  handle('space:create', input => spaceService.create(input))
  handle('space:update', (id, input) => spaceService.update(id, input))

  handle('space:remove', async (id) => {
    if (runnerService.hasActiveInSpace(id) || depsService.isBusy(id))
      throw new AppError('SPACE_BUSY', undefined, { id })
    await spaceService.remove(id)
  })

  handle('space:open-dir', async (id) => {
    await spaceService.get(id)
    await shell.openPath(spacePaths.root(id))
  })
}
