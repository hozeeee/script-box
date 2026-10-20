import type { NodeDistTarget } from './platform'
import { rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import extractZip from 'extract-zip'
import { extract as extractTar } from 'tar'
import { ensureDir } from '../../utils/fs'
import { archiveBaseName } from './platform'

/**
 * Extract a Node.js distribution archive so that `dest` directly contains
 * `bin/`, `lib/` (or `node.exe` on Windows).
 */
export async function extractNodeArchive(
  archive: string,
  dest: string,
  version: string,
  target: NodeDistTarget,
): Promise<void> {
  const staging = `${dest}.staging`
  await rm(staging, { recursive: true, force: true })
  await rm(dest, { recursive: true, force: true })
  await ensureDir(staging)
  try {
    if (target.ext === 'zip') {
      await extractZip(archive, { dir: staging })
      await rename(join(staging, archiveBaseName(version, target)), dest)
    }
    else {
      await extractTar({ file: archive, cwd: staging, strip: 1 })
      await rename(staging, dest)
    }
  }
  finally {
    await rm(staging, { recursive: true, force: true })
  }
}
