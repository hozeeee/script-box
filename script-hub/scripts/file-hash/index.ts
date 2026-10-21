import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { runCli } from '../../shared/cli'
import manifest from './script.json'

void runCli(manifest, async ({ values, positionals }) => {
  if (positionals.length === 0)
    throw new Error('请提供至少一个文件路径')
  const algorithm = String(values.algorithm).toLowerCase()
  if (!['sha256', 'sha512', 'md5'].includes(algorithm))
    throw new Error('--algorithm 只支持 sha256、sha512 或 md5')
  for (const file of positionals) {
    const hash = createHash(algorithm)
    for await (const chunk of createReadStream(file))
      hash.update(chunk)
    console.log(`${hash.digest('hex')}  ${file}`)
  }
})
