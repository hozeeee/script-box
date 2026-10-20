import type { DeepPartial } from '@shared/types'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Recursively merge `patch` into `base`. Arrays and primitives are replaced, not merged. */
export function deepMerge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!isPlainObject(base) || !isPlainObject(patch))
    return (patch === undefined ? base : patch) as T
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined)
      continue
    const current = (base as Record<string, unknown>)[key]
    result[key] = isPlainObject(current) && isPlainObject(value)
      ? deepMerge(current, value)
      : value
  }
  return result as T
}
