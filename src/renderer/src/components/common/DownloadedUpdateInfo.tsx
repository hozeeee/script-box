import type { DownloadedUpdate } from '@shared/types'
import type { ReactNode } from 'react'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { Alert, App, Button, Flex, Typography } from 'antd'
import { useTranslation } from 'react-i18next'

/** 设置页与更新通知共用的下载位置、手动安装说明。 */
export default function DownloadedUpdateInfo({ downloaded }: { downloaded: DownloadedUpdate }): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  return (
    <Flex vertical gap={8} style={{ width: '100%', minWidth: 0 }}>
      <Typography.Text>{t('update.package', { version: downloaded.version })}</Typography.Text>
      <Typography.Paragraph copyable style={{ marginBottom: 0, overflowWrap: 'anywhere' }}>
        {downloaded.path}
      </Typography.Paragraph>
      <Button style={{ alignSelf: 'flex-start' }} onClick={() => void invoke('updater:reveal').catch(error => message.error(formatError(t, error)))}>
        {t('update.reveal')}
      </Button>
      {downloaded.manualInstall && (
        <Alert
          type="warning"
          showIcon
          title={t(`update.manual.${downloaded.manualReason ?? 'mac-signature'}`)}
          description={(
            <Flex vertical gap={8}>
              <ol style={{ margin: 0, paddingInlineStart: 20 }}>
                <li>{t('update.manual.extract')}</li>
                <li>{t('update.manual.replace', { path: downloaded.appPath })}</li>
                <li>{t('update.manual.open')}</li>
              </ol>
              <Typography.Text>{t('update.manual.safety')}</Typography.Text>
              <Typography.Paragraph copyable={{ text: downloaded.quarantineCommand }} style={{ marginBottom: 0, overflowWrap: 'anywhere' }}>
                <code>{downloaded.quarantineCommand}</code>
              </Typography.Paragraph>
              <Typography.Text type="secondary">{t('update.manual.limit')}</Typography.Text>
            </Flex>
          )}
        />
      )}
    </Flex>
  )
}
