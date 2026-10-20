import type { ReactNode } from 'react'
import { ImportOutlined } from '@ant-design/icons'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { App, Button, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'

interface Props {
  spaceId: string
  onImported: (names: string[]) => void
}

/** Opens the system file dialog and copies the chosen scripts into the space */
export default function ImportScriptButton({ spaceId, onImported }: Props): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()

  const pick = async (): Promise<void> => {
    try {
      const paths = await invoke('app:select-scripts')
      if (!paths.length)
        return
      const names = await invoke('script:import', spaceId, paths)
      message.success(t('script.imported', { count: names.length }))
      onImported(names)
    }
    catch (error) {
      message.error(formatError(t, error))
    }
  }

  return (
    <Tooltip title={t('script.import')}>
      <Button type="text" size="small" icon={<ImportOutlined />} onClick={() => void pick()} />
    </Tooltip>
  )
}
