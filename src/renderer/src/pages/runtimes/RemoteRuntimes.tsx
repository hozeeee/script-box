import type { RemoteNodeVersion } from '@shared/types'
import type { TableProps } from 'antd'
import type { ReactNode } from 'react'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { formatError } from '@renderer/api/errors'
import DownloadProgress from '@renderer/components/runtime/DownloadProgress'
import { useRuntimesStore } from '@renderer/stores/runtimes'
import { App, Button, Card, Input, Space, Switch, Table, Tag, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function RemoteRuntimes(): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const { remote, remoteLoading, installed, progress, loadRemote, install, cancel, dismiss } = useRuntimesStore()
  const [ltsOnly, setLtsOnly] = useState(true)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    loadRemote().catch(error => message.error(formatError(t, error)))
  }, [loadRemote, message, t])

  const rows = useMemo(() => remote.filter(item =>
    (!ltsOnly || item.lts) && (!keyword || item.version.includes(keyword.trim())),
  ), [remote, ltsOnly, keyword])

  const start = (version: string): void => {
    dismiss(version)
    install(version).catch(error => message.error(formatError(t, error)))
  }

  const columns: TableProps<RemoteNodeVersion>['columns'] = [
    { title: t('common.version'), dataIndex: 'version', width: 140 },
    {
      title: 'LTS',
      dataIndex: 'lts',
      width: 120,
      render: (lts: string | false) => lts ? <Tag color="green">{lts}</Tag> : null,
    },
    { title: 'npm', dataIndex: 'npm', width: 100, render: (value?: string) => value ?? '-' },
    { title: t('runtimes.releaseDate'), dataIndex: 'date', width: 120 },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_, item) => {
        const current = progress[item.version]
        if (current) {
          return (
            <DownloadProgress
              progress={current}
              onCancel={() => void cancel(item.version)}
              onDismiss={() => dismiss(item.version)}
            />
          )
        }
        if (installed.some(runtime => runtime.version === item.version))
          return <Typography.Text type="success">{t('runtimes.isInstalled')}</Typography.Text>
        return (
          <Button size="small" icon={<DownloadOutlined />} onClick={() => start(item.version)}>
            {t('runtimes.install')}
          </Button>
        )
      },
    },
  ]

  return (
    <Card
      title={t('runtimes.available')}
      size="small"
      extra={(
        <Space>
          <Input.Search
            allowClear
            size="small"
            placeholder={t('runtimes.search')}
            style={{ width: 180 }}
            onChange={event => setKeyword(event.target.value)}
          />
          <Space size={4}>
            <Switch size="small" checked={ltsOnly} onChange={setLtsOnly} />
            <span>{t('runtimes.ltsOnly')}</span>
          </Space>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={remoteLoading}
            onClick={() => loadRemote(true).catch(error => message.error(formatError(t, error)))}
          />
        </Space>
      )}
    >
      <Table
        rowKey="version"
        size="small"
        loading={remoteLoading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />
    </Card>
  )
}
