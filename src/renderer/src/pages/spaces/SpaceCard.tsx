import type { Space } from '@shared/types'
import type { ReactNode } from 'react'
import { DeleteOutlined, EditOutlined, FolderOpenOutlined, HolderOutlined, LinkOutlined, WarningOutlined } from '@ant-design/icons'
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
  sorting?: boolean
}

// Slimmer action bar than antd's default (12px vertical margin, 16px icons)
const CARD_THEME = { components: { Card: { actionsLiMargin: '4px 0' } } }
const ACTION_ICON: React.CSSProperties = { fontSize: 13, lineHeight: '20px' }

export default function SpaceCard({ space, onOpen, onEdit, onRemove, onOpenDir, sorting = false }: Props): ReactNode {
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
        hoverable={!sorting}
        size="small"
        styles={{ body: { padding: '10px 12px' } }}
        onClick={sorting ? undefined : onOpen}
        actions={sorting
          ? undefined
          : [
              <Tooltip key="edit" title={t('common.edit')}><EditOutlined style={ACTION_ICON} onClick={stop(onEdit)} /></Tooltip>,
              <Tooltip key="dir" title={t('common.openDir')}><FolderOpenOutlined style={ACTION_ICON} onClick={stop(onOpenDir)} /></Tooltip>,
              <Tooltip key="delete" title={t('common.delete')}><DeleteOutlined style={ACTION_ICON} onClick={stop(onRemove)} /></Tooltip>,
            ]}
      >
        <Flex vertical gap={4}>
          <Flex align="center" gap={6}>
            {sorting && <HolderOutlined aria-hidden style={{ color: 'var(--ant-color-text-tertiary)' }} />}
            <Typography.Text strong ellipsis>{space.name}</Typography.Text>
            {space.projectPath && <Tag color="blue" style={{ margin: 0, flexShrink: 0 }}>{t('spaces.projectBadge')}</Tag>}
          </Flex>
          {space.projectPath
            ? (
                <Tooltip title={space.projectPath}>
                  <Typography.Text type={space.projectMissing ? 'warning' : 'secondary'} ellipsis style={{ fontSize: 12 }}>
                    {space.projectMissing && <WarningOutlined style={{ marginInlineEnd: 4 }} />}
                    {space.projectPath}
                  </Typography.Text>
                </Tooltip>
              )
            : (
                <Typography.Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                  {space.description || t('spaces.noDescription')}
                </Typography.Text>
              )}
          {space.projectMissing && !sorting && (
            <Typography.Link style={{ fontSize: 12 }} onClick={stop(onEdit)}>
              <LinkOutlined style={{ marginInlineEnd: 4 }} />
              {t('spaces.projectMissing')}
            </Typography.Link>
          )}
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
