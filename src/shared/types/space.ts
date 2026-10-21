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

export interface ProjectInfo {
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

export function isNpmScriptKey(key: string): boolean {
  return key.startsWith(NPM_SCRIPT_PREFIX)
}
