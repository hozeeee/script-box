import { delimiter } from 'node:path'

/** Variables inherited from the host that would confuse a child Node.js process */
const BLOCKED = [/^ELECTRON_/i, /^NODE_OPTIONS$/i, /^NODE_PATH$/i, /^npm_/i, /^VITE_/i]

/**
 * Build the environment for processes spawned with a managed runtime.
 * Later `extras` win; the runtime's bin directory is put first on PATH.
 */
export function buildProcessEnv(
  runtimeBin: string,
  base: NodeJS.ProcessEnv,
  ...extras: Record<string, string>[]
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && !BLOCKED.some(pattern => pattern.test(key)))
      env[key] = value
  }
  for (const extra of extras)
    Object.assign(env, extra)

  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH'
  const current = env[pathKey]
  env[pathKey] = current ? `${runtimeBin}${delimiter}${current}` : runtimeBin
  return env
}
