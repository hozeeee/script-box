import type { Space } from '@shared/types'
import { join } from 'node:path'
import { AppError } from '@shared/errors'
import { describe, expect, it } from 'vitest'
import { scriptService } from './service'

function project(path = join('/tmp', 'project')): Space {
  return {
    id: 'space-1',
    name: 'Project',
    description: '',
    runtime: { kind: 'node' as const, version: null },
    nodeVersion: null,
    createdAt: 0,
    updatedAt: 0,
    scripts: {},
    projectPath: path,
  }
}

describe('scriptService.resolvePath', () => {
  it('resolves nested project paths inside the project root', () => {
    expect(scriptService.resolvePath(project(), 'src/tools/main.ts')).toBe(join('/tmp', 'project', 'src', 'tools', 'main.ts'))
  })

  it('rejects traversal, absolute and platform-specific paths', () => {
    for (const name of ['../outside.ts', '/outside.ts', 'src/../../outside.ts', 'C:\\outside.ts', 'src\\outside.ts']) {
      try {
        scriptService.resolvePath(project(), name)
        expect.unreachable(`accepted ${name}`)
      }
      catch (error) {
        expect(error).toBeInstanceOf(AppError)
        expect((error as AppError).code).toBe('INVALID_SCRIPT_NAME')
      }
    }
  })
})
