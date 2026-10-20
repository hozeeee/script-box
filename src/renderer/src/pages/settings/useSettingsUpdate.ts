import type { DeepPartial, Settings } from '@shared/types'
import { formatError } from '@renderer/api/errors'
import { useSettingsStore } from '@renderer/stores/settings'
import { App } from 'antd'
import { useTranslation } from 'react-i18next'

/** Current settings plus an `update` that reports failures via a toast */
export function useSettingsUpdate(): { settings: Settings | null, update: (patch: DeepPartial<Settings>) => Promise<boolean> } {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const settings = useSettingsStore(state => state.settings)
  const save = useSettingsStore(state => state.update)

  const update = async (patch: DeepPartial<Settings>): Promise<boolean> => {
    try {
      await save(patch)
      return true
    }
    catch (error) {
      message.error(formatError(t, error))
      return false
    }
  }

  return { settings, update }
}
