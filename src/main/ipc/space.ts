import type { RuntimeKind } from '@shared/types'
import { AppError } from '@shared/errors'
import { shell } from 'electron'
import { spaceWorkDir } from '../paths'
import { depsService } from '../services/deps'
import { inspectPythonProject } from '../services/python/project'
import { runnerService } from '../services/runner'
import { scriptService } from '../services/script'
import { assertProjectDir, normalizeProjectPath, readProjectInfo, spaceService } from '../services/space'
import { scanProjectScripts } from '../services/space/project'
import { handle } from './helpers'

function assertIdle(id: string): void {
  if (runnerService.hasActiveInSpace(id) || depsService.isBusy(id))
    throw new AppError('SPACE_BUSY', undefined, { id })
}

export function registerSpaceIpc(): void {
  handle('space:list', () => spaceService.list())
  handle('space:get', id => spaceService.get(id))
  handle('space:create', input => spaceService.create(input))
  handle('space:import-project', input => spaceService.importProject(input))
  handle('space:reorder', ids => spaceService.reorder(ids))

  handle('space:update', async (id, input) => {
    // Re-linking a project while something runs in the old directory would be confusing
    if (input.projectPath !== undefined && input.projectPath !== (await spaceService.get(id)).projectPath)
      assertIdle(id)
    return spaceService.update(id, input)
  })

  // Removing a space never touches an imported project directory, see SpaceService.remove
  handle('space:remove', async (id) => {
    assertIdle(id)
    await spaceService.remove(id)
  })

  handle('space:project-info', async (id) => {
    const space = await spaceService.get(id)
    if (!space.projectPath)
      throw new AppError('INVALID_PROJECT', undefined, { path: '' })
    await assertProjectDir(space.projectPath)
    const [info, commands] = await Promise.all([readProjectInfo(space.projectPath), scanProjectScripts(space.projectPath)])
    return { ...info, ...commands, truncated: scriptService.wasTruncated(id) }
  })

  handle('space:inspect-project', async (path: string, kind?: RuntimeKind) => {
    if (kind === 'python') {
      const { stat } = await import('node:fs/promises')
      const info = await stat(path)
      if (!info.isDirectory())
        throw new AppError('INVALID_PROJECT', undefined, { path })
      const pyInfo = await inspectPythonProject(path)
      return {
        runtimeKind: 'python' as const,
        packageManager: 'npm' as const,
        scripts: {},
        nodeVersionHint: null,
        pythonVersionHint: pyInfo.pythonVersionHint,
        pythonVersionSource: pyInfo.pythonVersionSource,
        pythonManager: pyInfo.manager,
        pythonManagerCandidates: pyInfo.managerCandidates,
        packageName: pyInfo.name,
        truncated: false,
        pnp: false,
      }
    }
    const dir = await normalizeProjectPath(path)
    return { ...(await readProjectInfo(dir)), truncated: false }
  })

  handle('space:open-dir', async (id) => {
    const space = await spaceService.get(id)
    if (space.projectPath)
      await assertProjectDir(space.projectPath)
    const error = await shell.openPath(spaceWorkDir(space))
    if (error)
      throw new Error(error)
  })
}
