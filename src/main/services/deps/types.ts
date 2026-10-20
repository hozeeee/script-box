import type { TypeLib } from '@shared/types'
import type { Dirent } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { exists } from '../../utils/fs'

const MAX_TOTAL_BYTES = 48 * 1024 * 1024
const MAX_FILE_BYTES = 4 * 1024 * 1024
const MAX_DEPTH = 8
const SKIP_PACKAGES = new Set(['typescript', '.bin', '.cache'])
const SKIP_DIRS = new Set(['node_modules', '.git', 'test', 'tests', '__tests__', 'example', 'examples'])
const DECLARATION = /\.d\.[mc]?ts$/

interface Budget {
  bytes: number
}

/** List top level package names (including scoped ones) in a node_modules folder */
export async function listPackages(nodeModules: string): Promise<string[]> {
  if (!(await exists(nodeModules)))
    return []
  const result: string[] = []
  for (const entry of await readdir(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_PACKAGES.has(entry.name) || entry.name.startsWith('.'))
      continue
    if (entry.name.startsWith('@')) {
      for (const scoped of await readdir(join(nodeModules, entry.name)))
        result.push(`${entry.name}/${scoped}`)
    }
    else {
      result.push(entry.name)
    }
  }
  return result
}

async function walkDeclarations(dir: string, depth: number, out: string[]): Promise<void> {
  if (depth > MAX_DEPTH)
    return
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  }
  catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name))
        await walkDeclarations(full, depth + 1, out)
    }
    else if (DECLARATION.test(entry.name)) {
      out.push(full)
    }
  }
}

async function readLib(path: string, virtualPath: string, budget: Budget): Promise<TypeLib | null> {
  const info = await stat(path)
  if (info.size > MAX_FILE_BYTES || budget.bytes + info.size > MAX_TOTAL_BYTES)
    return null
  budget.bytes += info.size
  return { path: virtualPath, content: await readFile(path, 'utf8') }
}

/** `@types` package name for a package, e.g. `@scope/pkg` -> `@types/scope__pkg` */
export function typesPackageName(name: string): string {
  return `@types/${name.replace('@', '').replace('/', '__')}`
}

/**
 * Ambient `declare module` shorthands for packages without any declarations, so
 * the editor treats them as `any` instead of reporting "Cannot find module".
 */
export function untypedModulesLib(packages: string[], libs: TypeLib[]): TypeLib | null {
  const typed = (name: string): boolean => libs.some(lib =>
    DECLARATION.test(lib.path)
    && (lib.path.startsWith(`file:///node_modules/${name}/`) || lib.path.startsWith(`file:///node_modules/${typesPackageName(name)}/`)))
  const untyped = packages.filter(name => !name.startsWith('@types/') && !typed(name))
  if (!untyped.length)
    return null
  return {
    path: 'file:///scriptbox/untyped-modules.d.ts',
    content: untyped.flatMap(name => [`declare module '${name}';`, `declare module '${name}/*';`]).join('\n'),
  }
}

/**
 * Read declaration files of the given packages so Monaco can resolve their types.
 * Files are exposed as `file:///node_modules/<pkg>/...`.
 */
export async function collectTypeLibs(root: string, packages: string[]): Promise<TypeLib[]> {
  const budget: Budget = { bytes: 0 }
  const libs: TypeLib[] = []
  for (const pkg of packages) {
    const pkgDir = join(root, pkg)
    const files: string[] = []
    await walkDeclarations(pkgDir, 0, files)
    if (!files.length)
      continue
    const pkgJson = join(pkgDir, 'package.json')
    if (await exists(pkgJson)) {
      const lib = await readLib(pkgJson, `file:///node_modules/${pkg}/package.json`, budget)
      if (lib)
        libs.push(lib)
    }
    for (const file of files) {
      const relative = file.slice(pkgDir.length).split('\\').join('/')
      const lib = await readLib(file, `file:///node_modules/${pkg}${relative}`, budget)
      if (lib)
        libs.push(lib)
    }
    if (budget.bytes >= MAX_TOTAL_BYTES)
      break
  }
  return libs
}
