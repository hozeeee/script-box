import type { ScriptFile } from '@shared/types'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { App } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ScriptsState {
  scripts: ScriptFile[]
  loaded: boolean
  /** Localized error of the last reload, e.g. the project directory vanished */
  error: string | null
  /** `silent` skips the error toast, for background refreshes */
  reload: (options?: { silent?: boolean }) => Promise<ScriptFile[]>
}

/** Script files of a space, reloaded whenever the space changes */
export function useScripts(spaceId: string): ScriptsState {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [state, setState] = useState<{ spaceId: string, scripts: ScriptFile[], error: string | null } | null>(null)

  const reload = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const scripts = await invoke('script:list', spaceId)
      setState({ spaceId, scripts, error: null })
      return scripts
    }
    catch (error) {
      const text = formatError(t, error)
      setState(prev => ({ spaceId, scripts: prev?.spaceId === spaceId ? prev.scripts : [], error: text }))
      if (!options?.silent)
        message.error(text)
      return []
    }
  }, [spaceId, message, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const loaded = state?.spaceId === spaceId
  return { scripts: loaded ? state.scripts : [], loaded, error: loaded ? state.error : null, reload }
}
