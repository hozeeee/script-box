import { join } from 'node:path'

export interface NodeDistTarget {
  os: 'win' | 'darwin' | 'linux'
  arch: string
  ext: 'zip' | 'tar.gz'
  /** Key used in the `files` field of the mirror's index.json */
  indexKey: string
}

const ARCH_MAP: Record<string, string> = {
  x64: 'x64',
  arm64: 'arm64',
  ia32: 'x86',
  arm: 'armv7l',
  ppc64: 'ppc64le',
  s390x: 's390x',
}

export function getDistTarget(platform: string = process.platform, arch: string = process.arch): NodeDistTarget {
  const distArch = ARCH_MAP[arch]
  if (!distArch)
    throw new Error(`Unsupported architecture: ${arch}`)
  switch (platform) {
    case 'win32':
      return { os: 'win', arch: distArch, ext: 'zip', indexKey: `win-${distArch}-zip` }
    case 'darwin':
      return { os: 'darwin', arch: distArch, ext: 'tar.gz', indexKey: `osx-${distArch}-tar` }
    case 'linux':
      return { os: 'linux', arch: distArch, ext: 'tar.gz', indexKey: `linux-${distArch}` }
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

export function archiveBaseName(version: string, target: NodeDistTarget): string {
  return `node-${version}-${target.os}-${target.arch}`
}

export function archiveFileName(version: string, target: NodeDistTarget): string {
  return `${archiveBaseName(version, target)}.${target.ext}`
}

export function nodeBinary(dir: string, platform: string = process.platform): string {
  return platform === 'win32' ? join(dir, 'node.exe') : join(dir, 'bin', 'node')
}

export function binDir(dir: string, platform: string = process.platform): string {
  return platform === 'win32' ? dir : join(dir, 'bin')
}

export function npmDir(dir: string, platform: string = process.platform): string {
  return platform === 'win32'
    ? join(dir, 'node_modules', 'npm')
    : join(dir, 'lib', 'node_modules', 'npm')
}

export function npmCli(dir: string, platform: string = process.platform): string {
  return join(npmDir(dir, platform), 'bin', 'npm-cli.js')
}

export const VERSION_PATTERN = /^v\d+\.\d+\.\d+$/

export function isValidVersion(version: string): boolean {
  return VERSION_PATTERN.test(version)
}

export function majorOf(version: string): number {
  return Number.parseInt(version.replace(/^v/, ''), 10)
}

/** Sort comparator: newest version first */
export function compareVersionsDesc(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (diff !== 0)
      return diff
  }
  return 0
}
