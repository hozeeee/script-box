import type { RuntimeKind } from '@shared/types'
import type { ReactNode } from 'react'
import { Flex, Tabs, Typography } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import InstalledRuntimes from './InstalledRuntimes'
import RemoteRuntimes from './RemoteRuntimes'

export default function RuntimesPage(): ReactNode {
  const { t } = useTranslation()
  const [kind, setKind] = useState<RuntimeKind>('node')

  return (
    <div className="page">
      <Flex vertical gap={16}>
        <Typography.Title level={4} style={{ margin: 0 }}>{t('runtimes.title')}</Typography.Title>
        <Tabs
          activeKey={kind}
          onChange={key => setKind(key as RuntimeKind)}
          items={[
            { key: 'node', label: t('runtimes.tabNode') },
            { key: 'python', label: t('runtimes.tabPython') },
          ]}
        />
        <InstalledRuntimes kind={kind} />
        <RemoteRuntimes kind={kind} />
      </Flex>
    </div>
  )
}
