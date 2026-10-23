import type { Space } from '@shared/types'
import { isAbsolute, join, relative, win32 } from 'node:path'
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
  get pythonRuntimes() {
    return join(root(), 'runtimes', 'python')
  },
  get tools() {
    return join(root(), 'tools')
  },
  get uv() {
    return join(root(), 'tools', 'uv')
  },
  get uvCache() {
    return join(root(), 'tools', 'uv-cache')
  },
  get pythonTools() {
    return join(root(), 'tools', 'python')
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
  get updates() {
    return join(root(), 'updates')
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
  /** Metadata directory inside userData; for project spaces it never contains the project itself */
  root: (id: string) => spaceDir(id),
  meta: (id: string) => join(spaceDir(id), 'space.json'),
  pkg: (id: string) => join(spaceDir(id), 'package.json'),
  nodeModules: (id: string) => join(spaceDir(id), 'node_modules'),
  scripts: (id: string) => join(spaceDir(id), 'scripts'),
  build: (id: string) => join(spaceDir(id), '.scriptbox', 'build'),
  pythonVenv: (id: string) => join(spaceDir(id), '.scriptbox', 'python-venv'),
  pythonSync: (id: string) => join(spaceDir(id), '.scriptbox', 'python-sync.json'),
}

/** Directory scripts run in and npm operates on: the project for project spaces */
export function spaceWorkDir(space: Space): string {
  return space.projectPath ?? spacePaths.root(space.id)
}

/** Directory script names are relative to */
export function spaceScriptsDir(space: Space): string {
  return space.projectPath ?? spacePaths.scripts(space.id)
}

/** 工程内任意文件类型的相对路径，禁止绝对路径和路径穿越 */
export function projectEntryPath(root: string, name: string): string {
  if (name && (isAbsolute(name) || win32.isAbsolute(name) || name.includes('\\') || name.includes('\0') || name.split('/').some(part => !part || part === '.' || part === '..')))
    throw new AppError('INVALID_SCRIPT_NAME', undefined, { name })
  const path = join(root, ...name.split('/'))
  const rel = relative(root, path)
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel))
    throw new AppError('INVALID_SCRIPT_NAME', undefined, { name })
  return path
}

export const workPaths = {
  pkg: (space: Space) => join(spaceWorkDir(space), 'package.json'),
  nodeModules: (space: Space) => join(spaceWorkDir(space), 'node_modules'),
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
