import type { ScriptExtension, ScriptLanguage } from '@shared/types'
import { extname } from 'node:path'
import { SCRIPT_EXTENSIONS } from '@shared/types'

// eslint-disable-next-line no-control-regex
const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001F]/

export function scriptExtension(name: string): ScriptExtension | null {
  const ext = extname(name).toLowerCase()
  return (SCRIPT_EXTENSIONS as readonly string[]).includes(ext) ? ext as ScriptExtension : null
}

export function isScriptFile(name: string): boolean {
  return scriptExtension(name) !== null
}

export function languageOf(name: string): ScriptLanguage {
  const ext = scriptExtension(name)
  return ext === '.ts' || ext === '.mts' || ext === '.cts' ? 'typescript' : 'javascript'
}

export function isTypeScript(name: string): boolean {
  return languageOf(name) === 'typescript'
}

/** A script name is a plain file name (no directories) with a supported extension */
export function isValidScriptName(name: string): boolean {
  if (!name || name.length > 128 || name.startsWith('.') || name.includes('..'))
    return false
  if (INVALID_CHARS.test(name) || name.trim() !== name)
    return false
  return isScriptFile(name)
}

function isValidSegment(segment: string): boolean {
  return !!segment
    && segment.length <= 255
    && segment !== '.'
    && segment !== '..'
    && !INVALID_CHARS.test(segment)
    && segment.trim() === segment
}

/**
 * Script path inside a project space: POSIX separators, relative, no `.`/`..`
 * segments (so it can never leave the project) and a supported extension.
 */
export function isValidScriptPath(path: string): boolean {
  if (!path || path.length > 1024)
    return false
  const segments = path.split('/')
  return segments.every(isValidSegment) && isScriptFile(segments[segments.length - 1]!)
}

/** `.d.ts` files are type declarations, not runnable scripts */
export function isDeclarationFile(name: string): boolean {
  return /\.d\.[cm]?ts$/i.test(name)
}

/** Returns `name` or `name-1.ext`, `name-2.ext`... whichever is not taken */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name))
    return name
  const ext = extname(name)
  const base = name.slice(0, name.length - ext.length)
  for (let i = 1; ; i++) {
    const candidate = `${base}-${i}${ext}`
    if (!taken.has(candidate))
      return candidate
  }
}
