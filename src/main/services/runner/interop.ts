import type { Plugin } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { createRequire, isBuiltin } from 'node:module'
import { dirname, extname, join } from 'node:path'

const NAMESPACE = 'scriptbox-cjs'
// esbuild filters are Go regexps (no lookahead), so Windows absolute paths are skipped in the callback
const BARE = /^[^./]/
const WINDOWS_ABSOLUTE = /^[a-z]:[\\/]/i

async function nearestPackageType(file: string): Promise<string | undefined> {
  let dir = dirname(file)
  while (true) {
    try {
      const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as { type?: string }
      return pkg.type
    }
    catch {}
    const parent = dirname(dir)
    if (parent === dir)
      return undefined
    dir = parent
  }
}

/** Whether Node treats a resolved file as an ES module */
export async function isEsmFile(file: string): Promise<boolean> {
  const ext = extname(file)
  if (ext === '.mjs')
    return true
  if (ext !== '.js')
    return false
  return (await nearestPackageType(file)) === 'module'
}

/**
 * Node cannot always expose named exports of CommonJS packages to ESM
 * (`import { chunk } from 'lodash'` fails). CommonJS packages are therefore
 * loaded through `require()` and esbuild's interop, matching TypeScript's
 * `esModuleInterop`. Real ES modules and builtins stay native imports.
 */
export function cjsInteropPlugin(source: string): Plugin {
  const resolver = createRequire(source)
  return {
    name: 'scriptbox-cjs-interop',
    setup(build) {
      build.onResolve({ filter: BARE }, async (args) => {
        if (WINDOWS_ABSOLUTE.test(args.path))
          return undefined
        if (args.namespace === NAMESPACE || isBuiltin(args.path))
          return { path: args.path, external: true }
        let resolved: string
        try {
          resolved = resolver.resolve(args.path)
        }
        catch {
          // ESM-only (no "require" export condition) or missing: let Node report it at runtime
          return { path: args.path, external: true }
        }
        if (await isEsmFile(resolved))
          return { path: args.path, external: true }
        return { path: args.path, namespace: NAMESPACE }
      })
      build.onLoad({ filter: /.*/, namespace: NAMESPACE }, args => ({
        contents: `module.exports = require(${JSON.stringify(args.path)})`,
        loader: 'js',
      }))
    },
  }
}
