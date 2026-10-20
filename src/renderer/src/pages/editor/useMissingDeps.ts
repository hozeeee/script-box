import { invoke } from '@renderer/api'
import { useDepsStore } from '@renderer/stores/deps'
import { useEffect, useState } from 'react'

/**
 * Packages imported by the saved script that are neither declared nor installed.
 * Rescans when the saved content changes or a dependency task finishes.
 */
export function useMissingDeps(spaceId: string, script: string | null, saved: string | undefined): string[] {
  const revision = useDepsStore(state => state.revision[spaceId] ?? 0)
  const [result, setResult] = useState<{ key: string, missing: string[] } | null>(null)
  const key = `${spaceId}/${script}`

  useEffect(() => {
    if (!script || saved === undefined)
      return
    let canceled = false
    // Debounce so a burst of saves only triggers one esbuild pass
    const timer = setTimeout(() => {
      invoke('deps:scan-missing', spaceId, script)
        .then(missing => !canceled && setResult({ key, missing }))
        .catch(() => !canceled && setResult({ key, missing: [] }))
    }, 300)
    return () => {
      canceled = true
      clearTimeout(timer)
    }
  }, [spaceId, script, saved, revision, key])

  return result?.key === key ? result.missing : []
}
