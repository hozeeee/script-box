import { builtinModules } from 'node:module'

const BUILTINS = new Set(builtinModules)

const SPEC_PATTERN = /^(?:@[a-z0-9~][\w.~-]*\/)?[a-z0-9~][\w.~-]*(?:@[^\s@]+)?$/i

/**
 * Map an import specifier to the npm package it comes from.
 * Returns null for relative paths, URLs and Node.js builtins.
 */
export function toPackageName(specifier: string): string | null {
  if (!specifier || /^[./#]/.test(specifier))
    return null
  // node:, http:, file:, data: and Windows drive letters
  if (/^[a-z][a-z\d+.-]*:/i.test(specifier))
    return null
  const parts = specifier.split('/')
  let name: string | null
  if (specifier.startsWith('@'))
    name = parts.length >= 2 && parts[1] ? `${parts[0]}/${parts[1]}` : null
  else
    name = parts[0]
  if (!name || BUILTINS.has(name))
    return null
  return name
}

export interface PackageSpec {
  name: string
  range: string | null
}

/** Split `lodash@^4` / `@types/node@22` into name and range */
export function parseSpec(spec: string): PackageSpec {
  const value = spec.trim()
  const at = value.indexOf('@', value.startsWith('@') ? 1 : 0)
  if (at <= 0)
    return { name: value, range: null }
  return { name: value.slice(0, at), range: value.slice(at + 1) || null }
}

/** Rejects anything that could be interpreted as an npm CLI flag or a path */
export function isValidSpec(spec: string): boolean {
  return SPEC_PATTERN.test(spec.trim())
}

export function findMissing(imported: Iterable<string>, available: Set<string>): string[] {
  const missing = new Set<string>()
  for (const name of imported) {
    if (!available.has(name))
      missing.add(name)
  }
  return [...missing].sort()
}
