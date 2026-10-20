import { registerAppIpc } from './app'
import { registerDepsIpc } from './deps'
import { registerRunIpc } from './run'
import { registerRuntimeIpc } from './runtime'
import { registerScriptIpc } from './script'
import { registerSettingsIpc } from './settings'
import { registerSpaceIpc } from './space'
import { registerUpdaterIpc } from './updater'

export function registerIpc(): void {
  registerAppIpc()
  registerSettingsIpc()
  registerRuntimeIpc()
  registerSpaceIpc()
  registerScriptIpc()
  registerDepsIpc()
  registerRunIpc()
  registerUpdaterIpc()
}
