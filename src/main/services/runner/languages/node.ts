import type { LanguageRunner } from './types'
import { runtimeService } from '../../runtime'
import { scriptExtension } from '../../script'
import { prepareEntry } from '../transpile'

export const nodeRunner: LanguageRunner = {
  id: 'node',
  supports: script => scriptExtension(script) !== null,
  async prepare({ space, script, source, args }) {
    const runtime = await runtimeService.resolve(space.runtime?.version ?? space.nodeVersion ?? null)
    const entry = await prepareEntry(space, script, source, runtime.version)
    return {
      command: runtime.node,
      args: [entry, ...args],
      binDir: runtime.bin,
      runtimeVersion: runtime.version,
    }
  },
}
