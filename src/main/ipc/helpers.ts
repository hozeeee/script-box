import type {
  EventChannel,
  InvokeChannel,
  IpcEventMap,
  IpcInvokeMap,
  IpcResult,
  IpcSendMap,
  SendChannel,
} from '@shared/ipc'
import { serializeError } from '@shared/errors'
import { BrowserWindow, ipcMain } from 'electron'

type Handler<C extends InvokeChannel> = (
  ...args: Parameters<IpcInvokeMap[C]>
) => ReturnType<IpcInvokeMap[C]> | Promise<ReturnType<IpcInvokeMap[C]>>

export function handle<C extends InvokeChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<ReturnType<IpcInvokeMap[C]>>> => {
    try {
      const data = await handler(...(args as Parameters<IpcInvokeMap[C]>))
      return { ok: true, data }
    }
    catch (error) {
      console.error(`[ipc] ${channel} failed:`, error)
      return { ok: false, error: serializeError(error) }
    }
  })
}

export function listen<C extends SendChannel>(channel: C, listener: IpcSendMap[C]): void {
  ipcMain.on(channel, (_event, ...args) => {
    try {
      (listener as (...a: unknown[]) => void)(...args)
    }
    catch (error) {
      console.error(`[ipc] ${channel} failed:`, error)
    }
  })
}

export function broadcast<C extends EventChannel>(channel: C, payload: IpcEventMap[C]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed())
      win.webContents.send(channel, payload)
  }
}
