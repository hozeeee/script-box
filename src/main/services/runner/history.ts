import type { RunRecord } from '@shared/types'
import type { WriteStream } from 'node:fs'
import { createWriteStream } from 'node:fs'
import { open, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '@shared/errors'
import { historyPaths, ID_PATTERN, paths } from '../../paths'
import { ensureDir, exists, readJson, writeJson } from '../../utils/fs'
import { settingsStore } from '../settings'

const MAX_LOG_READ = 2 * 1024 * 1024

function assertRunId(runId: string): void {
  if (!ID_PATTERN.test(runId))
    throw new AppError('RUN_NOT_FOUND', undefined, { runId })
}

export const historyStore = {
  async begin(record: RunRecord): Promise<WriteStream> {
    await ensureDir(historyPaths.dir(record.spaceId))
    await writeJson(historyPaths.meta(record.spaceId, record.id), record)
    return createWriteStream(historyPaths.log(record.spaceId, record.id), { flags: 'a' })
  },

  async finish(record: RunRecord): Promise<void> {
    await writeJson(historyPaths.meta(record.spaceId, record.id), record)
    await this.prune(record.spaceId)
  },

  async list(spaceId: string): Promise<RunRecord[]> {
    const dir = historyPaths.dir(spaceId)
    if (!(await exists(dir)))
      return []
    const files = (await readdir(dir)).filter(file => file.endsWith('.json'))
    const records = await Promise.all(
      files.map(file => readJson<RunRecord | null>(join(dir, file), null)),
    )
    return records
      .filter((record): record is RunRecord => record !== null)
      .sort((a, b) => b.startedAt - a.startedAt)
  },

  /** Returns the tail of the log if it is very large */
  async readLog(spaceId: string, runId: string): Promise<string> {
    assertRunId(runId)
    const path = historyPaths.log(spaceId, runId)
    if (!(await exists(path)))
      return ''
    const handle = await open(path, 'r')
    try {
      const { size } = await handle.stat()
      const length = Math.min(size, MAX_LOG_READ)
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, size - length)
      return buffer.toString('utf8')
    }
    finally {
      await handle.close()
    }
  },

  async remove(spaceId: string, runId: string): Promise<void> {
    assertRunId(runId)
    await rm(historyPaths.meta(spaceId, runId), { force: true })
    await rm(historyPaths.log(spaceId, runId), { force: true })
  },

  async clear(spaceId: string): Promise<void> {
    const records = await this.list(spaceId)
    await Promise.all(records.filter(r => r.status !== 'running').map(r => this.remove(spaceId, r.id)))
  },

  /** Records left in `running` state by a crash or forced quit are marked as stopped */
  async recoverStale(): Promise<void> {
    if (!(await exists(paths.history)))
      return
    for (const spaceId of (await readdir(paths.history)).filter(id => ID_PATTERN.test(id))) {
      for (const record of await this.list(spaceId)) {
        if (record.status !== 'running')
          continue
        record.status = 'stopped'
        record.endedAt ??= record.startedAt
        await writeJson(historyPaths.meta(spaceId, record.id), record)
      }
    }
  },

  async prune(spaceId: string): Promise<void> {
    const limit = Math.max(1, settingsStore.get().run.historyLimit)
    const finished = (await this.list(spaceId)).filter(record => record.status !== 'running')
    await Promise.all(finished.slice(limit).map(record => this.remove(spaceId, record.id)))
  },
}
