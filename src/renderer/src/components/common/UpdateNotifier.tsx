import type { UpdateStatus } from '@shared/types'
import type { ReactNode } from 'react'
import { invoke, on } from '@renderer/api'
import { App, Button } from 'antd'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const KEY = 'app-update'

/** Global notifications for auto update: offer download, then offer restart */
export default function UpdateNotifier(): ReactNode {
  const { t } = useTranslation()
  const { notification } = App.useApp()

  useEffect(() => on('updater:status', (status: UpdateStatus) => {
    if (status.state === 'available') {
      notification.info({
        key: KEY,
        title: t('update.available', { version: status.version }),
        duration: 0,
        actions: (
          <Button type="primary" size="small" onClick={() => void invoke('updater:download')}>
            {t('update.download')}
          </Button>
        ),
      })
    }
    else if (status.state === 'downloaded') {
      notification.success({
        key: KEY,
        title: t('update.downloaded', { version: status.version }),
        duration: 0,
        actions: (
          <Button type="primary" size="small" onClick={() => void invoke('updater:install')}>
            {t('update.restart')}
          </Button>
        ),
      })
    }
  }), [notification, t])

  return null
}
