import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listProjectEntries, resolveProjectDirectory, resolveProjectEntry } from './project-files'

const roots: string[] = []
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sb-files-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('project files', () => {
  it('shows all file types, ignored files, hidden files and empty directories', async () => {
    const root = await fixture()
    await mkdir(join(root, 'empty'))
    await mkdir(join(root, 'node_modules'))
    await writeFile(join(root, 'package.json'), '{}')
    await writeFile(join(root, '.env'), 'A=1')
    await writeFile(join(root, '.gitignore'), '.env\nnode_modules/\n')
    await writeFile(join(root, 'index.ts'), 'console.log(1)')
    await writeFile(join(root, 'index.d.ts'), 'declare const x: number')
    await writeFile(join(root, 'image.png'), new Uint8Array([1, 2, 3]))
    await writeFile(join(root, 'node_modules', 'example.js'), '')
    const entries = await listProjectEntries(root)
    expect(entries.map(entry => entry.name)).toEqual(expect.arrayContaining(['empty', 'node_modules', 'package.json', '.env', '.gitignore', 'index.ts', 'index.d.ts', 'image.png']))
    expect(entries.find(entry => entry.name === 'index.ts')?.script?.language).toBe('typescript')
    expect(entries.find(entry => entry.name === 'index.d.ts')?.script).toBeUndefined()
    expect(entries.find(entry => entry.name === 'package.json')?.script).toBeUndefined()
    expect(await listProjectEntries(root, 'empty')).toEqual([])
    expect((await listProjectEntries(root, 'node_modules')).map(entry => entry.name)).toEqual(['node_modules/example.js'])
  })

  it('lists symlinks for reveal without following them or allowing parent escapes', async () => {
    const root = await fixture()
    const outside = await fixture()
    await writeFile(join(outside, 'file.ts'), '')
    await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    expect(await listProjectEntries(root)).toEqual([{ name: 'linked', kind: 'symlink' }])
    expect(await resolveProjectEntry(root, 'linked')).toBe(join(root, 'linked'))
    await expect(listProjectEntries(root, 'linked')).rejects.toMatchObject({ code: 'INVALID_SCRIPT_NAME' })
    await expect(resolveProjectEntry(root, 'linked/file.ts')).rejects.toMatchObject({ code: 'INVALID_SCRIPT_NAME' })
  })

  it('rejects traversal and absolute paths for directory and reveal operations', async () => {
    const root = await fixture()
    for (const path of ['../x', 'src/../x', '/absolute', 'C:\\absolute', 'src\\x', 'a//b']) {
      await expect(resolveProjectDirectory(root, path)).rejects.toMatchObject({ code: 'INVALID_SCRIPT_NAME' })
      await expect(resolveProjectEntry(root, path)).rejects.toMatchObject({ code: 'INVALID_SCRIPT_NAME' })
    }
  })
})
