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
}

export interface SpaceInput {
  name: string
  description?: string
  nodeVersion: string | null
}
