import type { EventChannel, IpcEventMap, ScriptBoxBridge } from '@shared/ipc'
import type { IpcRendererEvent } from 'electron'
import { contextBridge, ipcRenderer, webUtils } from 'electron'

const bridge: ScriptBoxBridge = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: <C extends EventChannel>(channel: C, listener: (payload: IpcEventMap[C]) => void) => {
    const handler = (_event: IpcRendererEvent, payload: IpcEventMap[C]): void => listener(payload)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  },
  getPathForFile: file => webUtils.getPathForFile(file),
}

contextBridge.exposeInMainWorld('bridge', bridge)
