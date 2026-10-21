import type { RunRecord, RunStatus } from '@shared/types'
import type { TableProps } from 'antd'
import type { ReactNode } from 'react'
import { ClearOutlined, DeleteOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons'
import { invoke, on } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { formatDuration, formatTime } from '@renderer/utils/format'
import { scriptLabel } from '@shared/types'
import { App, Button, Flex, Popconfirm, Table, Tag, Tooltip } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LogViewerModal from './LogViewerModal'

const STATUS_COLORS: Record<RunStatus, string> = {
  running: 'processing',
  success: 'success',
  failed: 'error',
  stopped: 'default',
}

export default function HistoryPanel({ spaceId }: { spaceId: string }): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [records, setRecords] = useState<RunRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [viewing, setViewing] = useState<RunRecord | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setRecords(await invoke('history:list', spaceId))
    }
    catch (error) {
      message.error(formatError(t, error))
    }
    finally {
      setLoading(false)
    }
  }, [spaceId, message, t])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => on('run:exit', ({ record }) => {
    if (record.spaceId === spaceId)
      void reload()
  }), [spaceId, reload])

  const run = async (action: Promise<void>): Promise<void> => {
    try {
      await action
      await reload()
    }
    catch (error) {
      message.error(formatError(t, error))
    }
  }

  const columns: TableProps<RunRecord>['columns'] = [
    {
      title: t('history.status'),
      dataIndex: 'status',
      width: 100,
      render: (status: RunStatus) => <Tag color={STATUS_COLORS[status]}>{t(`history.statuses.${status}`)}</Tag>,
    },
    { title: t('history.script'), dataIndex: 'script', ellipsis: true, render: scriptLabel },
    {
      title: t('history.args'),
      dataIndex: 'args',
      ellipsis: true,
      render: (args: string[]) => args.join(' ') || '-',
    },
    { title: 'Node', dataIndex: 'nodeVersion', width: 100 },
    { title: t('history.startedAt'), dataIndex: 'startedAt', width: 180, render: formatTime },
    {
      title: t('history.duration'),
      width: 100,
      render: (_, record) => (record.endedAt ? formatDuration(record.endedAt - record.startedAt) : '-'),
    },
    { title: t('history.exitCode'), dataIndex: 'exitCode', width: 90, render: (code: number | null) => code ?? '-' },
    {
      title: t('common.actions'),
      width: 100,
      render: (_, record) => (
        <Flex gap={4}>
          <Tooltip title={t('history.viewLog')}>
            <Button type="text" size="small" icon={<FileTextOutlined />} onClick={() => setViewing(record)} />
          </Tooltip>
          <Popconfirm
            title={t('history.removeConfirm')}
            disabled={record.status === 'running'}
            onConfirm={() => run(invoke('history:remove', spaceId, record.id))}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={record.status === 'running'} />
          </Popconfirm>
        </Flex>
      ),
    },
  ]

  return (
    <Flex vertical className="fill">
      <Flex gap={8} style={{ padding: '6px 12px' }}>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void reload()} />
        <Popconfirm title={t('history.clearConfirm')} onConfirm={() => run(invoke('history:clear', spaceId))}>
          <Button size="small" icon={<ClearOutlined />} disabled={!records.length}>
            {t('history.clear')}
          </Button>
        </Popconfirm>
      </Flex>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={records}
          pagination={false}
          locale={{ emptyText: t('history.empty') }}
        />
      </div>
      <LogViewerModal spaceId={spaceId} record={viewing} onClose={() => setViewing(null)} />
    </Flex>
  )
}
