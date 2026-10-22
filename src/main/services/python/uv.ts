import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, readFile, rename, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { AppError } from '@shared/errors'
import extractZip from 'extract-zip'
import { extract as extractTar } from 'tar'
import { paths } from '../../paths'
import { ensureDir, exists } from '../../utils/fs'
import { downloadFile, fetchText } from '../network'
import { buildNetworkEnv, settingsStore } from '../settings'

export const UV_VERSION = '0.13.5'
export const POETRY_VERSION = '2.5.1'
export const PDM_VERSION = '2.29.2'

interface UvTarget {
  triple: string
  ext: 'zip' | 'tar.gz'
}

function target(): UvTarget {
  const key = `${process.platform}-${process.arch}`
  const targets: Record<string, UvTarget> = {
    'win32-x64': { triple: 'x86_64-pc-windows-msvc', ext: 'zip' },
    'linux-x64': { triple: 'x86_64-unknown-linux-gnu', ext: 'tar.gz' },
    'darwin-x64': { triple: 'x86_64-apple-darwin', ext: 'tar.gz' },
    'darwin-arm64': { triple: 'aarch64-apple-darwin', ext: 'tar.gz' },
  }
  const value = targets[key]
  if (!value)
    throw new AppError('PYTHON_VERSION_UNSUPPORTED', `Unsupported platform: ${key}`, { platform: key })
  return value
}

function uvBinary(): string {
  return join(paths.uv, process.platform === 'win32' ? 'uv.exe' : 'uv')
}

function uvEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...buildNetworkEnv(settingsStore.get().network),
    UV_PYTHON_INSTALL_DIR: paths.pythonRuntimes,
    UV_CACHE_DIR: paths.uvCache,
    UV_TOOL_DIR: paths.pythonTools,
    UV_TOOL_BIN_DIR: join(paths.pythonTools, 'bin'),
    UV_NO_PROGRESS: '1',
    ...extra,
  }
}

export interface UvRunOptions {
  cwd?: string
  env?: Record<string, string>
  signal?: AbortSignal
  onData?: (data: string) => void
}

class UvService {
  private bootstrap: Promise<string> | null = null

  async ensure(): Promise<string> {
    const binary = uvBinary()
    if (await exists(binary))
      return binary
    this.bootstrap ??= this.install().finally(() => {
      this.bootstrap = null
    })
    return this.bootstrap
  }

  async run(args: string[], options: UvRunOptions = {}): Promise<{ stdout: string, stderr: string }> {
    const command = await this.ensure()
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: uvEnv(options.env),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      const abort = (): void => {
        child.kill()
      }
      options.signal?.addEventListener('abort', abort, { once: true })
      child.stdout.on('data', (chunk: Buffer) => {
        const data = chunk.toString()
        stdout += data
        options.onData?.(data)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        const data = chunk.toString()
        stderr += data
        options.onData?.(data)
      })
      child.on('error', reject)
      child.on('exit', (code) => {
        options.signal?.removeEventListener('abort', abort)
        if (options.signal?.aborted)
          reject(new DOMException('Aborted', 'AbortError'))
        else if (code === 0)
          resolve({ stdout, stderr })
        else
          reject(new AppError('PYTHON_TOOL_FAILED', stderr.trim() || `uv exited with code ${code}`, { code: code ?? -1 }))
      })
    })
  }

  commandEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
    return uvEnv(extra)
  }

  private async install(): Promise<string> {
    const dist = target()
    const file = `uv-${dist.triple}.${dist.ext}`
    const base = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}`
    const archive = join(paths.temp, `${Date.now()}-${file}`)
    const staging = `${paths.uv}.staging`
    try {
      await downloadFile(`${base}/${file}`, archive)
      const checksumText = await fetchText(`${base}/${file}.sha256`)
      const expected = checksumText.trim().split(/\s+/)[0]?.toLowerCase()
      const actual = createHash('sha256').update(await readFile(archive)).digest('hex')
      if (!expected || expected !== actual)
        throw new AppError('CHECKSUM_MISMATCH', `Checksum mismatch for ${file}`, { file })
      await rm(staging, { recursive: true, force: true })
      await ensureDir(staging)
      if (dist.ext === 'zip')
        await extractZip(archive, { dir: staging })
      else
        await extractTar({ file: archive, cwd: staging, strip: 1 })
      if (dist.ext === 'zip') {
        const nested = join(staging, basename(file, '.zip'), 'uv.exe')
        if (await exists(nested))
          await rename(nested, join(staging, 'uv.exe'))
      }
      await rm(paths.uv, { recursive: true, force: true })
      await ensureDir(join(paths.uv, '..'))
      await rename(staging, paths.uv)
      if (process.platform !== 'win32')
        await chmod(uvBinary(), 0o755)
      return uvBinary()
    }
    finally {
      await rm(archive, { force: true })
      await rm(staging, { recursive: true, force: true })
    }
  }
}

export const uvService = new UvService()
