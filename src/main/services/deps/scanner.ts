import type { Plugin } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { loadEsbuild } from '../esbuild'
import { toPackageName } from './packageName'

const FALLBACK_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
]

/** Best-effort regex scan, used when the code does not parse (e.g. while typing) */
export function scanWithRegex(code: string): string[] {
  const found = new Set<string>()
  for (const pattern of FALLBACK_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      const name = toPackageName(match[1])
      if (name)
        found.add(name)
    }
  }
  return [...found].sort()
}

/**
 * Collect the npm packages imported by a script, following local imports.
 * Uses esbuild's resolver so both `import` and `require` are understood.
 */
export async function scanImports(entry: string): Promise<string[]> {
  const found = new Set<string>()
  const collector: Plugin = {
    name: 'collect-packages',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point')
          return undefined
        const name = toPackageName(args.path)
        if (!name)
          return undefined
        found.add(name)
        return { path: args.path, external: true }
      })
    },
  }
  try {
    const { build } = await loadEsbuild()
    await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent',
      plugins: [collector],
    })
    return [...found].sort()
  }
  catch {
    return scanWithRegex(await readFile(entry, 'utf8'))
  }
}
