export const SCRIPT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'] as const

export type ScriptExtension = (typeof SCRIPT_EXTENSIONS)[number]

export type ScriptLanguage = 'javascript' | 'typescript'

export interface ScriptFile {
  /** File name, or a POSIX path relative to the project root in project spaces (e.g. `src/index.ts`) */
  name: string
  language: ScriptLanguage
  size: number
  mtime: number
}

export interface ScriptSource {
  name: string
  content: string
}

export interface ScriptSources {
  files: ScriptSource[]
  /** Some files were skipped because the size budget ran out */
  truncated: boolean
}
