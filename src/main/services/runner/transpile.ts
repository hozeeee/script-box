import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { AppError } from '@shared/errors'
import { spacePaths } from '../../paths'
import { ensureDir } from '../../utils/fs'
import { loadEsbuild } from '../esbuild'
import { majorOf } from '../runtime'
import { isTypeScript, scriptExtension } from '../script'
import { cjsInteropPlugin } from './interop'

/**
 * TypeScript scripts are bundled (local imports only, packages stay external)
 * into `.scriptbox/build`. `__dirname`, `__filename` and `import.meta.url`
 * keep pointing at the original source so relative file access still works.
 * ESM output resolves packages through {@link cjsInteropPlugin}.
 */
export async function prepareEntry(spaceId: string, script: string, source: string, nodeVersion: string): Promise<string> {
  if (!isTypeScript(script))
    return source

  const cjs = scriptExtension(script) === '.cts'
  const outDir = await ensureDir(spacePaths.build(spaceId))
  const outfile = join(outDir, script.replace(/\.[cm]?ts$/, cjs ? '.cjs' : '.mjs'))
  const sourceUrl = pathToFileURL(source).href
  const scriptsDir = spacePaths.scripts(spaceId)

  await rm(outfile, { force: true })
  try {
    const { build } = await loadEsbuild()
    await build({
      entryPoints: [source],
      outfile,
      bundle: true,
      ...(cjs ? { packages: 'external' as const } : { plugins: [cjsInteropPlugin(source)] }),
      platform: 'node',
      format: cjs ? 'cjs' : 'esm',
      target: `node${majorOf(nodeVersion)}`,
      sourcemap: 'inline',
      logLevel: 'silent',
      define: cjs
        ? {}
        : {
            '__dirname': JSON.stringify(scriptsDir),
            '__filename': JSON.stringify(source),
            'import.meta.url': JSON.stringify(sourceUrl),
            'import.meta.dirname': JSON.stringify(scriptsDir),
            'import.meta.filename': JSON.stringify(source),
          },
      // Provide a `require` for ESM output so mixed require/import code keeps working
      banner: cjs
        ? undefined
        : {
            js: `import { createRequire as __sbCreateRequire } from 'node:module';\nglobalThis.require ??= __sbCreateRequire(${JSON.stringify(sourceUrl)});`,
          },
    })
  }
  catch (error) {
    const errors = (error as { errors?: { text: string, location?: { line: number, column: number } | null }[] }).errors
    const message = errors?.length
      ? errors.map(item => item.location ? `${script}:${item.location.line}:${item.location.column} ${item.text}` : item.text).join('\n')
      : String(error)
    throw new AppError('BUILD_FAILED', message)
  }
  return outfile
}
