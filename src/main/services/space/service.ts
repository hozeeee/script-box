import type { Space, SpaceInput } from '@shared/types'
import { randomUUID } from 'node:crypto'
import { readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '@shared/errors'
import { historyPaths, ID_PATTERN, paths, spacePaths } from '../../paths'
import { ensureDir, exists, readJson, writeJson } from '../../utils/fs'
import { SPACE_NPMRC, WELCOME_SCRIPT, WELCOME_SCRIPT_NAME } from './templates'

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
    return spaces
      .filter((space): space is Space => space !== null)
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
    const space = ID_PATTERN.test(id) ? await readJson<Space | null>(spacePaths.meta(id), null) : null
    if (!space)
      throw new AppError('SPACE_NOT_FOUND', undefined, { id })
    return space
  }

  async create(input: SpaceInput): Promise<Space> {
    const id = randomUUID()
    const now = Date.now()
    const space: Space = {
      id,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      nodeVersion: input.nodeVersion,
      createdAt: now,
      updatedAt: now,
      scripts: {},
    }
    await ensureDir(spacePaths.scripts(id))
    await writeJson(spacePaths.pkg(id), {
      name: `space-${id.slice(0, 8)}`,
      version: '0.0.0',
      private: true,
      dependencies: {},
    })
    await writeFile(join(spacePaths.root(id), '.npmrc'), SPACE_NPMRC, 'utf8')
    await writeFile(join(spacePaths.scripts(id), WELCOME_SCRIPT_NAME), WELCOME_SCRIPT, 'utf8')
    await writeJson(spacePaths.meta(id), space)
    return space
  }

  update(id: string, input: Partial<SpaceInput>): Promise<Space> {
    return this.mutate(id, (space) => {
      if (input.name !== undefined)
        space.name = input.name.trim()
      if (input.description !== undefined)
        space.description = input.description.trim()
      if (input.nodeVersion !== undefined)
        space.nodeVersion = input.nodeVersion
    })
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
      await writeJson(spacePaths.meta(id), space)
      return space
    })
    this.locks.set(id, next)
    return next
  }
}

export const spaceService = new SpaceService()
