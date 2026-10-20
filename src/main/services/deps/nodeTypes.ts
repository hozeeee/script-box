import type { TypeLib } from '@shared/types'
import { join } from 'node:path'
import { app } from 'electron'
import { resourcesDir } from '../../paths'
import { collectTypeLibs } from './types'

const NODE_TYPE_PACKAGES = ['@types/node', 'undici-types']

let cache: Promise<TypeLib[]> | null = null

/**
 * Bundled @types/node so editing works offline. In production the declaration
 * files are copied to `resources/types` by electron-builder.
 */
export function nodeTypeLibs(): Promise<TypeLib[]> {
  if (!cache) {
    const root = app.isPackaged ? join(resourcesDir(), 'types') : join(resourcesDir(), 'node_modules')
    cache = collectTypeLibs(root, NODE_TYPE_PACKAGES).catch((error) => {
      cache = null
      throw error
    })
  }
  return cache
}
