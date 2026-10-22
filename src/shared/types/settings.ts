export type LocaleSetting = 'system' | 'zh-CN' | 'en-US'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface EnvVar {
  key: string
  value: string
}

export interface ProxySettings {
  enabled: boolean
  /** e.g. http://127.0.0.1:7890 */
  http: string
  /** Falls back to `http` when empty */
  https: string
  /** Comma separated host list */
  noProxy: string
}

export interface NetworkSettings {
  nodeMirror: string
  npmRegistry: string
  pypiIndex: string
  proxy: ProxySettings
  /** Extra env vars injected into npm and scripts, e.g. ELECTRON_MIRROR */
  binaryMirrors: EnvVar[]
}

export interface RunSettings {
  historyLimit: number
  defaultNodeVersion: string | null
  defaultPythonVersion: string | null
}

export interface UpdateSettings {
  autoCheck: boolean
}

export interface Settings {
  locale: LocaleSetting
  theme: ThemeMode
  network: NetworkSettings
  run: RunSettings
  update: UpdateSettings
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? U[]
    : T[K] extends object | null
      ? DeepPartial<T[K]>
      : T[K]
}

export interface ConnectionTestResult {
  ok: boolean
  status?: number
  elapsed: number
  error?: string
}
