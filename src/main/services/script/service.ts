import type { RunConfig, ScriptFile, ScriptSources, Space } from '@shared/types'
import { copyFile, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { AppError } from '@shared/errors'
import { isNpmScriptKey, NPM_SCRIPT_PREFIX } from '@shared/types'
import { spacePaths, spaceScriptsDir } from '../../paths'
import { ensureDir, exists } from '../../utils/fs'
import { assertProjectDir, spaceService } from '../space'
import { isDeclarationFile, isScriptFile, isValidScriptName, isValidScriptPath, languageOf, uniqueName } from './naming'
import { templateFor } from './templates'
import { walkProject } from './walk'

const SOURCE_BUDGET_BYTES = 16 * 1024 * 1024
const SOURCE_BUDGET_FILES = 2000

function assertName(space: Space, name: string): void {
  const valid = space.projectPath ? isValidScriptPath(name) : isValidScriptName(name)
  if (!valid)
    throw new AppError('INVALID_SCRIPT_NAME', undefined, { name })
}

class ScriptService {
  /** Whether the last listing of a project space hit the walk limits */
  private truncated = new Set<string>()

  /** Absolute path of a script inside its space, after validating the name */
  resolvePath(space: Space, name: string): string {
    assertName(space, name)
    const root = spaceScriptsDir(space)
    const path = join(root, ...name.split('/'))
    const rel = relative(root, path)
    if (!rel || rel.startsWith('..') || isAbsolute(rel))
      throw new AppError('INVALID_SCRIPT_NAME', undefined, { name })
    return path
  }

  wasTruncated(spaceId: string): boolean {
    return this.truncated.has(spaceId)
  }

  async list(spaceId: string): Promise<ScriptFile[]> {
    const space = await spaceService.get(spaceId)
    if (space.projectPath)
      return this.listProject(space, space.projectPath)
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
    const path = await this.existingPath(spaceId, name)
    return readFile(path, 'utf8')
  }

  async mtime(spaceId: string, name: string): Promise<number> {
    const path = await this.existingPath(spaceId, name)
    return (await stat(path)).mtimeMs
  }

  async write(spaceId: string, name: string, content: string): Promise<void> {
    const space = await this.workingSpace(spaceId)
    await writeFile(this.resolvePath(space, name), content, 'utf8')
  }

  async create(spaceId: string, name: string): Promise<ScriptFile> {
    const space = await this.workingSpace(spaceId)
    const path = this.resolvePath(space, name)
    if (await exists(path))
      throw new AppError('SCRIPT_EXISTS', undefined, { name })
    const content = templateFor(name)
    await ensureDir(dirname(path))
    await writeFile(path, content, 'utf8')
    return { name, language: languageOf(name), size: Buffer.byteLength(content), mtime: Date.now() }
  }

  /** Copy external files into the space; returns the names they were stored as */
  async import(spaceId: string, sources: string[]): Promise<string[]> {
    const space = await spaceService.get(spaceId)
    // Projects are referenced in place; copying files into them is not supported
    if (space.projectPath)
      throw new AppError('UNSUPPORTED_SCRIPT', undefined, { name: sources.map(source => basename(source)).join(', ') })
    const taken = new Set((await this.list(spaceId)).map(file => file.name))
    const imported: string[] = []
    for (const source of sources) {
      const original = basename(source)
      if (!isScriptFile(original))
        throw new AppError('UNSUPPORTED_SCRIPT', undefined, { name: original })
      const safe = original.replace(/[<>:"|?*\s]+/g, '-').replace(/^\.+/, '')
      const name = uniqueName(safe, taken)
      assertName(space, name)
      await copyFile(source, join(spacePaths.scripts(spaceId), name))
      taken.add(name)
      imported.push(name)
    }
    return imported
  }

  async rename(spaceId: string, from: string, to: string): Promise<void> {
    if (from === to)
      return
    const space = await this.workingSpace(spaceId)
    const source = this.resolvePath(space, from)
    const target = this.resolvePath(space, to)
    if (await exists(target))
      throw new AppError('SCRIPT_EXISTS', undefined, { name: to })
    await ensureDir(dirname(target))
    await rename(source, target)
    await spaceService.mutate(spaceId, (space) => {
      if (space.scripts[from]) {
        space.scripts[to] = space.scripts[from]
        delete space.scripts[from]
      }
    })
  }

  async remove(spaceId: string, name: string): Promise<void> {
    const space = await this.workingSpace(spaceId)
    await rm(this.resolvePath(space, name), { force: true })
    await spaceService.mutate(spaceId, (space) => {
      delete space.scripts[name]
    })
  }

  async saveRunConfig(spaceId: string, name: string, config: RunConfig): Promise<Space> {
    const space = await spaceService.get(spaceId)
    // package.json scripts (`npm:<name>`) store their config under the run key
    if (isNpmScriptKey(name)) {
      if (!space.projectPath || name.length <= NPM_SCRIPT_PREFIX.length || name.length > 256)
        throw new AppError('INVALID_SCRIPT_NAME', undefined, { name })
    }
    else {
      assertName(space, name)
    }
    return spaceService.mutate(spaceId, (space) => {
      space.scripts[name] = { runConfig: { args: config.args, env: config.env } }
    })
  }

  /** Project sources for the editor, bounded so huge projects stay responsive */
  async sources(spaceId: string): Promise<ScriptSources> {
    const space = await this.workingSpace(spaceId)
    if (!space.projectPath)
      return { files: [], truncated: false }
    const root = space.projectPath
    const walked = await walkProject(root, { accept: isScriptFile })
    const files: ScriptSources['files'] = []
    let bytes = 0
    let truncated = walked.truncated
    for (const name of walked.files) {
      if (files.length >= SOURCE_BUDGET_FILES) {
        truncated = true
        break
      }
      const path = join(root, ...name.split('/'))
      const info = await stat(path).catch(() => null)
      if (!info)
        continue
      if (bytes + info.size > SOURCE_BUDGET_BYTES) {
        truncated = true
        continue
      }
      bytes += info.size
      files.push({ name, content: await readFile(path, 'utf8') })
    }
    return { files, truncated }
  }

  private async listProject(space: Space, root: string): Promise<ScriptFile[]> {
    await assertProjectDir(root)
    const walked = await walkProject(root, { accept: name => isScriptFile(name) && !isDeclarationFile(name) })
    if (walked.truncated)
      this.truncated.add(space.id)
    else
      this.truncated.delete(space.id)
    const files = await Promise.all(walked.files.map(async (name) => {
      const info = await stat(join(root, ...name.split('/'))).catch(() => null)
      return info && { name, language: languageOf(name), size: info.size, mtime: info.mtimeMs }
    }))
    return files.filter((file): file is ScriptFile => file !== null)
  }

  /** The space, after making sure a referenced project directory is still there */
  private async workingSpace(spaceId: string): Promise<Space> {
    const space = await spaceService.get(spaceId)
    if (space.projectPath)
      await assertProjectDir(space.projectPath)
    return space
  }

  private async existingPath(spaceId: string, name: string): Promise<string> {
    const space = await this.workingSpace(spaceId)
    const path = this.resolvePath(space, name)
    if (!(await exists(path)))
      throw new AppError('SCRIPT_NOT_FOUND', undefined, { name })
    return path
  }
}

export const scriptService = new ScriptService()
