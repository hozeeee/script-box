import { runtimeService } from '../services/runtime'
import { broadcast, handle } from './helpers'

export function registerRuntimeIpc(): void {
  handle('runtime:list-remote', force => runtimeService.listRemote(force))
  handle('runtime:list-installed', () => runtimeService.listInstalled())
  handle('runtime:installing', () => runtimeService.installing())
  handle('runtime:install', version => runtimeService.install(version))
  handle('runtime:cancel', version => runtimeService.cancel(version))
  handle('runtime:remove', version => runtimeService.remove(version))

  runtimeService.on('progress', progress => broadcast('runtime:progress', progress))
}
