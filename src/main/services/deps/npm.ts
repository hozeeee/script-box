import type { ChildProcess } from 'node:child_process'
import type { ResolvedRuntime } from '../runtime'
import type { PmLauncher } from './pm'
import { spawn } from 'node:child_process'
import { paths } from '../../paths'
import { buildProcessEnv } from '../runtime/env'
import { buildNetworkEnv, settingsStore } from '../settings'
import { registryEnv } from './pm'

export function npmArgs(args: string[]): string[] {
  return [...args, '--cache', paths.npmCache, '--color', 'always', '--no-fund', '--no-audit']
}

/**
 * Run a package manager with `runtime` on PATH, honouring the global registry /
 * proxy settings. npm additionally uses the app's own cache folder.
 */
export function spawnPm(runtime: ResolvedRuntime, launcher: PmLauncher, args: string[], cwd: string): ChildProcess {
  const network = buildNetworkEnv(settingsStore.get().network)
  const env = buildProcessEnv(runtime.bin, process.env, network, registryEnv(network), launcher.env, {
    FORCE_COLOR: '1',
  })
  const finalArgs = launcher.manager === 'npm' ? npmArgs(args) : args
  return spawn(launcher.command, [...launcher.prefix, ...finalArgs], {
    cwd,
    env,
    windowsHide: true,
  })
}
