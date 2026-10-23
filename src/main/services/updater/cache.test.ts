import type { CachedUpdate } from './cache'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hashUpdate, validateCachedUpdate } from './cache'

let root: string
let record: CachedUpdate
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'sb-update-cache-'))
  const path = join(root, 'update.zip')
  await writeFile(path, 'downloaded update')
  record = { path, version: '0.2.0', sha512: await hashUpdate(path), platform: process.platform, arch: process.arch }
})
afterAll(async () => {
  const { rm } = await import('node:fs/promises')
  await rm(root, { recursive: true, force: true })
})

const newer = (version: string): boolean => version === '0.2.0'

describe('更新缓存校验', () => {
  it('恢复完整包及保存的手动安装原因', async () => {
    const value = { ...record, manualReason: 'mac-signature' }
    expect(await validateCachedUpdate(value, newer)).toEqual(value)
  })

  it('拒绝不存在的文件、目录和内容被修改的文件', async () => {
    expect(await validateCachedUpdate({ ...record, path: join(root, 'missing.zip') }, newer)).toBeNull()
    await mkdir(join(root, 'directory'))
    expect(await validateCachedUpdate({ ...record, path: join(root, 'directory') }, newer)).toBeNull()
    const damaged = join(root, 'damaged.zip')
    await writeFile(damaged, 'different contents')
    expect(await validateCachedUpdate({ ...record, path: damaged }, newer)).toBeNull()
  })

  it('拒绝旧版本、其他架构和其他平台的记录', async () => {
    expect(await validateCachedUpdate({ ...record, version: '0.1.0' }, newer)).toBeNull()
    expect(await validateCachedUpdate({ ...record, arch: 'other' }, newer)).toBeNull()
    expect(await validateCachedUpdate({ ...record, platform: 'other' }, newer)).toBeNull()
  })

  it('拒绝格式错误的记录及相对路径', async () => {
    for (const value of [null, [], {}, { ...record, sha512: null }, { ...record, path: '../update.zip' }, { ...record, manualReason: 'other' }])
      expect(await validateCachedUpdate(value, newer)).toBeNull()
    expect(await validateCachedUpdate(record, () => {
      throw new Error('invalid version')
    })).toBeNull()
  })

  it.skipIf(process.platform === 'win32')('拒绝符号链接，避免缓存路径指向意外文件', async () => {
    const link = join(root, 'linked.zip')
    await symlink(record.path, link)
    expect(await validateCachedUpdate({ ...record, path: link }, newer)).toBeNull()
  })
})
