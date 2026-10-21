import type { PackageManager, ProjectInfo, ProjectScriptGroup } from '@shared/types'
import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { AppError } from '@shared/errors'
import { parseNpmScriptKey } from '@shared/types'
import { exists, readJson } from '../../utils/fs'
import { resolveProjectDirectory } from '../script/project-files'
import { walkProject } from '../script/walk'

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
export async function detectPackageManager(dir: string, root = dir): Promise<PackageManager> {
  let current = dir
  while (true) {
    const pkg = await readJson<ProjectPackageJson>(join(current, 'package.json'), {})
    const declared = parsePackageManagerField(pkg.packageManager)
    if (declared)
      return declared
    for (const [file, manager] of LOCKFILES) {
      if (await exists(join(current, file)))
        return manager
    }
    const parent = dirname(current)
    if (current === root || parent === current)
      return 'npm'
    current = parent
  }
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

/** 递归收集工程自己的 package.json；跳过依赖和构建目录，不跟随符号链接 */
export async function scanProjectScripts(root: string): Promise<{ scriptGroups: ProjectScriptGroup[], scriptsTruncated: boolean }> {
  const walked = await walkProject(root, {
    accept: name => name === 'package.json' || name.endsWith('/package.json'),
    respectGitignore: false,
    maxFiles: 1000,
  })
  const scriptGroups: ProjectScriptGroup[] = []
  for (const file of walked.files) {
    const directory = file === 'package.json' ? '' : file.slice(0, -'/package.json'.length)
    const dir = await resolveProjectDirectory(root, directory).catch(() => null)
    if (!dir)
      continue
    const info = await readProjectInfo(dir)
    if (!Object.keys(info.scripts).length)
      continue
    scriptGroups.push({ directory, scripts: info.scripts, packageName: info.packageName, packageManager: await detectPackageManager(dir, root) })
  }
  return { scriptGroups, scriptsTruncated: walked.truncated }
}

/** 运行或保存配置前重新读取目标目录，避免执行缓存或越界命令 */
export async function resolveProjectScript(root: string, key: string): Promise<{ cwd: string, name: string, packageManager: PackageManager }> {
  const target = key.length <= 4096 ? parseNpmScriptKey(key) : null
  if (!target)
    throw new AppError('INVALID_SCRIPT_NAME', undefined, { name: key })
  const cwd = await resolveProjectDirectory(root, target.directory)
  const info = await readProjectInfo(cwd)
  if (!Object.hasOwn(info.scripts, target.name))
    throw new AppError('SCRIPT_NOT_FOUND', undefined, { name: key })
  return { cwd, name: target.name, packageManager: await detectPackageManager(cwd, root) }
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
