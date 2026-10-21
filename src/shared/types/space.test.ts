import { describe, expect, it } from 'vitest'
import { isNpmScriptKey, npmScriptKey, parseNpmScriptKey, scriptLabel } from './space'

describe('npm script keys', () => {
  it('keeps root keys compatible, including colon and slash in script names', () => {
    expect(npmScriptKey('', 'dev')).toBe('npm:dev')
    expect(parseNpmScriptKey('npm:check:lint')).toEqual({ directory: '', name: 'check:lint' })
    expect(parseNpmScriptKey('npm:web/dev')).toEqual({ directory: '', name: 'web/dev' })
  })

  it('encodes child directories and distinguishes duplicate names', () => {
    const name = 'check:lint/%'
    const key = npmScriptKey('packages/中文 web', name)
    expect(isNpmScriptKey(key)).toBe(true)
    expect(parseNpmScriptKey(key)).toEqual({ directory: 'packages/中文 web', name })
    expect(key).not.toBe(npmScriptKey('', name))
    expect(key).not.toBe(npmScriptKey('other', name))
    expect(scriptLabel(key)).toBe(`packages/中文 web · ${name}`)
    expect(scriptLabel('src/index.ts')).toBe('src/index.ts')
  })

  it('rejects empty and malformed keys', () => {
    for (const key of ['npm:', 'npm-project:', 'npm-project:a:%GG', 'npm-project:a:b:c', 'index.ts'])
      expect(parseNpmScriptKey(key)).toBeNull()
  })
})
