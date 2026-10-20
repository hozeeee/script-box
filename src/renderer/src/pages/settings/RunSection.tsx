import type { ReactNode } from 'react'
import NodeVersionSelect from '@renderer/components/runtime/NodeVersionSelect'
import { Card, Form, InputNumber } from 'antd'
import { useTranslation } from 'react-i18next'
import { useSettingsUpdate } from './useSettingsUpdate'

export default function RunSection(): ReactNode {
  const { t } = useTranslation()
  const { settings, update } = useSettingsUpdate()
  if (!settings)
    return null

  return (
    <Card title={t('settings.run')} size="small">
      <Form layout="horizontal" labelCol={{ span: 6 }}>
        <Form.Item label={t('settings.historyLimit')} extra={t('settings.historyLimitHint')}>
          <InputNumber
            min={1}
            max={1000}
            precision={0}
            value={settings.run.historyLimit}
            onChange={value => value && void update({ run: { historyLimit: value } })}
          />
        </Form.Item>
        <Form.Item label={t('settings.defaultNode')} extra={t('settings.defaultNodeHint')} style={{ marginBottom: 0 }}>
          <NodeVersionSelect
            allowClear
            style={{ width: 200 }}
            value={settings.run.defaultNodeVersion}
            onChange={defaultNodeVersion => void update({ run: { defaultNodeVersion } })}
          />
        </Form.Item>
      </Form>
    </Card>
  )
}
