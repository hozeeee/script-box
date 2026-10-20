import type { ThemeMode } from '@shared/types'
import { useSyncExternalStore } from 'react'

const query = window.matchMedia('(prefers-color-scheme: dark)')

function subscribe(callback: () => void): () => void {
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

/** Resolve `system` to the current OS color scheme and follow its changes */
export function useResolvedTheme(mode: ThemeMode = 'system'): 'light' | 'dark' {
  const systemDark = useSyncExternalStore(subscribe, () => query.matches)
  if (mode === 'system')
    return systemDark ? 'dark' : 'light'
  return mode
}
