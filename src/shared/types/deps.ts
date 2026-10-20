export interface DependencyInfo {
  name: string
  /** Version range declared in package.json */
  wanted: string
  /** Version actually present in node_modules */
  installed: string | null
  dev: boolean
}

export type DepTaskKind = 'install' | 'uninstall' | 'update' | 'install-all'

export interface DepTask {
  id: string
  spaceId: string
  kind: DepTaskKind
  packages: string[]
  startedAt: number
}

export type DepTaskEvent
  = | { type: 'start', task: DepTask }
    | { type: 'data', taskId: string, spaceId: string, data: string }
    | { type: 'exit', taskId: string, spaceId: string, code: number | null }

export interface TypeLib {
  /** Virtual path, e.g. file:///node_modules/lodash/index.d.ts */
  path: string
  content: string
}
