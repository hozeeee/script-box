import { describe, expect, it } from 'vitest'
import { parseArgs } from '../runner/args'
import { isScriptFileForKind, isValidScriptName, isValidScriptPath, languageOf, uniqueName } from './naming'

describe('script naming', () => {
  it('validates script names', () => {
    for (const name of ['main.ts', 'a-b_c.mjs', 'x.cjs', 'Index.MTS', '中文.js'])
      expect(isValidScriptName(name), name).toBe(true)
    for (const name of ['', 'a.txt', 'noext', '.hidden.js', '../x.js', 'a/b.js', 'a\\b.ts', ' a.js', 'a:b.ts'])
      expect(isValidScriptName(name), name).toBe(false)
  })

  it('validates project-relative script paths', () => {
    for (const name of ['src/index.ts', 'tools/deploy.mjs', '中文/脚本.js', 'main.cts'])
      expect(isValidScriptPath(name), name).toBe(true)
    for (const name of ['', '/abs.ts', '../x.ts', 'src/../x.ts', 'src//x.ts', 'C:\\x.ts', 'src\\x.ts', './x.ts'])
      expect(isValidScriptPath(name), name).toBe(false)
  })

  it('detects language by extension', () => {
    expect(languageOf('a.ts')).toBe('typescript')
    expect(languageOf('a.cts')).toBe('typescript')
    expect(languageOf('a.mjs')).toBe('javascript')
    expect(languageOf('a.py')).toBe('python')
  })

  it('filters script files by runtime kind', () => {
    expect(isScriptFileForKind('a.ts', 'node')).toBe(true)
    expect(isScriptFileForKind('a.js', 'node')).toBe(true)
    expect(isScriptFileForKind('a.py', 'node')).toBe(false)
    expect(isScriptFileForKind('a.py', 'python')).toBe(true)
    expect(isScriptFileForKind('a.ts', 'python')).toBe(false)
    expect(isScriptFileForKind('a.js', 'python')).toBe(false)
    expect(isScriptFileForKind('a.mjs', 'python')).toBe(false)
    expect(isScriptFileForKind('a.cjs', 'node')).toBe(true)
    expect(isScriptFileForKind('a.mts', 'node')).toBe(true)
  })

  it('appends a counter on name clashes', () => {
    expect(uniqueName('a.ts', new Set())).toBe('a.ts')
    expect(uniqueName('a.ts', new Set(['a.ts']))).toBe('a-1.ts')
    expect(uniqueName('a.ts', new Set(['a.ts', 'a-1.ts', 'a-2.ts']))).toBe('a-3.ts')
  })
})

describe('parseArgs', () => {
  it('splits on whitespace and honours quotes and escapes', () => {
    expect(parseArgs('')).toEqual([])
    expect(parseArgs('  --port   3000 ')).toEqual(['--port', '3000'])
    expect(parseArgs('"hello world" \'single quoted\'')).toEqual(['hello world', 'single quoted'])
    expect(parseArgs('a\\ b "say \\"hi\\"" \'no \\escape\'')).toEqual(['a b', 'say "hi"', 'no \\escape'])
    expect(parseArgs('--name="" x')).toEqual(['--name=', 'x'])
    expect(parseArgs('""')).toEqual([''])
  })
})
