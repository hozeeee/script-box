import type { LanguageRunner } from './types'
import { ensurePythonEnv } from '../../python'

export const pythonRunner: LanguageRunner = {
  id: 'python',
  supports: script => script.endsWith('.py'),
  async prepare({ space, source, args }) {
    const version = space.runtime?.version ?? null
    return {
      command: 'python',
      args: [source, ...args],
      binDir: '',
      runtimeVersion: version ? `Python ${version}` : 'Python',
      runtimeKind: 'python' as const,
      preflight: async (onData) => {
        const result = await ensurePythonEnv(space, onData)
        return { command: result.python, binDir: result.binDir }
      },
    }
  },
}
