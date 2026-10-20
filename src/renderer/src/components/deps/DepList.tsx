import type { DependencyInfo } from '@shared/types'
import type { TableProps } from 'antd'
import type { ReactNode } from 'react'
import { CloudSyncOutlined, DeleteOutlined } from '@ant-design/icons'
import { Button, Popconfirm, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { useTranslation } from 'react-i18next'

interface Props {
  deps: DependencyInfo[]
  loading: boolean
  busy: boolean
  onUpdate: (name: string) => void
  onUninstall: (name: string) => void
}

export default function DepList({ deps, loading, busy, onUpdate, onUninstall }: Props): ReactNode {
  const { t } = useTranslation()

  const columns: TableProps<DependencyInfo>['columns'] = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      render: (name: string, dep) => (
        <Space size={4}>
          <Typography.Text copyable={{ text: name }}>{name}</Typography.Text>
          {dep.dev && <Tag>dev</Tag>}
        </Space>
      ),
    },
    { title: t('deps.wanted'), dataIndex: 'wanted', width: 140 },
    {
      title: t('deps.installedVersion'),
      dataIndex: 'installed',
      width: 140,
      render: (value: string | null) => value ?? <Typography.Text type="warning">{t('deps.notInstalled')}</Typography.Text>,
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 100,
      render: (_, dep) => (
        <Space size={0}>
          <Tooltip title={t('deps.update')}>
            <Button type="text" size="small" disabled={busy} icon={<CloudSyncOutlined />} onClick={() => onUpdate(dep.name)} />
          </Tooltip>
          <Popconfirm title={t('deps.uninstallConfirm', { name: dep.name })} onConfirm={() => onUninstall(dep.name)}>
            <Button type="text" size="small" danger disabled={busy} icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Table
      rowKey="name"
      size="small"
      loading={loading}
      columns={columns}
      dataSource={deps}
      pagination={false}
      locale={{ emptyText: t('deps.empty') }}
    />
  )
}
