import type { UpdateStatus } from '@shared/types'
import type { ReactNode } from 'react'
import { invoke, on } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { App, Button, Card, Flex, Form, Progress, Switch, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsUpdate } from './useSettingsUpdate'

function StatusText({ status }: { status: UpdateStatus }): ReactNode {
  const { t } = useTranslation()
  if (status.state === 'downloading')
    return <Progress percent={status.percent ?? 0} size="small" style={{ width: 200 }} />
  const type = status.state === 'error' ? 'danger' : status.state === 'available' || status.state === 'downloaded' ? 'success' : 'secondary'
  return (
    <Typography.Text type={type}>
      {t(`update.states.${status.state}`, { version: status.version ?? '' })}
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
    void invoke('updater:status').then(setStatus).catch(() => {})
    return on('updater:status', setStatus)
  }, [])

  if (!settings)
    return null

  const call = (action: Promise<unknown>): void => {
    action.catch(error => message.error(formatError(t, error)))
  }
  const unsupported = status.state === 'unsupported'

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
            {status.state === 'downloaded' && (
              <Button size="small" type="primary" onClick={() => call(invoke('updater:install'))}>
                {t('update.restart')}
              </Button>
            )}
            <Button
              size="small"
              disabled={unsupported || status.state === 'checking' || status.state === 'downloading'}
              loading={status.state === 'checking'}
              onClick={() => call(invoke('updater:check').then(setStatus))}
            >
              {t('update.check')}
            </Button>
          </Flex>
        </Form.Item>
      </Form>
    </Card>
  )
}
