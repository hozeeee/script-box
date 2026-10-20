import type { ReactNode } from 'react'
import { Flex, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import InstalledRuntimes from './InstalledRuntimes'
import RemoteRuntimes from './RemoteRuntimes'

export default function RuntimesPage(): ReactNode {
  const { t } = useTranslation()
  return (
    <div className="page">
      <Flex vertical gap={16}>
        <Typography.Title level={4} style={{ margin: 0 }}>{t('runtimes.title')}</Typography.Title>
        <InstalledRuntimes />
        <RemoteRuntimes />
      </Flex>
    </div>
  )
}
