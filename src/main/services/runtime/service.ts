import type { InstalledRuntime, RemoteNodeVersion, RuntimeInstallProgress } from '@shared/types'
import { EventEmitter } from 'node:events'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '@shared/errors'
import { paths } from '../../paths'
import { exists, readJson } from '../../utils/fs'
import { downloadFile, fetchJson, fetchText } from '../network'
import { settingsStore } from '../settings'
import { extractNodeArchive } from './extract'
import {
  archiveFileName,
  binDir,
  compareVersionsDesc,
  getDistTarget,
  isValidVersion,
  nodeBinary,
  npmCli,
  npmDir,
} from './platform'
import { parseShasums, sha256File } from './shasums'

interface IndexEntry extends RemoteNodeVersion {
  files: string[]
}

export interface ResolvedRuntime {
  version: string
  dir: string
  node: string
  npmCli: string
  bin: string
}

const REMOTE_CACHE_TTL = 10 * 60 * 1000

class RuntimeService extends EventEmitter<{ progress: [RuntimeInstallProgress] }> {
  private remoteCache: { mirror: string, at: number, list: RemoteNodeVersion[] } | null = null
  private installs = new Map<string, { controller: AbortController, progress: RuntimeInstallProgress }>()

  private mirror(): string {
    return settingsStore.get().network.nodeMirror.trim().replace(/\/+$/, '')
  }

  async listRemote(force = false): Promise<RemoteNodeVersion[]> {
    const mirror = this.mirror()
    const cache = this.remoteCache
    if (!force && cache && cache.mirror === mirror && Date.now() - cache.at < REMOTE_CACHE_TTL)
      return cache.list
    const target = getDistTarget()
    const index = await fetchJson<IndexEntry[]>(`${mirror}/index.json`)
    const list = index
      .filter(item => item.files.includes(target.indexKey))
      .map(({ version, date, lts, npm }) => ({ version, date, lts, npm }))
    this.remoteCache = { mirror, at: Date.now(), list }
    return list
  }

  async listInstalled(): Promise<InstalledRuntime[]> {
    if (!(await exists(paths.runtimes)))
      return []
    const names = (await readdir(paths.runtimes)).filter(isValidVersion)
    const result: InstalledRuntime[] = []
    for (const version of names.sort(compareVersionsDesc)) {
      const dir = join(paths.runtimes, version)
      if (this.installs.has(version) || !(await exists(nodeBinary(dir))))
        continue
      const npmPkg = await readJson<{ version?: string }>(join(npmDir(dir), 'package.json'), {})
      result.push({ version, dir, npmVersion: npmPkg.version ?? null })
    }
    return result
  }

  async resolve(version: string | null): Promise<ResolvedRuntime> {
    if (!version)
      throw new AppError('NO_NODE_VERSION')
    const dir = join(paths.runtimes, version)
    if (!isValidVersion(version) || this.installs.has(version) || !(await exists(nodeBinary(dir))))
      throw new AppError('RUNTIME_NOT_INSTALLED', undefined, { version })
    return { version, dir, node: nodeBinary(dir), npmCli: npmCli(dir), bin: binDir(dir) }
  }

  installing(): RuntimeInstallProgress[] {
    return [...this.installs.values()].map(item => item.progress)
  }

  /** Starts installing in the background; progress is reported through the `progress` event */
  install(version: string): void {
    if (!isValidVersion(version))
      throw new AppError('VERSION_NOT_FOUND', undefined, { version })
    if (this.installs.has(version))
      throw new AppError('RUNTIME_INSTALLING', undefined, { version })
    const controller = new AbortController()
    const progress: RuntimeInstallProgress = { version, phase: 'download', received: 0, total: 0 }
    this.installs.set(version, { controller, progress })
    this.report(progress)
    void this.doInstall(version, controller.signal, progress)
  }

  cancel(version: string): void {
    this.installs.get(version)?.controller.abort()
  }

  async remove(version: string): Promise<void> {
    if (!isValidVersion(version))
      throw new AppError('VERSION_NOT_FOUND', undefined, { version })
    await rm(join(paths.runtimes, version), { recursive: true, force: true })
  }

  private report(progress: RuntimeInstallProgress): void {
    this.emit('progress', { ...progress })
  }

  private async doInstall(version: string, signal: AbortSignal, progress: RuntimeInstallProgress): Promise<void> {
    const target = getDistTarget()
    const file = archiveFileName(version, target)
    const mirror = this.mirror()
    const archive = join(paths.temp, `${Date.now()}-${file}`)
    try {
      await downloadFile(`${mirror}/${version}/${file}`, archive, {
        signal,
        onProgress: (received, total) => {
          Object.assign(progress, { received, total })
          this.report(progress)
        },
      })

      progress.phase = 'verify'
      this.report(progress)
      const sums = parseShasums(await fetchText(`${mirror}/${version}/SHASUMS256.txt`, signal))
      const expected = sums.get(file)
      const actual = await sha256File(archive)
      if (!expected || expected !== actual)
        throw new AppError('CHECKSUM_MISMATCH', `Checksum mismatch for ${file}`, { file })

      progress.phase = 'extract'
      this.report(progress)
      await extractNodeArchive(archive, join(paths.runtimes, version), version, target)

      progress.phase = 'done'
    }
    catch (error) {
      progress.phase = signal.aborted ? 'canceled' : 'error'
      progress.error = error instanceof Error ? error.message : String(error)
    }
    finally {
      await rm(archive, { force: true })
      this.installs.delete(version)
      this.report(progress)
    }
  }
}

export const runtimeService = new RuntimeService()
