import type { ChildProcess } from 'node:child_process'
import type { ResolvedRuntime } from '../runtime'
import { spawn } from 'node:child_process'
import { paths } from '../../paths'
import { buildProcessEnv } from '../runtime/env'
import { buildNetworkEnv, settingsStore } from '../settings'

export function npmArgs(args: string[]): string[] {
  return [...args, '--cache', paths.npmCache, '--color', 'always', '--no-fund', '--no-audit']
}

/** Run the npm bundled with `runtime`, honouring the global registry / proxy settings */
export function spawnNpm(runtime: ResolvedRuntime, args: string[], cwd: string): ChildProcess {
  const env = buildProcessEnv(runtime.bin, process.env, buildNetworkEnv(settingsStore.get().network), {
    FORCE_COLOR: '1',
  })
  return spawn(runtime.node, [runtime.npmCli, ...npmArgs(args)], {
    cwd,
    env,
    windowsHide: true,
  })
}
