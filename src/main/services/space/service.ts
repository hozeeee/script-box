import type { Space, SpaceInput, SpaceRuntime } from '@shared/types'
import { randomUUID } from 'node:crypto'
import { readdir, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { AppError } from '@shared/errors'
import { historyPaths, ID_PATTERN, paths, spacePaths } from '../../paths'
import { ensureDir, exists, readJson, writeJson } from '../../utils/fs'
import { normalizeProjectPath, projectExists } from './project'
import { PYTHON_PYPROJECT_TEMPLATE, PYTHON_WELCOME_SCRIPT, PYTHON_WELCOME_SCRIPT_NAME, SPACE_NPMRC, WELCOME_SCRIPT, WELCOME_SCRIPT_NAME } from './templates'

/** Paths are compared case-insensitively where the file system usually is */
function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' || process.platform === 'darwin'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b
}

/** Migrate a pre-Python space (nodeVersion) to the new runtime model. */
export function migrateSpace(space: Space): Space {
  if (space.runtime?.kind)
    return space
  const version = space.runtime?.version ?? space.nodeVersion ?? null
  return { ...space, runtime: { kind: 'node', version } }
}

class SpaceService {
  /** Per-space promise chain so concurrent metadata updates never clobber each other */
  private locks = new Map<string, Promise<unknown>>()
  private orderLock: Promise<unknown> = Promise.resolve()

  async list(): Promise<Space[]> {
    if (!(await exists(paths.spaces)))
      return []
    const ids = await readdir(paths.spaces)
    const spaces = await Promise.all(
      ids.filter(id => ID_PATTERN.test(id)).map(id => readJson<Space | null>(spacePaths.meta(id), null)),
    )
    const order = await readJson<string[]>(paths.spaceOrder, [])
    const positions = new Map(order.map((id, index) => [id, index]))
    const found = await Promise.all(
      spaces.filter((space): space is Space => space !== null).map(space => this.annotate(migrateSpace(space))),
    )
    return found
      .sort((a, b) => {
        const aPosition = positions.get(a.id)
        const bPosition = positions.get(b.id)
        if (aPosition === undefined && bPosition === undefined)
          return b.updatedAt - a.updatedAt
        if (aPosition === undefined)
          return -1
        if (bPosition === undefined)
          return 1
        return aPosition - bPosition
      })
  }

  async get(id: string): Promise<Space> {
    const raw = ID_PATTERN.test(id) ? await readJson<Space | null>(spacePaths.meta(id), null) : null
    if (!raw)
      throw new AppError('SPACE_NOT_FOUND', undefined, { id })
    return migrateSpace(raw)
  }

  async create(input: SpaceInput): Promise<Space> {
    const id = randomUUID()
    const now = Date.now()
    const runtime: SpaceRuntime = input.runtime ?? { kind: 'node', version: null }
    const space: Space = {
      id,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      runtime,
      pythonManager: input.pythonManager,
      pythonVersionSource: input.pythonVersionSource,
      createdAt: now,
      updatedAt: now,
      scripts: {},
    }
    if (runtime.kind === 'python') {
      await this.scaffoldPython(id, space)
    }
    else {
      await this.scaffoldNode(id)
    }
    await writeJson(spacePaths.meta(id), space)
    return space
  }

  /**
   * Reference an existing project in place. Only `space.json` is written, and
   * it lives in userData: nothing is ever added to the project directory.
   */
  async importProject(input: SpaceInput & { projectPath: string }): Promise<Space> {
    const projectPath = await this.claimProjectPath(input.projectPath)
    const id = randomUUID()
    const now = Date.now()
    const runtime: SpaceRuntime = input.runtime ?? { kind: 'node', version: null }
    const space: Space = {
      id,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      runtime,
      pythonManager: input.pythonManager,
      pythonVersionSource: input.pythonVersionSource,
      createdAt: now,
      updatedAt: now,
      scripts: {},
      projectPath,
    }
    await writeJson(spacePaths.meta(id), space)
    return space
  }

