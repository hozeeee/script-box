import type { ManualUpdateReason } from '@shared/types'
import { execFile } from 'node:child_process'
import { dirname } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'

const execFileAsync = promisify(execFile)

export function macAppPath(): string {
  const bundle = dirname(dirname(dirname(app.getPath('exe'))))
  return bundle.endsWith('.app') ? bundle : '/Applications/Script Box.app'
}

/** 命令只展示给用户，不执行；单引号转义防止路径中的空格、引号或 $ 被 shell 解释。 */
export function quarantineCommand(path: string): string {
  return `xattr -r -d com.apple.quarantine '${path.replace(/'/g, `'\\''`)}'`
}

export function isMacSignatureError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /code signature|codesign|signature.*(?:validation|invalid)|签名|代码不含资源/i.test(message)
}

/** 临时签名或没有 Developer ID 身份的应用不能使用 Squirrel 的正式签名更新流程。 */
export async function detectMacManualReason(): Promise<ManualUpdateReason | undefined> {
  if (process.platform !== 'darwin')
    return undefined
  try {
    const { stderr } = await execFileAsync('/usr/bin/codesign', ['--display', '--verbose=4', macAppPath()], { timeout: 10_000 })
    if (!stderr.includes('Authority=Developer ID Application:') || !/TeamIdentifier=(?!not set)\S+/.test(stderr))
      return 'mac-unsigned'
    await execFileAsync('/usr/bin/codesign', ['--verify', '--deep', '--strict', macAppPath()], { timeout: 10_000 })
    return undefined
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return /not signed at all|adhoc/i.test(message) ? 'mac-unsigned' : 'mac-signature'
  }
}
