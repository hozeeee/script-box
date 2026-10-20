import type { RunConfig, ScriptFile, Space } from '@shared/types'
import { copyFile, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { AppError } from '@shared/errors'
import { spacePaths } from '../../paths'
import { ensureDir, exists } from '../../utils/fs'
import { spaceService } from '../space'
import { isScriptFile, isValidScriptName, languageOf, uniqueName } from './naming'
import { templateFor } from './templates'

function assertName(name: string): void {
  if (!isValidScriptName(name))
    throw new AppError('INVALID_SCRIPT_NAME', undefined, { name })
}

class ScriptService {
  /** Absolute path of a script inside its space, after validating the name */
  resolvePath(spaceId: string, name: string): string {
    assertName(name)
    return join(spacePaths.scripts(spaceId), name)
  }

  async list(spaceId: string): Promise<ScriptFile[]> {
    await spaceService.get(spaceId)
    const dir = await ensureDir(spacePaths.scripts(spaceId))
    const entries = await readdir(dir, { withFileTypes: true })
    const files = await Promise.all(
      entries
        .filter(entry => entry.isFile() && isScriptFile(entry.name))
        .map(async (entry) => {
          const info = await stat(join(dir, entry.name))
          return { name: entry.name, language: languageOf(entry.name), size: info.size, mtime: info.mtimeMs }
        }),
    )
    return files.sort((a, b) => a.name.localeCompare(b.name))
  }

  async read(spaceId: string, name: string): Promise<string> {
    const path = this.resolvePath(spaceId, name)
    if (!(await exists(path)))
      throw new AppError('SCRIPT_NOT_FOUND', undefined, { name })
    return readFile(path, 'utf8')
  }

  async write(spaceId: string, name: string, content: string): Promise<void> {
    await writeFile(this.resolvePath(spaceId, name), content, 'utf8')
  }

  async create(spaceId: string, name: string): Promise<ScriptFile> {
    const path = this.resolvePath(spaceId, name)
    await spaceService.get(spaceId)
    if (await exists(path))
      throw new AppError('SCRIPT_EXISTS', undefined, { name })
    const content = templateFor(name)
    await ensureDir(spacePaths.scripts(spaceId))
    await writeFile(path, content, 'utf8')
    return { name, language: languageOf(name), size: Buffer.byteLength(content), mtime: Date.now() }
  }

  /** Copy external files into the space; returns the names they were stored as */
  async import(spaceId: string, sources: string[]): Promise<string[]> {
    const taken = new Set((await this.list(spaceId)).map(file => file.name))
    const imported: string[] = []
    for (const source of sources) {
      const original = basename(source)
      if (!isScriptFile(original))
        throw new AppError('UNSUPPORTED_SCRIPT', undefined, { name: original })
      const safe = original.replace(/[<>:"|?*\s]+/g, '-').replace(/^\.+/, '')
      const name = uniqueName(safe, taken)
      assertName(name)
      await copyFile(source, join(spacePaths.scripts(spaceId), name))
      taken.add(name)
      imported.push(name)
    }
    return imported
  }

  async rename(spaceId: string, from: string, to: string): Promise<void> {
    if (from === to)
      return
    const source = this.resolvePath(spaceId, from)
    const target = this.resolvePath(spaceId, to)
    if (await exists(target))
      throw new AppError('SCRIPT_EXISTS', undefined, { name: to })
    await rename(source, target)
    await spaceService.mutate(spaceId, (space) => {
      if (space.scripts[from]) {
        space.scripts[to] = space.scripts[from]
        delete space.scripts[from]
      }
    })
  }

  async remove(spaceId: string, name: string): Promise<void> {
    await rm(this.resolvePath(spaceId, name), { force: true })
    await spaceService.mutate(spaceId, (space) => {
      delete space.scripts[name]
    })
  }

  saveRunConfig(spaceId: string, name: string, config: RunConfig): Promise<Space> {
    assertName(name)
    return spaceService.mutate(spaceId, (space) => {
      space.scripts[name] = { runConfig: { args: config.args, env: config.env } }
    })
  }
}

export const scriptService = new ScriptService()
