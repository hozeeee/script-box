import type { UpdateStatus } from '@shared/types'
import type { ReactNode } from 'react'
import { invoke, on } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import DownloadedUpdateInfo from '@renderer/components/common/DownloadedUpdateInfo'
import { Alert, App, Button, Card, Flex, Form, Progress, Switch, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsUpdate } from './useSettingsUpdate'

function StatusText({ status }: { status: UpdateStatus }): ReactNode {
  const { t } = useTranslation()
  if (status.state === 'downloading')
    return <Progress percent={status.percent ?? 0} size="small" style={{ width: 200 }} />
  const type = status.state === 'error' ? 'danger' : status.state === 'downloaded' && status.downloaded?.manualInstall ? 'warning' : status.state === 'available' || status.state === 'downloaded' ? 'success' : 'secondary'
  return (
    <Typography.Text type={type}>
      {t(status.state === 'downloaded' && status.downloaded?.manualInstall ? 'update.manual.downloaded' : `update.states.${status.state}`, { version: status.version ?? '' })}
      {status.errorCode
        ? `: ${t(`update.errors.${status.errorCode}`)}`
        : status.error && `: ${status.error}`}
    </Typography.Text>
  )
}

export default function UpdateSection(): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const { settings, update } = useSettingsUpdate()
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    let received = false
    let active = true
    const unsubscribe = on('updater:status', (value) => {
      received = true
      setStatus(value)
    })
    void invoke('updater:status').then((value) => {
      if (active && !received)
        setStatus(value)
    }).catch(() => {})
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  if (!settings)
    return null

  const call = (action: Promise<unknown>): void => {
    action.catch(error => message.error(formatError(t, error)))
  }
  const unsupported = status.state === 'unsupported'
  const busy = status.state === 'checking' || status.state === 'downloading' || status.state === 'preparing'

  return (
    <Card title={t('settings.update')} size="small">
      <Form layout="horizontal" labelCol={{ span: 6 }}>
        <Form.Item label={t('settings.autoCheck')}>
          <Switch
            checked={settings.update.autoCheck}
            onChange={autoCheck => void update({ update: { autoCheck } })}
          />
        </Form.Item>
        <Form.Item label={t('settings.updateStatus')} style={{ marginBottom: 0 }}>
          <Flex align="center" gap={12} wrap>
            <StatusText status={status} />
            {status.state === 'available' && (
              <Button size="small" type="primary" onClick={() => call(invoke('updater:download'))}>
                {t('update.download')}
              </Button>
            )}
            {status.downloaded && !status.downloaded.manualInstall && (
              <Button size="small" type="primary" disabled={busy} onClick={() => call(invoke('updater:install'))}>
                {t('update.restart')}
              </Button>
            )}
            <Button
              size="small"
              disabled={unsupported || busy}
              loading={status.state === 'checking'}
              onClick={() => call(invoke('updater:check').then(setStatus))}
            >
              {t('update.check')}
            </Button>
            {status.manualReason && !status.downloaded && (
              <Alert type="warning" showIcon title={t(`update.manual.${status.manualReason}`)} />
            )}
            {status.downloaded && <DownloadedUpdateInfo downloaded={status.downloaded} />}
          </Flex>
        </Form.Item>
      </Form>
    </Card>
  )
}
