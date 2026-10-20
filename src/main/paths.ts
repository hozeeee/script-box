import { join } from 'node:path'
import { AppError } from '@shared/errors'
import { app } from 'electron'

const root = (): string => app.getPath('userData')

export const paths = {
  get root() {
    return root()
  },
  get settings() {
    return join(root(), 'settings.json')
  },
  get runtimes() {
    return join(root(), 'runtimes', 'node')
  },
  get npmCache() {
    return join(root(), 'npm-cache')
  },
  get spaces() {
    return join(root(), 'spaces')
  },
  get spaceOrder() {
    return join(root(), 'spaces', 'order.json')
  },
  get history() {
    return join(root(), 'history')
  },
  get temp() {
    return join(root(), 'tmp')
  },
}

export const ID_PATTERN = /^[\w-]{1,64}$/

/** Guards every id that ends up in a file path against traversal */
function safeId(id: string): string {
  if (!ID_PATTERN.test(id))
    throw new AppError('SPACE_NOT_FOUND', undefined, { id })
  return id
}

const spaceDir = (id: string): string => join(paths.spaces, safeId(id))
const historyDir = (spaceId: string): string => join(paths.history, safeId(spaceId))

export const spacePaths = {
  root: (id: string) => spaceDir(id),
  meta: (id: string) => join(spaceDir(id), 'space.json'),
  pkg: (id: string) => join(spaceDir(id), 'package.json'),
  nodeModules: (id: string) => join(spaceDir(id), 'node_modules'),
  scripts: (id: string) => join(spaceDir(id), 'scripts'),
  build: (id: string) => join(spaceDir(id), '.scriptbox', 'build'),
}

export const historyPaths = {
  dir: (spaceId: string) => historyDir(spaceId),
  meta: (spaceId: string, runId: string) => join(historyDir(spaceId), `${safeId(runId)}.json`),
  log: (spaceId: string, runId: string) => join(historyDir(spaceId), `${safeId(runId)}.log`),
}

/** Directory of bundled resources (dev: project root, prod: process.resourcesPath) */
export function resourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : app.getAppPath()
}
