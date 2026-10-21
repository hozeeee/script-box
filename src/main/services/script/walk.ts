import type { Ignore } from 'ignore'
import type { Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ignore from 'ignore'

/** Folders that never contain hand-written scripts worth listing */
export const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.scriptbox',
  '.yarn',
  '.pnpm-store',
])

export const MAX_WALK_DEPTH = 12
export const MAX_WALK_FILES = 5000

export interface WalkOptions {
  /** Return true to collect a file (POSIX relative path) */
  accept: (relative: string) => boolean
  maxDepth?: number
  maxFiles?: number
}

export interface WalkResult {
  /** POSIX paths relative to the root, in directory order */
  files: string[]
  truncated: boolean
}

async function loadGitignore(root: string): Promise<Ignore> {
  const ig = ignore()
  try {
    ig.add(await readFile(join(root, '.gitignore'), 'utf8'))
  }
  catch {}
  return ig
}

/**
 * Recursively list files of a project. Skips well known build / dependency
 * folders and anything matched by the root `.gitignore`. Symlinked folders are
 * not followed, so the walk can neither loop nor leave the project.
 */
export async function walkProject(root: string, options: WalkOptions): Promise<WalkResult> {
  const maxDepth = options.maxDepth ?? MAX_WALK_DEPTH
  const maxFiles = options.maxFiles ?? MAX_WALK_FILES
  const ig = await loadGitignore(root)
  const files: string[] = []
  let truncated = false
  let full = false

  const visit = async (dir: string, prefix: string, depth: number): Promise<void> => {
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    }
    catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    const subdirs: [string, string][] = []
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || ig.ignores(`${relative}/`))
          continue
        if (depth >= maxDepth) {
          truncated = true
          continue
        }
        subdirs.push([join(dir, entry.name), relative])
      }
      else if (entry.isFile() && !ig.ignores(relative) && options.accept(relative)) {
        if (files.length >= maxFiles) {
          truncated = full = true
          return
        }
        files.push(relative)
      }
    }
    for (const [path, relative] of subdirs) {
      if (full)
        return
      await visit(path, relative, depth + 1)
    }
  }

  await visit(root, '', 0)
  return { files, truncated }
}
