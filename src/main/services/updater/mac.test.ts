import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectMacManualReason, isMacSignatureError, macAppPath, quarantineCommand } from './mac'

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  executable: '/Applications/Script Box.app/Contents/MacOS/Script Box',
}))
vi.mock('node:child_process', () => {
  const execFile = vi.fn()
  // Node 的 execFile 带有自定义 promisify，返回 stdout/stderr 对象而不是单个字符串。
  Object.defineProperty(execFile, Symbol.for('nodejs.util.promisify.custom'), {
    value: async (command: string, args: string[], options: unknown) => ({ stdout: '', stderr: await mocks.execute(command, args, options) }),
  })
  return { execFile }
})
vi.mock('electron', () => ({ app: { getPath: () => mocks.executable } }))

beforeEach(() => {
  vi.stubGlobal('process', new Proxy(process, {
    get: (target, property) => property === 'platform' ? 'darwin' : Reflect.get(target, property),
  }))
  mocks.execute.mockReset()
  mocks.executable = '/Applications/Script Box.app/Contents/MacOS/Script Box'
})
afterEach(() => vi.unstubAllGlobals())

describe('mac 签名检测及安全指引', () => {
  it('未签名或 ad-hoc 签名应用使用手动安装', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('code object is not signed at all'))
    expect(await detectMacManualReason()).toBe('mac-unsigned')
    mocks.execute.mockResolvedValueOnce('Signature=adhoc\nTeamIdentifier=not set')
    expect(await detectMacManualReason()).toBe('mac-unsigned')
  })

  it('有效 Developer ID 签名继续使用原生安装', async () => {
    mocks.execute.mockResolvedValueOnce('Authority=Developer ID Application: Example\nTeamIdentifier=TEAM123')
    mocks.execute.mockResolvedValueOnce('')
    expect(await detectMacManualReason()).toBeUndefined()
    expect(mocks.execute).toHaveBeenLastCalledWith('/usr/bin/codesign', ['--verify', '--deep', '--strict', '/Applications/Script Box.app'], { timeout: 10_000 })
  })

  it('签名存在但资源校验失败时降级，并且不会执行解除隔离命令', async () => {
    mocks.execute.mockResolvedValueOnce('Authority=Developer ID Application: Example\nTeamIdentifier=TEAM123')
    mocks.execute.mockRejectedValueOnce(new Error('code has no resources but signature indicates they must be present'))
    expect(await detectMacManualReason()).toBe('mac-signature')
    expect(mocks.execute.mock.calls.every(([command]) => command === '/usr/bin/codesign')).toBe(true)
  })

  it('识别原生签名错误，但不把网络错误当成签名问题', () => {
    expect(isMacSignatureError(new Error('Code signature at URL did not pass validation'))).toBe(true)
    expect(isMacSignatureError(new Error('代码不含资源，但签名指示这些资源必须存在'))).toBe(true)
    expect(isMacSignatureError(new Error('HttpError: 406'))).toBe(false)
  })

  it('从可执行路径解析应用路径，命令正确转义空格、单引号和 shell 插值', () => {
    expect(macAppPath()).toBe('/Applications/Script Box.app')
    expect(quarantineCommand('/Applications/Script Box.app')).toBe('xattr -r -d com.apple.quarantine \'/Applications/Script Box.app\'')
    expect(quarantineCommand('/Applications/Fan\'s $(touch bad).app')).toBe('xattr -r -d com.apple.quarantine \'/Applications/Fan\'\\\'\'s $(touch bad).app\'')
  })
})
