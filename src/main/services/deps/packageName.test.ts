import { describe, expect, it } from 'vitest'
import { findMissing, isValidSpec, parseSpec, toPackageName } from './packageName'

describe('toPackageName', () => {
  it('keeps plain and scoped package names', () => {
    expect(toPackageName('lodash')).toBe('lodash')
    expect(toPackageName('lodash/fp/map')).toBe('lodash')
    expect(toPackageName('@scope/pkg')).toBe('@scope/pkg')
    expect(toPackageName('@scope/pkg/deep/file.js')).toBe('@scope/pkg')
  })

  it('ignores relative paths, urls and builtins', () => {
    for (const specifier of ['./a', '../b', '/abs', '#internal', 'node:fs', 'fs', 'fs/promises', 'path', 'https://x.dev/a.js', 'C:/x.js', '@scope', ''])
      expect(toPackageName(specifier), specifier).toBeNull()
  })
})

describe('parseSpec', () => {
  it('splits name and range', () => {
    expect(parseSpec('lodash')).toEqual({ name: 'lodash', range: null })
    expect(parseSpec('lodash@^4.17.0')).toEqual({ name: 'lodash', range: '^4.17.0' })
    expect(parseSpec('@types/node')).toEqual({ name: '@types/node', range: null })
    expect(parseSpec(' @types/node@22 ')).toEqual({ name: '@types/node', range: '22' })
    expect(parseSpec('axios@')).toEqual({ name: 'axios', range: null })
  })
})

describe('isValidSpec', () => {
  it('accepts package specs', () => {
    for (const spec of ['lodash', 'lodash@4', '@types/node@^22.0.0', 'left-pad@latest', 'a.b_c~d'])
      expect(isValidSpec(spec), spec).toBe(true)
  })

  it('rejects flags, paths and urls', () => {
    for (const spec of ['--global', '-g', './local', '../x', '/tmp/x', 'git+https://x', 'a b', ''])
      expect(isValidSpec(spec), spec).toBe(false)
  })
})

describe('findMissing', () => {
  it('returns sorted, de-duplicated packages that are not available', () => {
    const available = new Set(['lodash', '@types/chalk'])
    expect(findMissing(['zod', 'lodash', 'chalk', 'zod', '@a/b'], available)).toEqual(['@a/b', 'chalk', 'zod'])
  })
})
