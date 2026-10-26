import type { RuntimeKind } from '@shared/types'
import { pythonRuntimeService } from '../services/python'
import { runtimeService } from '../services/runtime'
import { broadcast, handle } from './helpers'

export function registerRuntimeIpc(): void {
  handle('runtime:list-remote', (kind: RuntimeKind, force?: boolean) => {
    if (kind === 'python')
      return pythonRuntimeService.listRemote()
    return runtimeService.listRemote(force)
  })
  handle('runtime:list-installed', async (kind?: RuntimeKind) => {
    if (kind === 'python')
      return pythonRuntimeService.listInstalled()
    if (kind === 'node')
      return runtimeService.listInstalled()
    // A broken Python toolchain must not hide installed Node.js runtimes
    const [node, python] = await Promise.all([
      runtimeService.listInstalled(),
      pythonRuntimeService.listInstalled().catch(() => []),
    ])
    return [...node, ...python]
  })
  handle('runtime:installing', (kind?: RuntimeKind) => {
    if (kind === 'python')
      return pythonRuntimeService.installing()
    if (kind === 'node')
      return runtimeService.installing()
    return [...runtimeService.installing(), ...pythonRuntimeService.installing()]
  })
  handle('runtime:install', (kind: RuntimeKind, version: string) => {
    if (kind === 'python')
      return pythonRuntimeService.install(version)
    return runtimeService.install(version)
  })
  handle('runtime:cancel', (kind: RuntimeKind, version: string) => {
    if (kind === 'python')
      return pythonRuntimeService.cancel(version)
    return runtimeService.cancel(version)
  })
  handle('runtime:remove', (kind: RuntimeKind, version: string) => {
    if (kind === 'python')
      return pythonRuntimeService.remove(version)
    return runtimeService.remove(version)
  })

  runtimeService.on('progress', progress => broadcast('runtime:progress', progress))
  pythonRuntimeService.on('progress', progress => broadcast('runtime:progress', progress))
}
