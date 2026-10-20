import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildProcessEnv } from './env'
import { archiveFileName, binDir, compareVersionsDesc, getDistTarget, isValidVersion, nodeBinary, npmCli } from './platform'
import { parseShasums } from './shasums'

describe('getDistTarget', () => {
  it('maps platform and arch to Node.js dist names', () => {
    expect(getDistTarget('win32', 'x64')).toEqual({ os: 'win', arch: 'x64', ext: 'zip', indexKey: 'win-x64-zip' })
    expect(getDistTarget('darwin', 'arm64')).toEqual({ os: 'darwin', arch: 'arm64', ext: 'tar.gz', indexKey: 'osx-arm64-tar' })
    expect(getDistTarget('linux', 'arm')).toEqual({ os: 'linux', arch: 'armv7l', ext: 'tar.gz', indexKey: 'linux-armv7l' })
    expect(getDistTarget('win32', 'ia32').arch).toBe('x86')
  })

  it('throws for unsupported targets', () => {
    expect(() => getDistTarget('aix', 'x64')).toThrow()
    expect(() => getDistTarget('linux', 'mips')).toThrow()
  })

  it('builds archive file names', () => {
    expect(archiveFileName('v22.11.0', getDistTarget('win32', 'x64'))).toBe('node-v22.11.0-win-x64.zip')
    expect(archiveFileName('v22.11.0', getDistTarget('darwin', 'x64'))).toBe('node-v22.11.0-darwin-x64.tar.gz')
  })
})

describe('runtime layout', () => {
  it('locates node, bin and npm per platform', () => {
    expect(nodeBinary('/r', 'win32')).toBe(join('/r', 'node.exe'))
    expect(nodeBinary('/r', 'linux')).toBe(join('/r', 'bin', 'node'))
    expect(binDir('/r', 'win32')).toBe('/r')
    expect(binDir('/r', 'darwin')).toBe(join('/r', 'bin'))
    expect(npmCli('/r', 'win32')).toBe(join('/r', 'node_modules', 'npm', 'bin', 'npm-cli.js'))
    expect(npmCli('/r', 'linux')).toBe(join('/r', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'))
  })
})

describe('versions', () => {
  it('validates and sorts versions', () => {
    expect(isValidVersion('v22.1.0')).toBe(true)
    expect(isValidVersion('22.1.0')).toBe(false)
    expect(isValidVersion('v22.1.0/../x')).toBe(false)
    expect(['v18.20.0', 'v22.1.0', 'v22.10.0', 'v20.5.1'].sort(compareVersionsDesc))
      .toEqual(['v22.10.0', 'v22.1.0', 'v20.5.1', 'v18.20.0'])
  })
})

describe('parseShasums', () => {
  it('parses text and binary mode lines', () => {
    const a = 'a'.repeat(64)
    const b = 'B'.repeat(64)
    const map = parseShasums(`${a}  node-v22.0.0-linux-x64.tar.gz\r\n${b} *node-v22.0.0-win-x64.zip\n\nnot a line\n`)
    expect(map.get('node-v22.0.0-linux-x64.tar.gz')).toBe(a)
    expect(map.get('node-v22.0.0-win-x64.zip')).toBe('b'.repeat(64))
    expect(map.size).toBe(2)
  })
})

describe('buildProcessEnv', () => {
  it('drops electron/npm vars, applies extras in order and prepends bin to PATH', () => {
    const env = buildProcessEnv(
      '/rt/bin',
      { PATH: '/usr/bin', HOME: '/home/u', ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--x', npm_config_prefix: '/p' },
      { A: '1', B: '1' },
      { B: '2' },
    )
    expect(env).toEqual({ PATH: `/rt/bin${delimiter}/usr/bin`, HOME: '/home/u', A: '1', B: '2' })
  })

  it('keeps the original casing of the PATH key', () => {
    expect(buildProcessEnv('C:\\rt', { Path: 'C:\\Windows' }).Path).toBe(`C:\\rt${delimiter}C:\\Windows`)
    expect(buildProcessEnv('/rt', {}).PATH).toBe('/rt')
  })
})
