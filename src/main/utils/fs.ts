import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

export async function ensureDir(path: string): Promise<string> {
  await mkdir(path, { recursive: true })
  return path
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  }
  catch {
    return fallback
  }
}

/** Write through a temp file so a crash never leaves half-written JSON behind */
export async function writeJson(path: string, data: unknown): Promise<void> {
  await ensureDir(dirname(path))
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  await rename(temp, path)
}
