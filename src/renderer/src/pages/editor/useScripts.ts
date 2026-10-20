import type { ScriptFile } from '@shared/types'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { App } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ScriptsState {
  scripts: ScriptFile[]
  loaded: boolean
  reload: () => Promise<ScriptFile[]>
}

/** Script files of a space, reloaded whenever the space changes */
export function useScripts(spaceId: string): ScriptsState {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [state, setState] = useState<{ spaceId: string, scripts: ScriptFile[] } | null>(null)

  const reload = useCallback(async () => {
    try {
      const scripts = await invoke('script:list', spaceId)
      setState({ spaceId, scripts })
      return scripts
    }
    catch (error) {
      message.error(formatError(t, error))
      return []
    }
  }, [spaceId, message, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const loaded = state?.spaceId === spaceId
  return { scripts: loaded ? state.scripts : [], loaded, reload }
}
