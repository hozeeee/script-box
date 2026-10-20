import { join } from 'node:path'
import { app } from 'electron'

type Esbuild = typeof import('esbuild')

let loaded: Promise<Esbuild> | null = null

/** The native binary cannot run from inside app.asar, so point esbuild at the unpacked copy */
function configureBinaryPath(): void {
  if (!app.isPackaged || process.env.ESBUILD_BINARY_PATH)
    return
  const pkg = join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@esbuild', `${process.platform}-${process.arch}`)
  process.env.ESBUILD_BINARY_PATH = process.platform === 'win32'
    ? join(pkg, 'esbuild.exe')
    : join(pkg, 'bin', 'esbuild')
}

/** esbuild reads ESBUILD_BINARY_PATH when first required, so it must be loaded lazily */
export function loadEsbuild(): Promise<Esbuild> {
  if (!loaded) {
    configureBinaryPath()
    // A plain require keeps loading inside the CJS main bundle, which resolves through app.asar reliably
    // eslint-disable-next-line ts/no-require-imports
    loaded = Promise.resolve().then(() => require('esbuild') as Esbuild)
  }
  return loaded
}
