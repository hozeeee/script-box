import type { ConnectionTestResult, ProxySettings } from '@shared/types'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { AppError } from '@shared/errors'
import { net, session } from 'electron'
import { ensureDir } from '../../utils/fs'
import { toElectronProxyConfig } from '../settings'

/** Route all main-process traffic (downloads, auto update) through the configured proxy */
export async function applyProxy(proxy: ProxySettings): Promise<void> {
  await session.defaultSession.setProxy(toElectronProxyConfig(proxy))
  await session.defaultSession.closeAllConnections()
}

export async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const response = await net.fetch(url, { signal })
  if (!response.ok)
    throw new AppError('DOWNLOAD_FAILED', `${response.status} ${response.statusText}: ${url}`, { url, status: response.status })
  return response.text()
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  return JSON.parse(await fetchText(url, signal)) as T
}

export interface DownloadOptions {
  signal?: AbortSignal
  onProgress?: (received: number, total: number) => void
}

export async function downloadFile(url: string, dest: string, options: DownloadOptions = {}): Promise<void> {
  const response = await net.fetch(url, { signal: options.signal })
  if (!response.ok || !response.body)
    throw new AppError('DOWNLOAD_FAILED', `${response.status} ${response.statusText}: ${url}`, { url, status: response.status })

  const total = Number(response.headers.get('content-length') ?? 0)
  let received = 0
  let lastReport = 0
  const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length
      const now = Date.now()
      if (now - lastReport > 150) {
        lastReport = now
        options.onProgress?.(received, total)
      }
      callback(null, chunk)
    },
  })

  await ensureDir(dirname(dest))
  try {
    await pipeline(body, counter, createWriteStream(dest), { signal: options.signal })
    options.onProgress?.(received, total || received)
  }
  catch (error) {
    await rm(dest, { force: true })
    throw error
  }
}

export async function testConnection(url: string, timeout = 10_000): Promise<ConnectionTestResult> {
  const started = Date.now()
  try {
    const response = await net.fetch(url, { method: 'GET', signal: AbortSignal.timeout(timeout) })
    await response.body?.cancel()
    return { ok: response.ok, status: response.status, elapsed: Date.now() - started }
  }
  catch (error) {
    return {
      ok: false,
      elapsed: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