  async update(id: string, input: Partial<SpaceInput>): Promise<Space> {
    const current = await this.get(id)
    const projectPath = current.projectPath && input.projectPath !== undefined && input.projectPath !== current.projectPath
      ? await this.claimProjectPath(input.projectPath, id)
      : undefined
    const space = await this.mutate(id, (space) => {
      if (input.name !== undefined)
        space.name = input.name.trim()
      if (input.description !== undefined)
        space.description = input.description.trim()
      if (input.runtime !== undefined)
        space.runtime = { ...space.runtime, version: input.runtime.version }
      if (projectPath)
        space.projectPath = projectPath
    })
    return this.annotate(space)
  }

  reorder(ids: string[]): Promise<void> {
    const next = this.orderLock.catch(() => {}).then(async () => {
      const spaces = await this.list()
      const currentIds = new Set(spaces.map(space => space.id))
      if (ids.length !== currentIds.size || new Set(ids).size !== ids.length || ids.some(id => !currentIds.has(id)))
        throw new Error('Invalid space order')
      await writeJson(paths.spaceOrder, ids)
    })
    this.orderLock = next
    return next
  }

  /**
   * Only the metadata directory (userData/spaces/<id>) and the run history are
   * deleted. For project spaces `spacePaths.root` never points at the project,
   * so the referenced project directory is left untouched.
   */
  async remove(id: string): Promise<void> {
    await this.get(id)
    await rm(spacePaths.root(id), { recursive: true, force: true })
    await rm(historyPaths.dir(id), { recursive: true, force: true })
  }

  /** Serialized read-modify-write of space.json */
  mutate(id: string, fn: (space: Space) => void): Promise<Space> {
    const previous = this.locks.get(id) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(async () => {
      const space = await this.get(id)
      fn(space)
      space.updatedAt = Date.now()
      delete space.projectMissing
      await writeJson(spacePaths.meta(id), space)
      return space
    })
    this.locks.set(id, next)
    return next
  }

  private async annotate(space: Space): Promise<Space> {
    if (!space.projectPath)
      return space
    return { ...space, projectMissing: !(await projectExists(space.projectPath)) }
  }

  /** Validated canonical project path that no other space references yet */
  private async claimProjectPath(path: string, selfId?: string): Promise<string> {
    const projectPath = await normalizeProjectPath(path)
    // A project inside the spaces folder would be wiped together with its owner space
    const rel = relative(paths.spaces, projectPath)
    if (!rel || (!rel.startsWith('..') && !isAbsolute(rel)))
      throw new AppError('INVALID_PROJECT', undefined, { path: projectPath })
    const taken = (await this.list()).find(space =>
      space.id !== selfId && space.projectPath && samePath(space.projectPath, projectPath))
    if (taken)
      throw new AppError('PROJECT_ALREADY_IMPORTED', undefined, { path: projectPath, name: taken.name })
    return projectPath
  }

  private async scaffoldNode(id: string): Promise<void> {
    await ensureDir(spacePaths.scripts(id))
    await writeJson(spacePaths.pkg(id), {
      name: `space-${id.slice(0, 8)}`,
      version: '0.0.0',
      private: true,
      dependencies: {},
    })
    await writeFile(join(spacePaths.root(id), '.npmrc'), SPACE_NPMRC, 'utf8')
    await writeFile(join(spacePaths.scripts(id), WELCOME_SCRIPT_NAME), WELCOME_SCRIPT, 'utf8')
  }

  private async scaffoldPython(id: string, space: Space): Promise<void> {
    await ensureDir(spacePaths.scripts(id))
    const pyVersion = space.runtime.version?.replace(/^\d+\./, m => m) || '3.13'
    const minorMatch = pyVersion.match(/(\d+\.\d+)/)
    const minor = minorMatch ? minorMatch[1]! : '3.13'
    await writeFile(join(spacePaths.scripts(id), 'pyproject.toml'), PYTHON_PYPROJECT_TEMPLATE(`space-${id.slice(0, 8)}`, minor), 'utf8')
    await writeFile(join(spacePaths.scripts(id), PYTHON_WELCOME_SCRIPT_NAME), PYTHON_WELCOME_SCRIPT, 'utf8')
  }
}

export const spaceService = new SpaceService()
