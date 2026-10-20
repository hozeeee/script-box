import type { AppInfo } from '@shared/types'
import type { ReactNode } from 'react'
import { FolderOpenOutlined, GithubOutlined } from '@ant-design/icons'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { App, Button, Card, Descriptions, Flex } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export const REPO_URL = 'https://github.com/<owner>/script-box'

export default function AboutSection(): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void invoke('app:info').then(setInfo).catch(() => {})
  }, [])

  const call = (action: Promise<unknown>): void => {
    action.catch(error => message.error(formatError(t, error)))
  }

  return (
    <Card title={t('settings.about')} size="small">
      {info && (
        <Descriptions
          size="small"
          column={1}
          items={[
            { key: 'version', label: t('settings.version'), children: `Script Box ${info.version}` },
            { key: 'electron', label: 'Electron', children: info.electron },
            { key: 'platform', label: t('settings.platform'), children: `${info.platform} / ${info.arch}` },
            { key: 'data', label: t('settings.dataDir'), children: info.dataDir },
          ]}
        />
      )}
      <Flex gap={8} style={{ marginTop: 12 }}>
        <Button
          icon={<FolderOpenOutlined />}
          disabled={!info}
          onClick={() => info && call(invoke('app:open-path', info.dataDir))}
        >
          {t('settings.openDataDir')}
        </Button>
        <Button icon={<GithubOutlined />} onClick={() => call(invoke('app:open-external', REPO_URL))}>
          GitHub
        </Button>
      </Flex>
    </Card>
  )
}
