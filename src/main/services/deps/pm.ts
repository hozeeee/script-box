import type { DepTaskKind, PackageManager } from '@shared/types'
import type { ResolvedRuntime } from '../runtime'
import { access, constants } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { AppError } from '@shared/errors'
import { exists } from '../../utils/fs'

/** How to launch a package manager: `command ...prefix <pm args>` */
export interface PmLauncher {
  manager: PackageManager
  command: string
  prefix: string[]
  /** Extra environment, e.g. corepack switches */
  env: Record<string, string>
}

/** Corepack shipped with a runtime (removed from Node.js distributions since v25) */
export function corepackCli(runtimeDir: string, platform: string = process.platform): string {
  return platform === 'win32'
    ? join(runtimeDir, 'node_modules', 'corepack', 'dist', 'corepack.js')
    : join(runtimeDir, 'lib', 'node_modules', 'corepack', 'dist', 'corepack.js')
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  }
  catch {
    return false
  }
}

/** Look a command up on the host PATH, like `which` */
export async function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH'
  const dirs = (env[pathKey] ?? '').split(delimiter).filter(Boolean)
  const names = process.platform === 'win32' ? [`${name}.cmd`, `${name}.exe`, name] : [name]
  for (const dir of dirs) {
    for (const candidate of names) {
      const full = join(dir, candidate)
      if (await isExecutable(full))
        return full
    }
  }
  return null
}

/** Batch files cannot be spawned directly on Windows, run them through cmd.exe */
function launchBinary(manager: PackageManager, path: string): PmLauncher {
  if (process.platform === 'win32' && /\.cmd$/i.test(path))
    return { manager, command: process.env.ComSpec ?? 'cmd.exe', prefix: ['/d', '/s', '/c', path], env: {} }
  return { manager, command: path, prefix: [], env: {} }
}

/**
 * npm comes with every runtime. pnpm / yarn go through the runtime's corepack
 * (which honours the project's `packageManager` field), falling back to a
 * binary on the host PATH. bun is only looked up on PATH.
 */
export async function resolvePackageManager(manager: PackageManager, runtime: ResolvedRuntime): Promise<PmLauncher> {
  if (manager === 'npm')
    return { manager, command: runtime.node, prefix: [runtime.npmCli], env: {} }
  if (manager !== 'bun') {
    const corepack = corepackCli(runtime.dir)
    if (await exists(corepack)) {
      return {
        manager,
        command: runtime.node,
        prefix: [corepack, manager],
        env: { COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
      }
    }
  }
  const binary = await findOnPath(manager)
  if (!binary)
    throw new AppError('PACKAGE_MANAGER_NOT_FOUND', undefined, { manager })
  return launchBinary(manager, binary)
}

/** Registry variables understood by corepack and yarn, derived from the npm registry setting */
export function registryEnv(networkEnv: Record<string, string>): Record<string, string> {
  const registry = networkEnv.npm_config_registry?.replace(/\/+$/, '')
  if (!registry)
    return {}
  return {
    COREPACK_NPM_REGISTRY: registry,
    YARN_REGISTRY: `${registry}/`,
    YARN_NPM_REGISTRY_SERVER: registry,
  }
}

/** Command line of a dependency task for the given package manager */
export function depTaskArgs(manager: PackageManager, kind: DepTaskKind, packages: string[]): string[] {
  if (manager === 'npm') {
    switch (kind) {
      case 'install': return ['install', ...packages, '--save', '--prefer-offline']
      case 'update': return ['install', ...packages, '--save', '--prefer-online']
      case 'uninstall': return ['uninstall', ...packages]
      case 'install-all': return ['install', '--prefer-offline']
    }
  }
  switch (kind) {
    case 'install':
    case 'update':
      return ['add', ...packages]
    case 'uninstall':
      return ['remove', ...packages]
    case 'install-all':
      return ['install']
  }
}

/** `<pm> run <script> [args]`; npm needs `--` so flags reach the script instead of npm */
export function runScriptArgs(manager: PackageManager, script: string, args: string[]): string[] {
  if (manager === 'npm')
    return args.length ? ['run', script, '--', ...args] : ['run', script]
  return ['run', script, ...args]
}
