import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import { npmScriptKey } from '@shared/types'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { runnerService } from './service'

const mocks = vi.hoisted(() => ({
  getSpace: vi.fn(),
  spawn: vi.fn(() => ({ onData: vi.fn(), onExit: vi.fn() })),
  resolveManager: vi.fn(async (manager: string) => ({ manager, command: manager, prefix: [], env: {} })),
  ensurePythonEnv: vi.fn(async () => ({ python: '/venv/bin/python', binDir: '/venv/bin', venvDir: '/venv', synced: true })),
  log: { write: vi.fn(), end: vi.fn() },
}))

vi.mock('node-pty', () => ({ spawn: mocks.spawn }))
vi.mock('../space', () => ({ spaceService: { get: mocks.getSpace }, assertProjectDir: vi.fn() }))
vi.mock('../runtime', () => ({ runtimeService: { resolve: vi.fn(async () => ({ node: '/runtime/node', bin: '/runtime', dir: '/runtime', version: 'v22.1.0' })) } }))
vi.mock('../python', () => ({
  pythonRuntimeService: { resolve: vi.fn(async () => ({ python: '/runtime/python', bin: '/runtime', version: '3.12.0' })) },
  ensurePythonEnv: mocks.ensurePythonEnv,
}))
vi.mock('../settings', () => ({ settingsStore: { get: () => DEFAULT_SETTINGS }, buildNetworkEnv: () => ({}) }))
vi.mock('./history', () => ({ historyStore: { begin: vi.fn(async () => mocks.log) } }))
vi.mock('../deps/pm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../deps/pm')>()
  return { ...actual, resolvePackageManager: mocks.resolveManager }
})

let root: string
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'sb-runner-project-'))
  await mkdir(join(root, 'web'))
  await writeFile(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10', scripts: { dev: 'root-command' } }))
  await writeFile(join(root, 'web', 'package.json'), JSON.stringify({ packageManager: 'yarn@4', scripts: { dev: 'child-command' } }))
  mocks.getSpace.mockResolvedValue({
    id: 'project',
    projectPath: root,
    nodeVersion: 'v22.1.0',
    scripts: {
      'npm:dev': { runConfig: { args: '--root', env: [{ key: 'SCOPE', value: 'root' }] } },
      [npmScriptKey('web', 'dev')]: { runConfig: { args: '--port 3000', env: [{ key: 'SCOPE', value: 'web' }] } },
    },
  })
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('nested npm script execution', () => {
  it('spawns root and child scripts in their own directories with isolated config and manager', async () => {
    const options = { cols: 80, rows: 24 }
    const rootRun = await runnerService.start('project', 'npm:dev', options)
    const childKey = npmScriptKey('web', 'dev')
    const childRun = await runnerService.start('project', childKey, options)
    expect(rootRun.script).toBe('npm:dev')
    expect(childRun.script).toBe(childKey)
    expect(mocks.spawn).toHaveBeenNthCalledWith(1, 'pnpm', ['run', 'dev', '--root'], expect.objectContaining({ cwd: root, env: expect.objectContaining({ SCOPE: 'root' }) }))
    expect(mocks.spawn).toHaveBeenNthCalledWith(2, 'yarn', ['run', 'dev', '--port', '3000'], expect.objectContaining({ cwd: join(root, 'web'), env: expect.objectContaining({ SCOPE: 'web' }) }))
    expect(rootRun.id).not.toBe(childRun.id)
  })

  it('does not spawn commands with invalid or stale keys', async () => {
    const count = mocks.spawn.mock.calls.length
    await expect(runnerService.start('project', npmScriptKey('../escape', 'dev'), { cols: 80, rows: 24 })).rejects.toMatchObject({ code: 'INVALID_SCRIPT_NAME' })
    await expect(runnerService.start('project', npmScriptKey('web', 'missing'), { cols: 80, rows: 24 })).rejects.toMatchObject({ code: 'SCRIPT_NOT_FOUND' })
    expect(mocks.spawn).toHaveBeenCalledTimes(count)
  })
})

describe('python script execution', () => {
  let pyRoot: string

  beforeAll(async () => {
    pyRoot = await mkdtemp(join(tmpdir(), 'sb-runner-python-'))
    await writeFile(join(pyRoot, 'hello.py'), 'print("hello")')
    mocks.getSpace.mockResolvedValue({
      id: 'pyspace',
      name: 'Python Space',
      description: '',
      projectPath: pyRoot,
      runtime: { kind: 'python', version: '3.12.0' },
      scripts: { 'hello.py': { runConfig: { args: '', env: [] } } },
    })
  })

  afterAll(async () => {
    await rm(pyRoot, { recursive: true, force: true })
  })

  it('runs preflight before spawn and records runtimeKind=python', async () => {
    mocks.ensurePythonEnv.mockResolvedValueOnce({ python: '/venv/bin/python', binDir: '/venv/bin', venvDir: '/venv', synced: true })
    const spawnCountBefore = mocks.spawn.mock.calls.length
    const record = await runnerService.start('pyspace', 'hello.py', { cols: 80, rows: 24 })
    expect(record.runtimeKind).toBe('python')
    expect(record.runtimeVersion).toBe('Python 3.12.0')
    expect(record.status).toBe('running')
    expect(mocks.ensurePythonEnv).toHaveBeenCalled()
    // spawn is called with the overridden python path from preflight
    expect(mocks.spawn).toHaveBeenCalledTimes(spawnCountBefore + 1)
    const lastSpawnCall = mocks.spawn.mock.calls.at(-1) as unknown as [string, string[]]
    expect(lastSpawnCall[0]).toBe('/venv/bin/python')
    expect(lastSpawnCall[1]).toEqual([expect.stringContaining('hello.py')])
  })

  it('does not spawn when preflight fails', async () => {
    mocks.ensurePythonEnv.mockRejectedValueOnce(new Error('venv creation failed'))
    const spawnCountBefore = mocks.spawn.mock.calls.length
    await expect(runnerService.start('pyspace', 'hello.py', { cols: 80, rows: 24 })).rejects.toThrow()
    // spawn should NOT be called when preflight fails
    expect(mocks.spawn).toHaveBeenCalledTimes(spawnCountBefore)
  })
})
