import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

/** Parse a SHASUMS256.txt file into a filename -> sha256 map */
export function parseShasums(text: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    // Format: "<sha256>  <file>" (a leading `*` marks binary mode)
    const [hash, ...rest] = line.trim().split(/\s+/)
    const file = rest.join(' ').replace(/^\*/, '')
    if (hash && file && /^[a-f0-9]{64}$/i.test(hash))
      result.set(file, hash.toLowerCase())
  }
  return result
}

export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}
