import type { PythonDependencyManager } from '@shared/types'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { exists } from '../../utils/fs'

interface PyprojectToml {
  'project'?: {
    'name'?: string
    'requires-python'?: string
    'dependencies'?: string[]
  }
  'build-system'?: {
    'build-backend'?: string
    'requires'?: string[]
  }
  'tool'?: {
    uv?: Record<string, unknown>
    poetry?: Record<string, unknown>
    pdm?: Record<string, unknown>
  }
}

export interface PythonProjectInfo {
  name: string | null
  pythonVersionHint: string | null
  pythonVersionSource: string | null
  manager: PythonDependencyManager
  managerCandidates: PythonDependencyManager[]
}

async function readFirstLine(path: string): Promise<string | null> {
  try {
    return (await readFile(path, 'utf8')).split(/\r?\n/)[0]?.trim() ?? null
  }
  catch {
    return null
  }
}

async function readPyproject(dir: string): Promise<PyprojectToml | null> {
  try {
    return parse(await readFile(join(dir, 'pyproject.toml'), 'utf8')) as unknown as PyprojectToml
  }
  catch {
    return null
  }
}

/** Returns an exact pin from `.python-version` or `.tool-versions` (asdf) */
async function detectPythonPin(dir: string): Promise<{ hint: string, source: string } | null> {
  const pvLine = await readFirstLine(join(dir, '.python-version'))
  if (pvLine) {
    const version = pvLine.replace(/^cpython-/, '').replace(/\s.*$/, '')
    if (/\d+(?:\.\d+)*/.test(version))
      return { hint: version, source: '.python-version' }
  }
  const tvLine = await readFirstLine(join(dir, '.tool-versions'))
  if (tvLine) {
    const parts = tvLine.match(/python\s+([\d.]+)/)
    if (parts?.[1])
      return { hint: parts[1], source: '.tool-versions' }
  }
  return null
}

/** Detect which dependency managers the project indicates */
async function detectManagers(dir: string, pyproject: PyprojectToml | null): Promise<PythonDependencyManager[]> {
  const candidates: PythonDependencyManager[] = []
  if (await exists(join(dir, 'uv.lock')))
    candidates.push('uv')
  if (await exists(join(dir, 'poetry.lock')))
    candidates.push('poetry')
  if (await exists(join(dir, 'pdm.lock')))
    candidates.push('pdm')
  // Check tool sections in pyproject.toml
  if (pyproject?.tool?.uv && !candidates.includes('uv'))
    candidates.push('uv')
  if (pyproject?.tool?.poetry && !candidates.includes('poetry'))
    candidates.push('poetry')
  if (pyproject?.tool?.pdm && !candidates.includes('pdm'))
    candidates.push('pdm')
  // requirements.txt fallback
  if (candidates.length === 0 && (await exists(join(dir, 'requirements.txt'))))
    candidates.push('requirements')
  // pyproject without lock or requirements -> pep517
  if (candidates.length === 0 && pyproject)
    candidates.push('pep517')
  return candidates
}

export async function inspectPythonProject(dir: string): Promise<PythonProjectInfo> {
  const pyproject = await readPyproject(dir)
  const pin = await detectPythonPin(dir)
  const requiresPython = pyproject?.project?.['requires-python'] ?? null
  const hint = pin?.hint ?? requiresPython
  const source = pin?.source ?? (requiresPython ? 'requires-python' : null)
  const name = pyproject?.project?.name ?? null
  const candidates = await detectManagers(dir, pyproject)
  const manager = candidates.length === 1 ? candidates[0]! : candidates.length === 0 ? 'none' : candidates[0]!
  return { name, pythonVersionHint: hint, pythonVersionSource: source, manager, managerCandidates: candidates }
}
