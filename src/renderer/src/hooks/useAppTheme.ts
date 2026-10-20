import { useSettingsStore } from '@renderer/stores/settings'
import { useResolvedTheme } from './useResolvedTheme'

/** The effective light/dark theme of the app, shared by antd, Monaco and xterm */
export function useAppTheme(): 'light' | 'dark' {
  const mode = useSettingsStore(state => state.settings?.theme)
  return useResolvedTheme(mode)
}
