import type { PackageManager, ProjectInfo } from '@shared/types'
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { AppError } from '@shared/errors'
import { exists, readJson } from '../../utils/fs'

interface ProjectPackageJson {
  name?: string
  packageManager?: string
  scripts?: Record<string, string>
  engines?: { node?: string }
}

const LOCKFILES: [string, PackageManager][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
]

/** `pnpm@10.1.0+sha512...` -> `pnpm` */
export function parsePackageManagerField(value: unknown): PackageManager | null {
  if (typeof value !== 'string')
    return null
  const name = value.trim().split('@')[0]
  return name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun' ? name : null
}

/** `packageManager` field first, then lockfiles, npm when nothing hints otherwise */
export async function detectPackageManager(dir: string): Promise<PackageManager> {
  const pkg = await readJson<ProjectPackageJson>(join(dir, 'package.json'), {})
  const declared = parsePackageManagerField(pkg.packageManager)
  if (declared)
    return declared
  for (const [file, manager] of LOCKFILES) {
    if (await exists(join(dir, file)))
      return manager
  }
  return 'npm'
}

/** Normalizes `22`, `v22.11.0`, `>=20.10` ... to `22` / `v22.11.0` / `20`; aliases like `lts/*` give null */
export function parseNodeVersionHint(raw: string | undefined | null): string | null {
  const value = raw?.trim()
  if (!value)
    return null
  const exact = /^v?(\d+\.\d+\.\d+)$/.exec(value)
  if (exact)
    return `v${exact[1]}`
  const major = /(\d+)/.exec(value)
  return major ? major[1]! : null
}

async function readFirstLine(path: string): Promise<string | null> {
  try {
    return (await readFile(path, 'utf8')).split(/\r?\n/)[0] ?? null
  }
  catch {
    return null
  }
}

export async function readProjectInfo(dir: string): Promise<Omit<ProjectInfo, 'truncated'>> {
  const pkg = await readJson<ProjectPackageJson>(join(dir, 'package.json'), {})
  const nodeVersionHint = parseNodeVersionHint(await readFirstLine(join(dir, '.nvmrc')))
    ?? parseNodeVersionHint(await readFirstLine(join(dir, '.node-version')))
    ?? parseNodeVersionHint(pkg.engines?.node)
  const scripts = Object.fromEntries(
    Object.entries(pkg.scripts ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
  return {
    packageManager: await detectPackageManager(dir),
    scripts,
    nodeVersionHint,
    packageName: typeof pkg.name === 'string' && pkg.name ? pkg.name : null,
    pnp: (await exists(join(dir, '.pnp.cjs'))) || (await exists(join(dir, '.pnp.js'))),
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  }
  catch {
    return false
  }
}

/** Throws PROJECT_NOT_FOUND when the project directory vanished (moved, deleted, unmounted) */
export async function assertProjectDir(path: string): Promise<void> {
  if (!(await isDirectory(path)))
    throw new AppError('PROJECT_NOT_FOUND', undefined, { path })
}

/** Canonical absolute path of a directory that contains a package.json */
export async function normalizeProjectPath(path: string): Promise<string> {
  if (!path || !isAbsolute(path))
    throw new AppError('PROJECT_NOT_FOUND', undefined, { path })
  await assertProjectDir(path)
  const real = await realpath(path)
  if (!(await exists(join(real, 'package.json'))))
    throw new AppError('INVALID_PROJECT', undefined, { path: real })
  return real
}

export async function projectExists(path: string): Promise<boolean> {
  return isDirectory(path)
}
