import type { ScriptBoxBridge } from '../shared/ipc'

declare global {
  interface Window {
    bridge: ScriptBoxBridge
  }
}

export {}
