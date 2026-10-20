import type { ReactNode } from 'react'
import { Flex, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import AboutSection from './AboutSection'
import AppearanceSection from './AppearanceSection'
import NetworkSection from './NetworkSection'
import RunSection from './RunSection'
import UpdateSection from './UpdateSection'

export default function SettingsPage(): ReactNode {
  const { t } = useTranslation()
  return (
    <div className="page">
      <Flex vertical gap={16} className="settings-form">
        <Typography.Title level={4} style={{ margin: 0 }}>{t('settings.title')}</Typography.Title>
        <AppearanceSection />
        <NetworkSection />
        <RunSection />
        <UpdateSection />
        <AboutSection />
      </Flex>
    </div>
  )
}
