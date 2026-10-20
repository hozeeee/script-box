import type { LanguageRunner } from './types'
import { AppError } from '@shared/errors'
import { nodeRunner } from './node'

const runners: LanguageRunner[] = [nodeRunner]

export function resolveLanguageRunner(script: string): LanguageRunner {
  const runner = runners.find(item => item.supports(script))
  if (!runner)
    throw new AppError('UNSUPPORTED_SCRIPT', undefined, { name: script })
  return runner
}

export type { LanguageRunner, PreparedCommand } from './types'
