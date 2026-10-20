import type { Space } from '@shared/types'
import type { ReactNode } from 'react'
import { ArrowLeftOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import NodeVersionSelect from '@renderer/components/runtime/NodeVersionSelect'
import { useSpacesStore } from '@renderer/stores/spaces'
import { App, Button, Flex, theme, Tooltip, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

export default function SpaceHeader({ space }: { space: Space }): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const update = useSpacesStore(state => state.update)

  const changeVersion = (nodeVersion: string | null): void => {
    update(space.id, { nodeVersion }).catch(error => message.error(formatError(t, error)))
  }

  return (
    <Flex
      align="center"
      gap={12}
      style={{ padding: '8px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}
    >
      <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate('/spaces')} />
      <Typography.Title level={5} style={{ margin: 0, flex: 1 }} ellipsis>
        {space.name}
      </Typography.Title>
      <Typography.Text type="secondary">Node</Typography.Text>
      <NodeVersionSelect value={space.nodeVersion} onChange={changeVersion} style={{ width: 160 }} />
      <Tooltip title={t('common.openDir')}>
        <Button
          size="small"
          icon={<FolderOpenOutlined />}
          onClick={() => invoke('space:open-dir', space.id).catch(error => message.error(formatError(t, error)))}
        />
      </Tooltip>
    </Flex>
  )
}
