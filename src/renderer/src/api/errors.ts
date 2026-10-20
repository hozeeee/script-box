import type { TFunction } from 'i18next'
import { ApiError } from '.'

/** Turns any thrown value into a localized, human readable message */
export function formatError(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'UNKNOWN')
      return error.message
    const key = `errors.${error.code}`
    const detail = error.message && error.message !== error.code ? error.message : ''
    return t(key, { ...error.params, detail, defaultValue: error.message })
  }
  return error instanceof Error ? error.message : String(error)
}
