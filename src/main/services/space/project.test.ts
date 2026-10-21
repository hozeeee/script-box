import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { npmScriptKey } from '@shared/types'
import { afterEach, describe, expect, it } from 'vitest'
import { detectPackageManager, parseNodeVersionHint, parsePackageManagerField, readProjectInfo, resolveProjectScript, scanProjectScripts } from './project'

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

describe('nested project scripts', () => {
  it('finds nested and ignored local packages, inherits nearest manager, excludes dependencies', async () => {
    const root = await fixture({ packageManager: 'pnpm@10', scripts: { dev: 'root-command' } })
    const packages = {
      'packages/web': { scripts: { dev: 'web-command' } },
      'packages/server': { packageManager: 'yarn@4', scripts: { dev: 'server-command' } },
      'local': { scripts: { 'check:lint': 'lint' } },
      'node_modules/dep': { scripts: { dev: 'dependency-command' } },
    }
    for (const [directory, pkg] of Object.entries(packages)) {
      await mkdir(join(root, directory), { recursive: true })
      await writeFile(join(root, directory, 'package.json'), JSON.stringify(pkg))
    }
    await writeFile(join(root, '.gitignore'), 'local/\n')
    const result = await scanProjectScripts(root)
    expect(result.scriptsTruncated).toBe(false)
    expect(result.scriptGroups.map(group => [group.directory, group.packageManager])).toEqual([
      ['', 'pnpm'],
      ['local', 'pnpm'],
      ['packages/server', 'yarn'],
      ['packages/web', 'pnpm'],
    ])
    expect(await resolveProjectScript(root, npmScriptKey('packages/web', 'dev'))).toEqual({ cwd: join(root, 'packages/web'), name: 'dev', packageManager: 'pnpm' })
    expect(await resolveProjectScript(root, 'npm:dev')).toEqual({ cwd: root, name: 'dev', packageManager: 'pnpm' })
    await writeFile(join(root, 'packages/web', 'package-lock.json'), '{}')
    expect((await resolveProjectScript(root, npmScriptKey('packages/web', 'dev'))).packageManager).toBe('npm')
  })

  it('rejects missing scripts, traversal and linked external packages', async () => {
    const root = await fixture({ scripts: { dev: 'root-command' } })
    const outside = await fixture({ scripts: { dev: 'outside-command' } })
    await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    expect((await scanProjectScripts(root)).scriptGroups).toHaveLength(1)
    await expect(resolveProjectScript(root, 'npm:missing')).rejects.toMatchObject({ code: 'SCRIPT_NOT_FOUND' })
    await expect(resolveProjectScript(root, npmScriptKey('../outside', 'dev'))).rejects.toMatchObject({ code: 'INVALID_SCRIPT_NAME' })
    await expect(resolveProjectScript(root, npmScriptKey('linked', 'dev'))).rejects.toMatchObject({ code: 'INVALID_SCRIPT_NAME' })
  })

  it('finds commands even when the root has no scripts', async () => {
    const root = await fixture()
    await mkdir(join(root, 'web'))
    await writeFile(join(root, 'web', 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
    expect((await scanProjectScripts(root)).scriptGroups.map(group => group.directory)).toEqual(['web'])
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
