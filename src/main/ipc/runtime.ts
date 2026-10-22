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
  handle('runtime:list-installed', (kind?: RuntimeKind) => {
    if (kind === 'python')
      return pythonRuntimeService.listInstalled()
    return runtimeService.listInstalled()
  })
  handle('runtime:installing', (kind?: RuntimeKind) => {
    if (kind === 'python')
      return pythonRuntimeService.installing()
    return runtimeService.installing()
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
