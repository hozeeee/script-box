import type { UpdateStatus } from '@shared/types'
import type { ReactNode } from 'react'
import { invoke, on } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { App, Button } from 'antd'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import DownloadedUpdateInfo from './DownloadedUpdateInfo'

const KEY = 'app-update'

/** Global notifications for auto update: offer download, then offer restart */
export default function UpdateNotifier(): ReactNode {
  const { t } = useTranslation()
  const { notification, message, modal } = App.useApp()

  useEffect(() => {
    const call = (action: Promise<unknown>): void => {
      action.catch(error => message.error(formatError(t, error)))
    }
    const show = (status: UpdateStatus): void => {
      if (status.state === 'available') {
        notification.info({
          key: KEY,
          title: t('update.available', { version: status.version }),
          duration: 0,
          actions: (
            <Button type="primary" size="small" onClick={() => call(invoke('updater:download'))}>
              {t('update.download')}
            </Button>
          ),
        })
      }
      else if (status.state === 'downloaded' && status.downloaded) {
        const downloaded = status.downloaded
        notification.open({
          key: KEY,
          type: downloaded.manualInstall ? 'warning' : 'success',
          title: t(downloaded.manualInstall ? 'update.manual.downloaded' : 'update.downloaded', { version: downloaded.version }),
          duration: 0,
          actions: downloaded.manualInstall
            ? (
                <Button
                  type="primary"
                  size="small"
                  onClick={() => modal.info({
                    title: t('update.manual.guide'),
                    width: 680,
                    content: <DownloadedUpdateInfo downloaded={downloaded} />,
                  })}
                >
                  {t('update.manual.guide')}
                </Button>
              )
            : (
                <Button type="primary" size="small" onClick={() => call(invoke('updater:install'))}>
                  {t('update.restart')}
                </Button>
              ),
        })
      }
      else {
        // 下载、校验或失败后立即撤掉旧按钮，避免留下无法操作的“重启并安装”。
        notification.destroy(KEY)
      }
    }
    let received = false
    let active = true
    const unsubscribe = on('updater:status', (status) => {
      received = true
      show(status)
    })
    void invoke('updater:status').then((status) => {
      if (active && !received)
        show(status)
    }).catch(() => {})
    return () => {
      active = false
      unsubscribe()
      notification.destroy(KEY)
    }
  }, [notification, message, modal, t])

  return null
}
