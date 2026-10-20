import type { SerializedError } from './errors'
import type {
  AppInfo,
  ConnectionTestResult,
  DeepPartial,
  DependencyInfo,
  DepTask,
  DepTaskEvent,
  InstalledRuntime,
  RemoteNodeVersion,
  RunConfig,
  RunExitEvent,
  RunOutputEvent,
  RunRecord,
  RunStartOptions,
  RuntimeInstallProgress,
  ScriptFile,
  Settings,
  Space,
  SpaceInput,
  TypeLib,
  UpdateStatus,
} from './types'

/** Request/response channels (renderer -> main, ipcRenderer.invoke) */
export interface IpcInvokeMap {
  'app:info': () => AppInfo
  'app:open-path': (path: string) => void
  'app:open-external': (url: string) => void
  'app:select-scripts': () => string[]

  'settings:get': () => Settings
  'settings:update': (patch: DeepPartial<Settings>) => Settings
  'settings:test-connection': (url: string) => ConnectionTestResult

  'runtime:list-remote': (force?: boolean) => RemoteNodeVersion[]
  'runtime:list-installed': () => InstalledRuntime[]
  'runtime:installing': () => RuntimeInstallProgress[]
  'runtime:install': (version: string) => void
  'runtime:cancel': (version: string) => void
  'runtime:remove': (version: string) => void

  'space:list': () => Space[]
  'space:get': (id: string) => Space
  'space:create': (input: SpaceInput) => Space
  'space:update': (id: string, input: Partial<SpaceInput>) => Space
  'space:remove': (id: string) => void
  'space:open-dir': (id: string) => void

  'script:list': (spaceId: string) => ScriptFile[]
  'script:read': (spaceId: string, name: string) => string
  'script:write': (spaceId: string, name: string, content: string) => void
  'script:create': (spaceId: string, name: string) => ScriptFile
  'script:import': (spaceId: string, paths: string[]) => string[]
  'script:rename': (spaceId: string, from: string, to: string) => void
  'script:remove': (spaceId: string, name: string) => void
  'script:save-run-config': (spaceId: string, name: string, config: RunConfig) => Space

  'deps:list': (spaceId: string) => DependencyInfo[]
  'deps:install': (spaceId: string, specs: string[]) => DepTask
  'deps:uninstall': (spaceId: string, names: string[]) => DepTask
  'deps:update': (spaceId: string, specs: string[]) => DepTask
  'deps:install-all': (spaceId: string) => DepTask
  'deps:cancel': (taskId: string) => void
  'deps:active': () => DepTask[]
  'deps:scan-missing': (spaceId: string, script: string) => string[]
  'deps:types': (spaceId: string) => TypeLib[]
  'deps:node-types': () => TypeLib[]

  'run:start': (spaceId: string, script: string, options: RunStartOptions) => RunRecord
  'run:stop': (runId: string) => void
  'run:active': () => RunRecord[]

  'history:list': (spaceId: string) => RunRecord[]
  'history:log': (spaceId: string, runId: string) => string
  'history:remove': (spaceId: string, runId: string) => void
  'history:clear': (spaceId: string) => void

  'updater:status': () => UpdateStatus
  'updater:check': () => UpdateStatus
  'updater:download': () => void
  'updater:install': () => void
}

/** Fire-and-forget channels (renderer -> main, ipcRenderer.send) */
export interface IpcSendMap {
  'run:write': (runId: string, data: string) => void
  'run:resize': (runId: string, cols: number, rows: number) => void
}

/** Push channels (main -> renderer) */
export interface IpcEventMap {
  'settings:changed': Settings
  'runtime:progress': RuntimeInstallProgress
  'deps:task': DepTaskEvent
  'run:output': RunOutputEvent
  'run:exit': RunExitEvent
  'updater:status': UpdateStatus
}

export type InvokeChannel = keyof IpcInvokeMap
export type SendChannel = keyof IpcSendMap
export type EventChannel = keyof IpcEventMap

export type IpcResult<T> = { ok: true, data: T } | { ok: false, error: SerializedError }

export interface ScriptBoxBridge {
  /** Errors are returned as values because contextBridge strips custom error fields */
  invoke: <C extends InvokeChannel>(
    channel: C,
    ...args: Parameters<IpcInvokeMap[C]>
  ) => Promise<IpcResult<Awaited<ReturnType<IpcInvokeMap[C]>>>>
  send: <C extends SendChannel>(channel: C, ...args: Parameters<IpcSendMap[C]>) => void
  on: <C extends EventChannel>(channel: C, listener: (payload: IpcEventMap[C]) => void) => () => void
  getPathForFile: (file: File) => string
}
