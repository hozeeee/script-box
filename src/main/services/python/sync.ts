import type { PythonDependencyManager, Space } from '@shared/types'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '@shared/errors'
import { spacePaths, spaceWorkDir } from '../../paths'
import { ensureDir, exists, readJson, writeJson } from '../../utils/fs'
import { pythonRuntimeService } from './runtime'
import { PDM_VERSION, POETRY_VERSION, uvService } from './uv'

interface SyncFingerprint {
  pythonVersion: string
  manager: PythonDependencyManager
  /** Hash of lock / requirements / pyproject content */
  depsHash: string
}

interface SyncState {
  fingerprint: SyncFingerprint | null
}

/** Compute a content-based hash of the dependency specification files */
async function depsHash(workDir: string, manager: PythonDependencyManager): Promise<string> {
  const hash = createHash('sha256')
  const tryHash = async (file: string): Promise<void> => {
    try {
      hash.update(await readFile(join(workDir, file), 'utf8'))
      hash.update(file)
    }
    catch { /* file not present */ }
  }
  switch (manager) {
    case 'uv':
      await tryHash('pyproject.toml')
      await tryHash('uv.lock')
      break
    case 'poetry':
      await tryHash('pyproject.toml')
      await tryHash('poetry.lock')
      break
    case 'pdm':
      await tryHash('pyproject.toml')
      await tryHash('pdm.lock')
      break
    case 'requirements':
      await tryHash('requirements.txt')
      await tryHash('requirements-dev.txt')
      break
    case 'pep517':
      await tryHash('pyproject.toml')
      break
    case 'none':
      break
  }
  return hash.digest('hex')
}

async function venvPython(venvDir: string): Promise<string> {
  return process.platform === 'win32'
    ? join(venvDir, 'Scripts', 'python.exe')
    : join(venvDir, 'bin', 'python')
}

async function ensureVenv(space: Space, pythonVersion: string, onData?: (data: string) => void): Promise<string> {
  const venvDir = spacePaths.pythonVenv(space.id)
  const python = await venvPython(venvDir)
  if (await exists(python))
    return venvDir

  // Resolve managed interpreter
  const runtime = await pythonRuntimeService.resolve(pythonVersion)
  await ensureDir(venvDir)
  await uvService.run(['venv', '--python', runtime.python, venvDir], { onData })
  if (!(await exists(python)))
    throw new AppError('PYTHON_DEPS_FAILED', `venv creation failed for ${pythonVersion}`)
  return venvDir
}

/** Ensure Poetry is installed in the tools directory */
async function ensurePoetry(onData?: (data: string) => void): Promise<void> {
  await uvService.run(['tool', 'install', `poetry==${POETRY_VERSION}`], { onData })
}

/** Ensure PDM is installed in the tools directory */
async function ensurePdm(onData?: (data: string) => void): Promise<void> {
  await uvService.run(['tool', 'install', `pdm==${PDM_VERSION}`], { onData })
}

async function syncDeps(
  space: Space,
  venvDir: string,
  manager: PythonDependencyManager,
  onData?: (data: string) => void,
): Promise<void> {
  const workDir = spaceWorkDir(space)
  const python = await venvPython(venvDir)
  const opts = { cwd: workDir, onData }

  switch (manager) {
    case 'uv': {
      // Use frozen install if uv.lock exists, otherwise regular sync
      const hasLock = await exists(join(workDir, 'uv.lock'))
      const args = hasLock
        ? ['sync', '--frozen', '--python', python]
        : ['sync', '--python', python]
      await uvService.run(args, opts)
      break
    }
    case 'poetry': {
      await ensurePoetry(onData)
      const hasLock = await exists(join(workDir, 'poetry.lock'))
      // Force Poetry to use our venv
      const poetryEnv = { VIRTUAL_ENV: venvDir }
      const installArgs = hasLock
        ? ['run', 'poetry', 'install', '--no-interaction']
        : ['run', 'poetry', 'install', '--no-interaction']
      await uvService.run(['tool', ...installArgs], { ...opts, env: poetryEnv })
      break
    }
    case 'pdm': {
      await ensurePdm(onData)
      const hasLock = await exists(join(workDir, 'pdm.lock'))
      const pdmEnv = { VIRTUAL_ENV: venvDir, PDM_IGNORE_ACTIVE_VENV: '0' }
      const installArgs = hasLock
        ? ['run', 'pdm', 'install', '--frozen-lockfile', '--no-self']
        : ['run', 'pdm', 'install', '--no-self']
      await uvService.run(['tool', ...installArgs], { ...opts, env: pdmEnv })
      break
    }
    case 'requirements': {
      // Use uv pip for requirements.txt
      const reqFile = join(workDir, 'requirements.txt')
      if (await exists(reqFile))
        await uvService.run(['pip', 'install', '--python', python, '-r', reqFile], opts)
      const reqDev = join(workDir, 'requirements-dev.txt')
      if (await exists(reqDev))
        await uvService.run(['pip', 'install', '--python', python, '-r', reqDev], opts)
      break
    }
    case 'pep517': {
      // Install project itself via PEP 517
      const pyprojectPath = join(workDir, 'pyproject.toml')
      if (await exists(pyprojectPath)) {
        try {
          await uvService.run(['pip', 'install', '--python', python, '-e', '.'], opts)
        }
        catch {
          // Fallback to non-editable if editable install fails
          await uvService.run(['pip', 'install', '--python', python, '.'], opts)
        }
      }
      break
    }
    case 'none':
      // No dependencies to install
      break
  }
}

export interface PythonSyncResult {
  venvDir: string
  python: string
  binDir: string
  synced: boolean
}

/**
 * Ensure venv exists and dependencies are synced for the given space.
 * Returns the resolved venv Python path and bin directory.
 * Skips dependency sync if the fingerprint hasn't changed.
 */
export async function ensurePythonEnv(
  space: Space,
  onData?: (data: string) => void,
): Promise<PythonSyncResult> {
  const version = space.runtime?.version
  if (!version)
    throw new AppError('NO_PYTHON_VERSION')

  const manager = space.pythonManager ?? 'none'
  const syncPath = spacePaths.pythonSync(space.id)
  const state = await readJson<SyncState>(syncPath, { fingerprint: null })

  // 1. Ensure venv
  const venvDir = await ensureVenv(space, version, onData)
  const python = await venvPython(venvDir)
  const binDir = process.platform === 'win32'
    ? join(venvDir, 'Scripts')
    : join(venvDir, 'bin')

  if (manager === 'none')
    return { venvDir, python, binDir, synced: false }

  // 2. Compute fingerprint
  const workDir = spaceWorkDir(space)
  const currentFingerprint: SyncFingerprint = {
    pythonVersion: version,
    manager,
    depsHash: await depsHash(workDir, manager),
  }

  // 3. Skip sync if fingerprint matches
  const prev = state.fingerprint
  if (prev
    && prev.pythonVersion === currentFingerprint.pythonVersion
    && prev.manager === currentFingerprint.manager
    && prev.depsHash === currentFingerprint.depsHash) {
    return { venvDir, python, binDir, synced: false }
  }

  // 4. Sync dependencies
  try {
    await syncDeps(space, venvDir, manager, onData)
  }
  catch (error) {
    throw new AppError(
      'PYTHON_DEPS_FAILED',
      error instanceof Error ? error.message : String(error),
    )
  }

  // 5. Persist fingerprint
  await writeJson(syncPath, { fingerprint: currentFingerprint })
  return { venvDir, python, binDir, synced: true }
}
