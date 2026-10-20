import type { Space } from '@shared/types'

export interface PrepareContext {
  space: Space
  script: string
  /** Absolute path of the script source */
  source: string
  args: string[]
}

export interface PreparedCommand {
  command: string
  args: string[]
  /** Directory prepended to PATH, e.g. the runtime's bin folder */
  binDir: string
  /** Runtime label shown in history, e.g. v22.11.0 */
  runtimeVersion: string
}

/** A language runner turns a script into a concrete command line */
export interface LanguageRunner {
  id: string
  supports: (script: string) => boolean
  prepare: (context: PrepareContext) => Promise<PreparedCommand>
}
