import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectPackageManager, parseNodeVersionHint, parsePackageManagerField, readProjectInfo } from './project'

const roots: string[] = []

async function fixture(pkg: object = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sb-project-'))
  roots.push(root)
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg))
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('project package manager', () => {
  it('prefers packageManager over lockfiles', async () => {
    const root = await fixture({ packageManager: 'yarn@4.6.0' })
    await writeFile(join(root, 'pnpm-lock.yaml'), '')
    expect(await detectPackageManager(root)).toBe('yarn')
  })

  it('uses lockfile priority and defaults to npm', async () => {
    const pnpm = await fixture()
    await writeFile(join(pnpm, 'package-lock.json'), '{}')
    await writeFile(join(pnpm, 'pnpm-lock.yaml'), '')
    expect(await detectPackageManager(pnpm)).toBe('pnpm')
    expect(await detectPackageManager(await fixture())).toBe('npm')
  })

  it('parses supported packageManager fields', () => {
    expect(parsePackageManagerField(' pnpm@10.0.0+sha512.x ')).toBe('pnpm')
    expect(parsePackageManagerField('deno@2')).toBeNull()
    expect(parsePackageManagerField(null)).toBeNull()
  })
})

describe('project info', () => {
  it('normalizes node version hints', () => {
    expect(parseNodeVersionHint('v22.11.0')).toBe('v22.11.0')
    expect(parseNodeVersionHint('>=20.10')).toBe('20')
    expect(parseNodeVersionHint('lts/*')).toBeNull()
  })

  it('reads scripts, package name, pnp and the highest-priority node hint', async () => {
    const root = await fixture({ name: 'demo', scripts: { dev: 'vite', bad: 1 }, engines: { node: '>=18' } })
    await writeFile(join(root, '.nvmrc'), 'v22.2.0\n')
    await writeFile(join(root, '.node-version'), '20\n')
    await writeFile(join(root, '.pnp.cjs'), '')
    await mkdir(join(root, 'src'))
    expect(await readProjectInfo(root)).toEqual({
      packageManager: 'npm',
      scripts: { dev: 'vite' },
      nodeVersionHint: 'v22.2.0',
      packageName: 'demo',
      pnp: true,
    })
  })
})
