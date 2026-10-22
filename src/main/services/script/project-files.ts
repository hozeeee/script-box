import type { ProjectEntry, RuntimeKind } from '@shared/types'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { AppError } from '@shared/errors'
import { projectEntryPath } from '../../paths'
import { isDeclarationFile, isScriptFileForKind, isValidScriptPath, languageOf } from './naming'
import { IGNORED_DIRS } from './walk'

function assertInside(root: string, path: string, name: string): void {
  const rel = relative(root, path)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new AppError('INVALID_SCRIPT_NAME', undefined, { name })
}

/** 检查真实父目录，定位符号链接本身时不跟随链接 */
export async function resolveProjectEntry(root: string, name: string): Promise<string> {
  const path = projectEntryPath(root, name)
  const canonicalRoot = await realpath(root)
  const parent = await realpath(name ? dirname(path) : path)
  assertInside(canonicalRoot, parent, name)
  return path
}

export async function resolveProjectDirectory(root: string, directory: string): Promise<string> {
  const path = await resolveProjectEntry(root, directory)
  const info = await lstat(path)
  if (!info.isDirectory())
    throw new AppError('INVALID_SCRIPT_NAME', undefined, { name: directory })
  assertInside(await realpath(root), await realpath(path), directory)
  return path
}

/** 只加载当前层：不预先扫描依赖目录；过滤已知环境/缓存目录 */
export async function listProjectEntries(root: string, directory = '', kind: RuntimeKind = 'node'): Promise<ProjectEntry[]> {
  const path = await resolveProjectDirectory(root, directory)
  const entries = await readdir(path, { withFileTypes: true })
  const result: ProjectEntry[] = []
  for (const entry of entries) {
    const name = directory ? `${directory}/${entry.name}` : entry.name
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name))
      continue
    const entryKind = entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file'
    const file: ProjectEntry = { name, kind: entryKind }
    if (entry.isFile() && isValidScriptPath(name) && !isDeclarationFile(name) && isScriptFileForKind(name, kind)) {
      const stat = await lstat(join(path, entry.name)).catch(() => null)
      if (!stat)
        continue
      file.script = { name, language: languageOf(name), size: stat.size, mtime: stat.mtimeMs }
    }
    result.push(file)
  }
  return result.sort((a, b) => {
    if ((a.kind === 'directory') !== (b.kind === 'directory'))
      return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}
