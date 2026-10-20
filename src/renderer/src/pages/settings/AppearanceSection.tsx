import type { LocaleSetting, ThemeMode } from '@shared/types'
import type { ReactNode } from 'react'
import { Card, Form, Segmented, Select } from 'antd'
import { useTranslation } from 'react-i18next'
import { useSettingsUpdate } from './useSettingsUpdate'

export default function AppearanceSection(): ReactNode {
  const { t } = useTranslation()
  const { settings, update } = useSettingsUpdate()
  if (!settings)
    return null

  return (
    <Card title={t('settings.appearance')} size="small">
      <Form layout="horizontal" labelCol={{ span: 6 }}>
        <Form.Item label={t('settings.language')}>
          <Select<LocaleSetting>
            style={{ width: 200 }}
            value={settings.locale}
            onChange={locale => void update({ locale })}
            options={[
              { value: 'system', label: t('settings.followSystem') },
              { value: 'zh-CN', label: '简体中文' },
              { value: 'en-US', label: 'English' },
            ]}
          />
        </Form.Item>
        <Form.Item label={t('settings.theme')} style={{ marginBottom: 0 }}>
          <Segmented<ThemeMode>
            value={settings.theme}
            onChange={theme => void update({ theme })}
            options={[
              { value: 'system', label: t('settings.followSystem') },
              { value: 'light', label: t('settings.light') },
              { value: 'dark', label: t('settings.dark') },
            ]}
          />
        </Form.Item>
      </Form>
    </Card>
  )
}
