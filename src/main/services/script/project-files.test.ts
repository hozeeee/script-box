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
  it('shows all file types, hidden files and empty directories; filters ignored dirs', async () => {
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
    const names = entries.map(entry => entry.name)
    // node_modules is in IGNORED_DIRS and should be filtered out
    expect(names).toEqual(expect.arrayContaining(['empty', 'package.json', '.env', '.gitignore', 'index.ts', 'index.d.ts', 'image.png']))
    expect(names).not.toContain('node_modules')
    expect(entries.find(entry => entry.name === 'index.ts')?.script?.language).toBe('typescript')
    expect(entries.find(entry => entry.name === 'index.d.ts')?.script).toBeUndefined()
    expect(entries.find(entry => entry.name === 'package.json')?.script).toBeUndefined()
    expect(await listProjectEntries(root, 'empty')).toEqual([])
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

  it('filters script field by runtime kind', async () => {
    const root = await fixture()
    await writeFile(join(root, 'index.ts'), 'console.log(1)')
    await writeFile(join(root, 'main.py'), 'print(1)')
    const nodeEntries = await listProjectEntries(root, '', 'node')
    expect(nodeEntries.find(e => e.name === 'index.ts')?.script?.language).toBe('typescript')
    expect(nodeEntries.find(e => e.name === 'main.py')?.script).toBeUndefined()
    const pyEntries = await listProjectEntries(root, '', 'python')
    expect(pyEntries.find(e => e.name === 'main.py')?.script?.language).toBe('python')
    expect(pyEntries.find(e => e.name === 'index.ts')?.script).toBeUndefined()
  })

  it('filters Python environment directories', async () => {
    const root = await fixture()
    await mkdir(join(root, '.venv'))
    await mkdir(join(root, '__pycache__'))
    await mkdir(join(root, '.pytest_cache'))
    await mkdir(join(root, 'src'))
    const entries = await listProjectEntries(root)
    const names = entries.map(e => e.name)
    expect(names).toContain('src')
    expect(names).not.toContain('.venv')
    expect(names).not.toContain('__pycache__')
    expect(names).not.toContain('.pytest_cache')
  })
})
