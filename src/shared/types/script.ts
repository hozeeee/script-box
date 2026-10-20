export const SCRIPT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'] as const

export type ScriptExtension = (typeof SCRIPT_EXTENSIONS)[number]

export type ScriptLanguage = 'javascript' | 'typescript'

export interface ScriptFile {
  name: string
  language: ScriptLanguage
  size: number
  mtime: number
}
