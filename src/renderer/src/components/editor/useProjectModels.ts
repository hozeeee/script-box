import type { Space } from '@shared/types'
import { invoke } from '@renderer/api'
import { useDocumentsStore } from '@renderer/stores/documents'
import { useEffect } from 'react'
import { syncSourceModels } from './models'
import { monaco } from './monacoSetup'

/** TS2307 "Cannot find module" */
const CANNOT_FIND_MODULE = 2307

function ignoreMissingModules(ignore: boolean): void {
  for (const defaults of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) {
    const options = defaults.getDiagnosticsOptions()
    const codes = (options.diagnosticCodesToIgnore ?? []).filter(code => code !== CANNOT_FIND_MODULE)
    defaults.setDiagnosticsOptions({ ...options, diagnosticCodesToIgnore: ignore ? [...codes, CANNOT_FIND_MODULE] : codes })
  }
}

/**
 * Load the sources of an imported project as background models so relative
 * imports between project files resolve. When the project exceeds the source
 * budget, unresolved module errors are hidden instead of showing false alarms.
 * `refresh` changes whenever the file list was reloaded.
 */
export function useProjectModels(space: Space, refresh: unknown): void {
  const isProject = !!space.projectPath && !space.projectMissing

  useEffect(() => {
    if (!isProject)
      return
    let canceled = false
    invoke('script:sources', space.id)
      .then(({ files, truncated }) => {
        if (canceled)
          return
        const prefix = `${space.id}/`
        const open = Object.keys(useDocumentsStore.getState().docs)
          .filter(key => key.startsWith(prefix))
          .map(key => key.slice(prefix.length))
        syncSourceModels(space.id, files, new Set(open))
        ignoreMissingModules(truncated)
      })
      .catch(() => {})
    return () => {
      canceled = true
    }
  }, [space.id, isProject, refresh])

  useEffect(() => {
    if (!isProject)
      return
    return () => ignoreMissingModules(false)
  }, [isProject])
}
