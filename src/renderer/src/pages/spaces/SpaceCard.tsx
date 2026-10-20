import type { Space } from '@shared/types'
import type { ReactNode } from 'react'
import { DeleteOutlined, EditOutlined, FolderOpenOutlined, WarningOutlined } from '@ant-design/icons'
import { useRuntimesStore } from '@renderer/stores/runtimes'
import { formatTime } from '@renderer/utils/format'
import { Card, Flex, Tag, Tooltip, Typography } from 'antd'
import { useTranslation } from 'react-i18next'

interface Props {
  space: Space
  onOpen: () => void
  onEdit: () => void
  onRemove: () => void
  onOpenDir: () => void
}

export default function SpaceCard({ space, onOpen, onEdit, onRemove, onOpenDir }: Props): ReactNode {
  const { t } = useTranslation()
  const installed = useRuntimesStore(state => state.installed)
  const runtimeReady = !!space.nodeVersion && installed.some(item => item.version === space.nodeVersion)

  const stop = (fn: () => void) => (event: React.MouseEvent): void => {
    event.stopPropagation()
    fn()
  }

  return (
    <Card
      hoverable
      size="small"
      onClick={onOpen}
      actions={[
        <Tooltip key="edit" title={t('common.edit')}><EditOutlined onClick={stop(onEdit)} /></Tooltip>,
        <Tooltip key="dir" title={t('common.openDir')}><FolderOpenOutlined onClick={stop(onOpenDir)} /></Tooltip>,
        <Tooltip key="delete" title={t('common.delete')}><DeleteOutlined onClick={stop(onRemove)} /></Tooltip>,
      ]}
    >
      <Flex vertical gap={8}>
        <Typography.Text strong ellipsis style={{ fontSize: 15 }}>{space.name}</Typography.Text>
        <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: 0, minHeight: 44 }}>
          {space.description || t('spaces.noDescription')}
        </Typography.Paragraph>
        <Flex justify="space-between" align="center">
          {runtimeReady
            ? <Tag color="green">{`Node ${space.nodeVersion}`}</Tag>
            : <Tag color="warning" icon={<WarningOutlined />}>{space.nodeVersion ? `Node ${space.nodeVersion}` : t('spaces.noRuntime')}</Tag>}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatTime(space.updatedAt)}</Typography.Text>
        </Flex>
      </Flex>
    </Card>
  )
}
