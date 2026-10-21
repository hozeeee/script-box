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

export interface ProjectEntry {
  /** 相对于工程根目录的 POSIX 路径 */
  name: string
  kind: 'directory' | 'file' | 'symlink'
  /** 仅支持编辑和运行的普通脚本文件提供此字段 */
  script?: ScriptFile
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
