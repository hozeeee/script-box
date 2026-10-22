import type { RemoteNodeVersion, RemoteRuntimeVersion, RuntimeKind } from '@shared/types'
import type { TableProps } from 'antd'
import type { ReactNode } from 'react'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { formatError } from '@renderer/api/errors'
import DownloadProgress from '@renderer/components/runtime/DownloadProgress'
import { useRuntimesStore } from '@renderer/stores/runtimes'
import { App, Button, Card, Input, Space, Switch, Table, Tag, Typography } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function RemoteRuntimes({ kind }: { kind: RuntimeKind }): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const { installed, progress, remoteLoading, remote, loadRemote, install, cancel, dismiss } = useRuntimesStore()
  const [ltsOnly, setLtsOnly] = useState(kind === 'node')
  const [keyword, setKeyword] = useState('')

  const kindRemote = useMemo(() => remote.filter(r => r.kind === kind), [remote, kind])

  // Reset filters and reload when switching tabs
  const prevKindRef = useRef(kind)
  if (prevKindRef.current !== kind) {
    prevKindRef.current = kind
    setLtsOnly(kind === 'node')
    setKeyword('')
  }

  useEffect(() => {
    loadRemote(kind).catch(error => message.error(formatError(t, error)))
  }, [kind, loadRemote, message, t])

  const rows = useMemo(() => kindRemote.filter((item) => {
    if (keyword && !item.version.includes(keyword.trim()))
      return false
    if (kind === 'node' && ltsOnly && !(item as RemoteNodeVersion).lts)
      return false
    return true
  }), [kindRemote, kind, ltsOnly, keyword])

  const start = (version: string): void => {
    dismiss(version)
    install(kind, version).catch(error => message.error(formatError(t, error)))
  }

  const nodeColumns: TableProps<RemoteRuntimeVersion>['columns'] = [
    { title: t('common.version'), dataIndex: 'version', width: 140 },
    {
      title: 'LTS',
      dataIndex: 'lts',
      width: 120,
      render: (lts: string | false) => lts ? <Tag color="green">{lts}</Tag> : null,
    },
    { title: 'npm', dataIndex: 'npm', width: 100, render: (value?: string) => value ?? '-' },
    { title: t('runtimes.releaseDate'), dataIndex: 'date', width: 120 },
  ]

  const pythonColumns: TableProps<RemoteRuntimeVersion>['columns'] = [
    { title: t('common.version'), dataIndex: 'version', width: 140 },
    { title: t('runtimes.releaseDate'), dataIndex: 'date', width: 120 },
  ]

  const actionColumn: TableProps<RemoteRuntimeVersion>['columns'] = [
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_, item) => {
        const current = progress[item.version]
        if (current) {
          return (
            <DownloadProgress
              progress={current}
              onCancel={() => void cancel(kind, item.version)}
              onDismiss={() => dismiss(item.version)}
            />
          )
        }
        if (installed.some(runtime => runtime.version === item.version && runtime.kind === kind))
          return <Typography.Text type="success">{t('runtimes.isInstalled')}</Typography.Text>
        return (
          <Button size="small" icon={<DownloadOutlined />} onClick={() => start(item.version)}>
            {t('runtimes.install')}
          </Button>
        )
      },
    },
  ]

  const columns = [...(kind === 'node' ? nodeColumns : pythonColumns), ...actionColumn]

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
            value={keyword}
          />
          {kind === 'node' && (
            <Space size={4}>
              <Switch size="small" checked={ltsOnly} onChange={setLtsOnly} />
              <span>{t('runtimes.ltsOnly')}</span>
            </Space>
          )}
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={remoteLoading}
            onClick={() => loadRemote(kind, true).catch(error => message.error(formatError(t, error)))}
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
