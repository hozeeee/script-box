import type { ManualUpdateReason } from '@shared/types'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

export interface CachedUpdate {
  version: string
  path: string
  sha512: string
  platform: string
  arch: string
  manualReason?: ManualUpdateReason
}

export async function hashUpdate(path: string): Promise<string> {
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(path))
    hash.update(chunk)
  return hash.digest('base64')
}

/** 只恢复当前平台、架构的完整文件；不把陈旧记录或下载中的临时文件当作可安装包。 */
export async function validateCachedUpdate(value: unknown, isNewer: (version: string) => boolean): Promise<CachedUpdate | null> {
  if (!value || typeof value !== 'object')
    return null
  const record = value as Partial<CachedUpdate>
  if (typeof record.version !== 'string' || typeof record.path !== 'string' || !isAbsolute(record.path)
    || typeof record.sha512 !== 'string' || record.platform !== process.platform || record.arch !== process.arch
    || (record.manualReason !== undefined && record.manualReason !== 'mac-unsigned' && record.manualReason !== 'mac-signature')) {
    return null
  }
  try {
    if (!isNewer(record.version))
      return null
    const stat = await lstat(record.path)
    if (!stat.isFile() || await hashUpdate(record.path) !== record.sha512)
      return null
    return record as CachedUpdate
  }
  catch {
    return null
  }
}
