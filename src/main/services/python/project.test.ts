import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { inspectPythonProject } from './project'

const roots: string[] = []
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sb-pyproject-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('python project detection', () => {
  it('detects python version from .python-version file', async () => {
    const root = await fixture()
    await writeFile(join(root, '.python-version'), '3.12.5\n')
    const info = await inspectPythonProject(root)
    expect(info.pythonVersionHint).toBe('3.12.5')
    expect(info.pythonVersionSource).toBe('.python-version')
  })

  it('detects python version from .tool-versions (asdf)', async () => {
    const root = await fixture()
    await writeFile(join(root, '.tool-versions'), 'python 3.11.8\n')
    const info = await inspectPythonProject(root)
    expect(info.pythonVersionHint).toBe('3.11.8')
    expect(info.pythonVersionSource).toBe('.tool-versions')
  })

  it('prefers .python-version over requires-python in pyproject.toml', async () => {
    const root = await fixture()
    await writeFile(join(root, '.python-version'), '3.13.0\n')
    await writeFile(join(root, 'pyproject.toml'), `[project]\nname = "demo"\nrequires-python = ">=3.12"\n`)
    const info = await inspectPythonProject(root)
    expect(info.pythonVersionHint).toBe('3.13.0')
    expect(info.pythonVersionSource).toBe('.python-version')
    expect(info.name).toBe('demo')
  })

  it('reads requires-python when no pin file exists', async () => {
    const root = await fixture()
    await writeFile(join(root, 'pyproject.toml'), `[project]\nname = "myapp"\nrequires-python = ">=3.11"\n`)
    const info = await inspectPythonProject(root)
    expect(info.pythonVersionHint).toBe('>=3.11')
    expect(info.pythonVersionSource).toBe('requires-python')
    expect(info.name).toBe('myapp')
  })

  it('detects uv manager from uv.lock', async () => {
    const root = await fixture()
    await writeFile(join(root, 'uv.lock'), '')
    const info = await inspectPythonProject(root)
    expect(info.manager).toBe('uv')
    expect(info.managerCandidates).toEqual(['uv'])
  })

  it('detects poetry manager from poetry.lock', async () => {
    const root = await fixture()
    await writeFile(join(root, 'poetry.lock'), '')
    const info = await inspectPythonProject(root)
    expect(info.manager).toBe('poetry')
    expect(info.managerCandidates).toEqual(['poetry'])
  })

  it('detects pdm manager from pdm.lock', async () => {
    const root = await fixture()
    await writeFile(join(root, 'pdm.lock'), '')
    const info = await inspectPythonProject(root)
    expect(info.manager).toBe('pdm')
    expect(info.managerCandidates).toEqual(['pdm'])
  })

  it('detects requirements manager from requirements.txt', async () => {
    const root = await fixture()
    await writeFile(join(root, 'requirements.txt'), 'flask==3.0\n')
    const info = await inspectPythonProject(root)
    expect(info.manager).toBe('requirements')
    expect(info.managerCandidates).toEqual(['requirements'])
  })

  it('detects pep517 from pyproject.toml without lockfiles or requirements', async () => {
    const root = await fixture()
    await writeFile(join(root, 'pyproject.toml'), `[project]\nname = "lib"\n`)
    const info = await inspectPythonProject(root)
    expect(info.manager).toBe('pep517')
    expect(info.managerCandidates).toEqual(['pep517'])
  })

  it('detects manager from tool section in pyproject.toml', async () => {
    const root = await fixture()
    await writeFile(join(root, 'pyproject.toml'), `[project]\nname = "x"\n\n[tool.uv]\ndev-dependencies = []\n`)
    const info = await inspectPythonProject(root)
    expect(info.manager).toBe('uv')
  })

  it('lists multiple conflicting managers as candidates', async () => {
    const root = await fixture()
    await writeFile(join(root, 'uv.lock'), '')
    await writeFile(join(root, 'poetry.lock'), '')
    const info = await inspectPythonProject(root)
    expect(info.managerCandidates).toEqual(['uv', 'poetry'])
    // First candidate is chosen as manager
    expect(info.manager).toBe('uv')
  })

  it('returns none for empty directory', async () => {
    const root = await fixture()
    const info = await inspectPythonProject(root)
    expect(info.manager).toBe('none')
    expect(info.managerCandidates).toEqual([])
    expect(info.pythonVersionHint).toBeNull()
    expect(info.name).toBeNull()
  })

  it('strips cpython- prefix from .python-version', async () => {
    const root = await fixture()
    await writeFile(join(root, '.python-version'), 'cpython-3.12.0\n')
    const info = await inspectPythonProject(root)
    expect(info.pythonVersionHint).toBe('3.12.0')
  })
})
