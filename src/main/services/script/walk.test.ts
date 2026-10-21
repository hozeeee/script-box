import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { walkProject } from './walk'

const roots: string[] = []

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'sb-walk-'))
  roots.push(path)
  return path
}

async function put(root: string, name: string): Promise<void> {
  const path = join(root, name)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, '')
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('walkProject', () => {
  it('applies fixed ignores, .gitignore, filters and does not follow symlinks', async () => {
    const path = await root()
    await put(path, 'src/index.ts')
    await put(path, 'src/readme.md')
    await put(path, 'generated/skip.ts')
    await put(path, 'node_modules/pkg/index.ts')
    await put(path, 'outside.ts')
    await writeFile(join(path, '.gitignore'), 'generated/\noutside.ts\n')
    await symlink(join(path, 'src'), join(path, 'linked'))

    expect(await walkProject(path, { accept: name => name.endsWith('.ts') })).toEqual({
      files: ['src/index.ts'],
      truncated: false,
    })
  })

  it('can scan ignored local packages and truncates directory-only walks', async () => {
    const path = await root()
    await put(path, 'local/package.json')
    await writeFile(join(path, '.gitignore'), 'local/\n')
    expect((await walkProject(path, { accept: name => name.endsWith('package.json'), respectGitignore: false })).files).toEqual(['local/package.json'])
    expect((await walkProject(path, { accept: () => false, maxDirectories: 1, respectGitignore: false })).truncated).toBe(true)
  })

  it('marks file and depth limits as truncated', async () => {
    const path = await root()
    await put(path, 'a.ts')
    await put(path, 'b.ts')
    await put(path, 'nested/deep.ts')
    expect(await walkProject(path, { accept: () => true, maxFiles: 1 })).toEqual({ files: ['a.ts'], truncated: true })
    expect(await walkProject(path, { accept: () => true, maxDepth: 0 })).toEqual({ files: ['a.ts', 'b.ts'], truncated: true })
  })
})
