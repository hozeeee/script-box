import type { EnvVar } from './settings'

export interface RunConfig {
  /** Raw command line arguments, parsed shell-like before spawning */
  args: string
  env: EnvVar[]
}

export interface ScriptMeta {
  runConfig: RunConfig
}

export interface Space {
  id: string
  name: string
  description: string
  nodeVersion: string | null
  createdAt: number
  updatedAt: number
  scripts: Record<string, ScriptMeta>
  /** Absolute path of an external project referenced in place; absent for regular spaces */
  projectPath?: string
  /** Computed when listing, never persisted: the project directory is gone */
  projectMissing?: boolean
}

export interface SpaceInput {
  name: string
  description?: string
  nodeVersion: string | null
  /** Only honoured for project spaces (re-link after the project moved) */
  projectPath?: string
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export interface ProjectScriptGroup {
  /** 相对于工程根目录的 POSIX 路径；空字符串表示根目录 */
  directory: string
  packageName: string | null
  packageManager: PackageManager
  scripts: Record<string, string>
}

export interface ProjectInfo {
  /** 包含根工程及子目录 package.json 的命令分组 */
  scriptGroups?: ProjectScriptGroup[]
  scriptsTruncated?: boolean
  packageManager: PackageManager
  /** `scripts` of the project's package.json */
  scripts: Record<string, string>
  /** Version requested by .nvmrc / .node-version / engines.node, e.g. `22` or `v22.11.0` */
  nodeVersionHint: string | null
  /** package.json `name`, used to prefill the import dialog */
  packageName: string | null
  /** The script list hit its size limit and was cut short */
  truncated: boolean
  /** Yarn Plug'n'Play project without node_modules */
  pnp: boolean
}

/** Run key prefix of package.json scripts, e.g. `npm:dev`; `:` never appears in file names */
export const NPM_SCRIPT_PREFIX = 'npm:'

const PROJECT_SCRIPT_PREFIX = 'npm-project:'

export function npmScriptKey(directory: string, name: string): string {
  return directory ? `${PROJECT_SCRIPT_PREFIX}${encodeURIComponent(directory)}:${encodeURIComponent(name)}` : `${NPM_SCRIPT_PREFIX}${name}`
}

export function parseNpmScriptKey(key: string): { directory: string, name: string } | null {
  if (key.startsWith(NPM_SCRIPT_PREFIX)) {
    const name = key.slice(NPM_SCRIPT_PREFIX.length)
    return name ? { directory: '', name } : null
  }
  if (!key.startsWith(PROJECT_SCRIPT_PREFIX))
    return null
  const parts = key.slice(PROJECT_SCRIPT_PREFIX.length).split(':')
  if (parts.length !== 2)
    return null
  try {
    const directory = decodeURIComponent(parts[0]!)
    const name = decodeURIComponent(parts[1]!)
    return directory && name ? { directory, name } : null
  }
  catch {
    return null
  }
}

/** 展示目录与命令名称，运行配置和历史仍使用原始运行键 */
export function scriptLabel(key: string): string {
  const target = parseNpmScriptKey(key)
  return target?.directory ? `${target.directory} · ${target.name}` : key
}

export function isNpmScriptKey(key: string): boolean {
  return key.startsWith(NPM_SCRIPT_PREFIX) || key.startsWith(PROJECT_SCRIPT_PREFIX)
}
