import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cjsInteropPlugin, isEsmFile } from './interop'

let root: string

async function put(file: string, content: string): Promise<string> {
  const path = join(root, file)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content)
  return path
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'sb-interop-'))
  // Exports assigned dynamically, so Node's cjs-module-lexer cannot detect them
  await put('node_modules/cjs-pkg/package.json', '{"name":"cjs-pkg","main":"index.js"}')
  await put('node_modules/cjs-pkg/index.js', 'Object.assign(module.exports, { chunk: (a, n) => [a.slice(0, n), a.slice(n)] })')
  await put('node_modules/esm-pkg/package.json', '{"name":"esm-pkg","type":"module","exports":{"import":"./index.js"}}')
  await put('node_modules/esm-pkg/index.js', 'export default "esm-default"; export const named = "esm-named"')
  await put('node_modules/dual-pkg/package.json', '{"name":"dual-pkg","type":"module","main":"index.cjs"}')
  await put('node_modules/dual-pkg/index.cjs', 'module.exports = function dual() { return "dual" }')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('isEsmFile', () => {
  it('follows extension and package type', async () => {
    expect(await isEsmFile(join(root, 'node_modules/esm-pkg/index.js'))).toBe(true)
    expect(await isEsmFile(join(root, 'node_modules/cjs-pkg/index.js'))).toBe(false)
    expect(await isEsmFile(join(root, 'node_modules/dual-pkg/index.cjs'))).toBe(false)
    expect(await isEsmFile(join(root, 'x.mjs'))).toBe(true)
  })
})

describe('cjsInteropPlugin', () => {
  it('makes named and default imports of CommonJS packages work in ESM output', async () => {
    const source = await put('scripts/main.ts', [
      `import { chunk } from 'cjs-pkg'`,
      `import dual from 'dual-pkg'`,
      `import esm, { named } from 'esm-pkg'`,
      `import { join } from 'node:path'`,
      `const value: string = JSON.stringify([chunk([1, 2, 3], 1), dual(), esm, named, typeof join])`,
      `await Promise.resolve()`,
      `console.log(value)`,
    ].join('\n'))
    const outfile = join(root, 'build/main.mjs')
    await build({
      entryPoints: [source],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent',
      plugins: [cjsInteropPlugin(source)],
      banner: { js: `import { createRequire as __c } from 'node:module';\nglobalThis.require ??= __c(${JSON.stringify(pathToFileURL(source).href)});` },
    })
    const output = execFileSync(process.execPath, [outfile], { cwd: root, encoding: 'utf8' })
    expect(JSON.parse(output)).toEqual([[[1], [2, 3]], 'dual', 'esm-default', 'esm-named', 'function'])
  })
})
