import type { InstalledRuntime, RemotePythonVersion, RuntimeInstallProgress } from '@shared/types'
import { EventEmitter } from 'node:events'
import { AppError } from '@shared/errors'
import { paths } from '../../paths'
import { exists } from '../../utils/fs'
import { uvService } from './uv'

interface UvPythonEntry {
  key?: string
  version?: string
  implementation?: string
  path?: string
}

export interface ResolvedPythonRuntime {
  version: string
  python: string
  bin: string
}

const SUPPORTED_MINORS = new Set(['3.11', '3.12', '3.13', '3.14', '3.15'])

function plain(version: string): string {
  return version.replace(/^cpython-/, '').replace(/^v/, '')
}

function parseEntries(text: string): UvPythonEntry[] {
  const parsed = JSON.parse(text) as unknown
  return Array.isArray(parsed) ? parsed as UvPythonEntry[] : []
}

function executableBin(path: string): string {
  const separator = process.platform === 'win32' ? '\\' : '/'
  return path.slice(0, path.lastIndexOf(separator))
}

class PythonRuntimeService extends EventEmitter<{ progress: [RuntimeInstallProgress] }> {
  private installs = new Map<string, { controller: AbortController, progress: RuntimeInstallProgress }>()

  async listRemote(): Promise<RemotePythonVersion[]> {
    const { stdout } = await uvService.run(['python', 'list', '--all-versions', '--only-downloads', '--output-format', 'json'])
    const latest = new Map<string, RemotePythonVersion>()
    for (const entry of parseEntries(stdout)) {
      const version = plain(entry.version ?? entry.key ?? '')
      const match = /^(\d+\.\d+)\.\d+$/.exec(version)
      if (!match || !SUPPORTED_MINORS.has(match[1]!))
        continue
      const current = latest.get(match[1]!)
      if (!current || version.localeCompare(current.version, undefined, { numeric: true }) > 0)
        latest.set(match[1]!, { kind: 'python', version, date: '' })
    }
    return [...latest.values()].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
  }

  async listInstalled(): Promise<InstalledRuntime[]> {
    const { stdout } = await uvService.run(['python', 'list', '--only-installed', '--output-format', 'json'])
    const seen = new Set<string>()
    const installed: InstalledRuntime[] = []
    for (const entry of parseEntries(stdout)) {
      const version = plain(entry.version ?? entry.key ?? '')
      if (!/^\d+\.\d+\.\d+$/.test(version) || seen.has(version) || !entry.path)
        continue
      seen.add(version)
      installed.push({ kind: 'python', version, dir: entry.path })
    }
    return installed.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
  }

  installing(): RuntimeInstallProgress[] {
    return [...this.installs.values()].map(item => item.progress)
  }

  install(version: string): void {
    if (!/^\d+\.\d+(?:\.\d+)?$/.test(version))
      throw new AppError('VERSION_NOT_FOUND', undefined, { version })
    if (this.installs.has(version))
      throw new AppError('RUNTIME_INSTALLING', undefined, { version })
    const controller = new AbortController()
    const progress: RuntimeInstallProgress = { kind: 'python', version, phase: 'prepare', received: 0, total: 0 }
    this.installs.set(version, { controller, progress })
    this.emit('progress', { ...progress })
    void this.doInstall(version, controller, progress)
  }

  cancel(version: string): void {
    this.installs.get(version)?.controller.abort()
  }

  async remove(version: string): Promise<void> {
    await uvService.run(['python', 'uninstall', version])
  }

  async resolve(version: string | null): Promise<ResolvedPythonRuntime> {
    if (!version)
      throw new AppError('NO_PYTHON_VERSION')
    const { stdout } = await uvService.run(['python', 'find', '--python-preference', 'only-managed', version])
    const python = stdout.trim().split(/\r?\n/).pop() ?? ''
    if (!python || !(await exists(python)))
      throw new AppError('RUNTIME_NOT_INSTALLED', undefined, { version })
    return { version, python, bin: executableBin(python) }
  }

  private async doInstall(version: string, controller: AbortController, progress: RuntimeInstallProgress): Promise<void> {
    try {
      progress.phase = 'install'
      progress.detail = `Python ${version}`
      this.emit('progress', { ...progress })
      await uvService.run(['python', 'install', version], {
        signal: controller.signal,
        onData: (detail) => {
          progress.detail = detail.trim().split(/\r?\n/).pop()
          this.emit('progress', { ...progress })
        },
      })
      progress.phase = 'done'
    }
    catch (error) {
      progress.phase = controller.signal.aborted ? 'canceled' : 'error'
      progress.error = error instanceof Error ? error.message : String(error)
    }
    finally {
      this.installs.delete(version)
      this.emit('progress', { ...progress })
    }
  }
}

export const pythonRuntimeService = new PythonRuntimeService()
export const pythonRuntimeRoot = paths.pythonRuntimes
