import type { RuntimeInstallProgress } from '@shared/types'
import type { ReactNode } from 'react'
import { CloseOutlined } from '@ant-design/icons'
import { formatBytes } from '@renderer/utils/format'
import { Button, Flex, Progress, Typography } from 'antd'
import { useTranslation } from 'react-i18next'

interface Props {
  progress: RuntimeInstallProgress
  onCancel?: () => void
  onDismiss?: () => void
}

export default function DownloadProgress({ progress, onCancel, onDismiss }: Props): ReactNode {
  const { t } = useTranslation()
  const { phase, received, total } = progress
  const percent = phase === 'download'
    ? (total ? Math.floor((received / total) * 100) : 0)
    : 100
  const failed = phase === 'error'

  return (
    <Flex vertical gap={2} style={{ minWidth: 240 }}>
      <Flex justify="space-between" align="center" gap={8}>
        <Typography.Text type={failed ? 'danger' : 'secondary'} ellipsis style={{ fontSize: 12 }}>
          {failed ? progress.error : t(`runtimes.phase.${phase}`)}
          {phase === 'download' && received > 0 && ` ${formatBytes(received)}${total ? ` / ${formatBytes(total)}` : ''}`}
        </Typography.Text>
        {failed
          ? onDismiss && <Button size="small" type="text" icon={<CloseOutlined />} onClick={onDismiss} />
          : onCancel && <Button size="small" type="link" onClick={onCancel}>{t('common.cancel')}</Button>}
      </Flex>
      <Progress
        percent={percent}
        size="small"
        showInfo={false}
        status={failed ? 'exception' : 'active'}
      />
    </Flex>
  )
}
