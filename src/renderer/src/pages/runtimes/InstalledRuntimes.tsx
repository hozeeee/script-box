import type { InstalledRuntime } from '@shared/types'
import type { TableProps } from 'antd'
import type { ReactNode } from 'react'
import { DeleteOutlined, FolderOpenOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { useRuntimesStore } from '@renderer/stores/runtimes'
import { useSettingsStore } from '@renderer/stores/settings'
import { useSpacesStore } from '@renderer/stores/spaces'
import { App, Button, Card, Space, Table, Tag, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'

export default function InstalledRuntimes(): ReactNode {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const installed = useRuntimesStore(state => state.installed)
  const remove = useRuntimesStore(state => state.remove)
  const spaces = useSpacesStore(state => state.spaces)
  const defaultVersion = useSettingsStore(state => state.settings?.run.defaultNodeVersion)
  const updateSettings = useSettingsStore(state => state.update)

  const usedBy = (version: string): string[] =>
    spaces.filter(space => space.nodeVersion === version).map(space => space.name)

  const confirmRemove = (runtime: InstalledRuntime): void => {
    const users = usedBy(runtime.version)
    modal.confirm({
      title: t('runtimes.removeConfirm', { version: runtime.version }),
      content: users.length ? t('runtimes.removeInUse', { spaces: users.join(', ') }) : undefined,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await remove(runtime.version)
          if (defaultVersion === runtime.version)
            await updateSettings({ run: { defaultNodeVersion: null } })
        }
        catch (error) {
          message.error(formatError(t, error))
        }
      },
    })
  }

  const columns: TableProps<InstalledRuntime>['columns'] = [
    {
      title: t('common.version'),
      dataIndex: 'version',
      render: (version: string) => (
        <Space>
          {version}
          {version === defaultVersion && <Tag color="blue">{t('runtimes.default')}</Tag>}
        </Space>
      ),
    },
    { title: 'npm', dataIndex: 'npmVersion', render: (value: string | null) => value ?? '-' },
    {
      title: t('runtimes.usedBy'),
      key: 'usedBy',
      render: (_, runtime) => (
        <Space size={4} wrap>
          {usedBy(runtime.version).map(name => <Tag key={name} style={{ margin: 0 }}>{name}</Tag>)}
        </Space>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 140,
      render: (_, runtime) => (
        <Space size={0}>
          <Tooltip title={t('runtimes.setDefault')}>
            <Button
              type="text"
              icon={runtime.version === defaultVersion ? <StarFilled /> : <StarOutlined />}
              onClick={() => void updateSettings({ run: { defaultNodeVersion: runtime.version } })}
            />
          </Tooltip>
          <Tooltip title={t('common.openDir')}>
            <Button type="text" icon={<FolderOpenOutlined />} onClick={() => void invoke('app:open-path', runtime.dir)} />
          </Tooltip>
          <Tooltip title={t('common.delete')}>
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => confirmRemove(runtime)} />
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <Card title={t('runtimes.installed')} size="small">
      <Table
        rowKey="version"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={installed}
        locale={{ emptyText: t('runtimes.emptyInstalled') }}
      />
    </Card>
  )
}
