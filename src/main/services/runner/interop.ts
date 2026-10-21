import type { OnResolveArgs, OnResolveResult, Plugin, PluginBuild } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { createRequire, isBuiltin } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const NAMESPACE = 'scriptbox-cjs'
/** Marks `build.resolve` calls issued by the plugins themselves to avoid recursion */
const RESOLVING = 'scriptboxResolving'
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

export interface InteropOptions {
  /**
   * The bundle is written away from the source (e.g. an imported project whose
   * build output lives in userData), so bare ES module imports cannot be left
   * for Node to resolve from the output location. They are resolved here and
   * emitted as `file://` URLs instead.
   */
  absolute?: boolean
}

function inNodeModules(path: string): boolean {
  return path.split(/[\\/]/).includes('node_modules')
}

function isImportKind(kind: OnResolveArgs['kind']): boolean {
  return kind === 'import-statement' || kind === 'dynamic-import'
}

/** Resolve with esbuild's own resolver (honours `exports`, `import` conditions and tsconfig `paths`) */
async function esbuildResolve(build: PluginBuild, args: OnResolveArgs): Promise<string | null> {
  const result = await build.resolve(args.path, {
    kind: args.kind,
    importer: args.importer,
    resolveDir: args.resolveDir,
    pluginData: { [RESOLVING]: true },
  })
  return result.errors.length || result.external || !result.path ? null : result.path
}

/**
 * Node cannot always expose named exports of CommonJS packages to ESM
 * (`import { chunk } from 'lodash'` fails). CommonJS packages are therefore
 * loaded through `require()` and esbuild's interop, matching TypeScript's
 * `esModuleInterop`. Real ES modules and builtins stay native imports.
 *
 * `require()` calls in the output go through a `require` created for the
 * source file (see the banner in transpile.ts), so they resolve from the
 * source location wherever the bundle is written.
 */
export function cjsInteropPlugin(source: string, options: InteropOptions = {}): Plugin {
  const resolver = createRequire(source)
  return {
    name: 'scriptbox-cjs-interop',
    setup(build) {
      /** Packages loaded natively by Node: bare by default, `file://` URLs in absolute mode */
      const native = async (args: OnResolveArgs): Promise<OnResolveResult> => {
        if (options.absolute && isImportKind(args.kind)) {
          const resolved = await esbuildResolve(build, args)
          if (resolved && inNodeModules(resolved))
            return { path: pathToFileURL(resolved).href, external: true }
          // tsconfig `paths` aliases and linked workspace packages: bundle like local files
          if (resolved)
            return { path: resolved }
        }
        return { path: args.path, external: true }
      }

      build.onResolve({ filter: BARE }, async (args) => {
        if (WINDOWS_ABSOLUTE.test(args.path) || args.pluginData?.[RESOLVING])
          return undefined
        if (args.namespace === NAMESPACE || isBuiltin(args.path))
          return { path: args.path, external: true }
        let resolved: string
        try {
          resolved = resolver.resolve(args.path)
        }
        catch {
          // ESM-only (no "require" export condition) or missing: let Node report it at runtime
          return native(args)
        }
        if (await isEsmFile(resolved))
          return native(args)
        return { path: args.path, namespace: NAMESPACE }
      })
      build.onLoad({ filter: /.*/, namespace: NAMESPACE }, args => ({
        contents: `module.exports = require(${JSON.stringify(args.path)})`,
        loader: 'js',
      }))
    },
  }
}

/**
 * CommonJS output written away from the source: bare `require()`s are
 * rewritten to absolute paths resolved from the source file. Unresolvable
 * names stay bare so Node reports them at runtime.
 */
export function absoluteRequirePlugin(source: string): Plugin {
  const resolver = createRequire(source)
  return {
    name: 'scriptbox-absolute-require',
    setup(build) {
      build.onResolve({ filter: BARE }, async (args) => {
        if (WINDOWS_ABSOLUTE.test(args.path) || args.pluginData?.[RESOLVING])
          return undefined
        if (isBuiltin(args.path))
          return { path: args.path, external: true }
        try {
          return { path: resolver.resolve(args.path), external: true }
        }
        catch {}
        // ESM-only packages (require(esm) on newer Node), aliases and workspace packages
        const resolved = await esbuildResolve(build, args)
        if (resolved && !inNodeModules(resolved))
          return { path: resolved }
        return { path: resolved ?? args.path, external: true }
      })
    },
  }
}
