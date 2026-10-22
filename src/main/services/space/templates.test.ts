import type { Space } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { migrateSpace } from './service'
import { PYTHON_PYPROJECT_TEMPLATE, PYTHON_WELCOME_SCRIPT, PYTHON_WELCOME_SCRIPT_NAME } from './templates'

describe('python templates', () => {
  it('generates pyproject.toml with name and requires-python', () => {
    const content = PYTHON_PYPROJECT_TEMPLATE('my-project', '3.12')
    expect(content).toContain('name = "my-project"')
    expect(content).toContain('requires-python = ">=3.12"')
    expect(content).toContain('version = "0.0.1"')
    expect(content).toContain('dependencies = []')
  })

  it('welcome script references sys.version', () => {
    expect(PYTHON_WELCOME_SCRIPT).toContain('import sys')
    expect(PYTHON_WELCOME_SCRIPT).toContain('sys.version')
    expect(PYTHON_WELCOME_SCRIPT_NAME).toBe('hello.py')
  })
})

describe('migrateSpace', () => {
  it('migrates old space without runtime to node runtime', () => {
    const old = { id: '1', name: 'test', nodeVersion: 'v22.1.0', scripts: {} } as unknown as Space
    const migrated = migrateSpace(old)
    expect(migrated.runtime).toEqual({ kind: 'node', version: 'v22.1.0' })
  })

  it('migrates old space with null nodeVersion', () => {
    const old = { id: '2', name: 'test', nodeVersion: null, scripts: {} } as unknown as Space
    const migrated = migrateSpace(old)
    expect(migrated.runtime).toEqual({ kind: 'node', version: null })
  })

  it('migrates old space without nodeVersion field', () => {
    const old = { id: '3', name: 'test', scripts: {} } as unknown as Space
    const migrated = migrateSpace(old)
    expect(migrated.runtime).toEqual({ kind: 'node', version: null })
  })

  it('leaves new-format spaces untouched', () => {
    const space: Space = {
      id: '4',
      name: 'test',
      description: '',
      runtime: { kind: 'python', version: '3.12.0' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      scripts: {},
    }
    const result = migrateSpace(space)
    expect(result).toBe(space)
    expect(result.runtime).toEqual({ kind: 'python', version: '3.12.0' })
  })

  it('preserves node runtime on already-migrated space', () => {
    const space: Space = {
      id: '5',
      name: 'test',
      description: '',
      runtime: { kind: 'node', version: 'v20.0.0' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      scripts: {},
    }
    expect(migrateSpace(space)).toBe(space)
  })
})
