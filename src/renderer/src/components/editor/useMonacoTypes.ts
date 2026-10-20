import type { TypeLib } from '@shared/types'
import { invoke } from '@renderer/api'
import { useDepsStore } from '@renderer/stores/deps'
import { useEffect } from 'react'
import { monaco } from './monacoSetup'

let nodeLibs: Promise<TypeLib[]> | null = null

function loadNodeLibs(): Promise<TypeLib[]> {
  nodeLibs ??= invoke('deps:node-types').catch((error) => {
    nodeLibs = null
    throw error
  })
  return nodeLibs
}

function applyLibs(libs: TypeLib[]): void {
  const extraLibs = libs.map(lib => ({ content: lib.content, filePath: lib.path }))
  monaco.typescript.typescriptDefaults.setExtraLibs(extraLibs)
  monaco.typescript.javascriptDefaults.setExtraLibs(extraLibs)
}

/**
 * Feed Monaco with @types/node and the declaration files found in the space's
 * node_modules. Reloads automatically after every dependency task.
 */
export function useMonacoTypes(spaceId: string): void {
  const revision = useDepsStore(state => state.revision[spaceId] ?? 0)

  useEffect(() => {
    let canceled = false
    void Promise.all([
      loadNodeLibs().catch(() => [] as TypeLib[]),
      invoke('deps:types', spaceId).catch(() => [] as TypeLib[]),
    ]).then(([node, space]) => {
      if (!canceled)
        applyLibs([...node, ...space])
    })
    return () => {
      canceled = true
    }
  }, [spaceId, revision])
}
