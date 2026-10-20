import type { Space } from '@shared/types'
import type { ReactNode } from 'react'
import { DeleteOutlined, EditOutlined, FolderOpenOutlined, WarningOutlined } from '@ant-design/icons'
import { useRuntimesStore } from '@renderer/stores/runtimes'
import { formatTime } from '@renderer/utils/format'
import { Card, ConfigProvider, Flex, Tag, Tooltip, Typography } from 'antd'
import { useTranslation } from 'react-i18next'

interface Props {
  space: Space
  onOpen: () => void
  onEdit: () => void
  onRemove: () => void
  onOpenDir: () => void
}

// Slimmer action bar than antd's default (12px vertical margin, 16px icons)
const CARD_THEME = { components: { Card: { actionsLiMargin: '4px 0' } } }
const ACTION_ICON: React.CSSProperties = { fontSize: 13, lineHeight: '20px' }

export default function SpaceCard({ space, onOpen, onEdit, onRemove, onOpenDir }: Props): ReactNode {
  const { t } = useTranslation()
  const installed = useRuntimesStore(state => state.installed)
  const runtimeReady = !!space.nodeVersion && installed.some(item => item.version === space.nodeVersion)

  const stop = (fn: () => void) => (event: React.MouseEvent): void => {
    event.stopPropagation()
    fn()
  }

  return (
    <ConfigProvider theme={CARD_THEME}>
      <Card
        hoverable
        size="small"
        styles={{ body: { padding: '10px 12px' } }}
        onClick={onOpen}
        actions={[
          <Tooltip key="edit" title={t('common.edit')}><EditOutlined style={ACTION_ICON} onClick={stop(onEdit)} /></Tooltip>,
          <Tooltip key="dir" title={t('common.openDir')}><FolderOpenOutlined style={ACTION_ICON} onClick={stop(onOpenDir)} /></Tooltip>,
          <Tooltip key="delete" title={t('common.delete')}><DeleteOutlined style={ACTION_ICON} onClick={stop(onRemove)} /></Tooltip>,
        ]}
      >
        <Flex vertical gap={4}>
          <Typography.Text strong ellipsis>{space.name}</Typography.Text>
          <Typography.Text type="secondary" ellipsis style={{ fontSize: 12 }}>
            {space.description || t('spaces.noDescription')}
          </Typography.Text>
          <Flex justify="space-between" align="center" gap={8}>
            {runtimeReady
              ? <Tag color="green" style={{ margin: 0 }}>{`Node ${space.nodeVersion}`}</Tag>
              : <Tag color="warning" icon={<WarningOutlined />} style={{ margin: 0 }}>{space.nodeVersion ? `Node ${space.nodeVersion}` : t('spaces.noRuntime')}</Tag>}
            <Typography.Text type="secondary" ellipsis style={{ fontSize: 11 }}>{formatTime(space.updatedAt)}</Typography.Text>
          </Flex>
        </Flex>
      </Card>
    </ConfigProvider>
  )
}
