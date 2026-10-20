import type { SerializedError } from '@shared/errors'
import type { EventChannel, InvokeChannel, IpcEventMap, IpcInvokeMap, IpcSendMap, SendChannel } from '@shared/ipc'

/** Error raised in the main process, carrying a translatable code */
export class ApiError extends Error {
  readonly code: SerializedError['code']
  readonly params?: SerializedError['params']

  constructor(error: SerializedError) {
    super(error.message)
    this.name = 'ApiError'
    this.code = error.code
    this.params = error.params
  }
}

const bridge = window.bridge

export async function invoke<C extends InvokeChannel>(
  channel: C,
  ...args: Parameters<IpcInvokeMap[C]>
): Promise<Awaited<ReturnType<IpcInvokeMap[C]>>> {
  const result = await bridge.invoke(channel, ...args)
  if (!result.ok)
    throw new ApiError(result.error)
  return result.data
}

export function send<C extends SendChannel>(channel: C, ...args: Parameters<IpcSendMap[C]>): void {
  bridge.send(channel, ...args)
}

export function on<C extends EventChannel>(channel: C, listener: (payload: IpcEventMap[C]) => void): () => void {
  return bridge.on(channel, listener)
}

export const getPathForFile = (file: File): string => bridge.getPathForFile(file)
