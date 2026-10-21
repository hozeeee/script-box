import type { RunRecord } from '@shared/types'
import type { ReactNode } from 'react'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import LogTerminal from '@renderer/components/terminal/LogTerminal'
import { formatTime } from '@renderer/utils/format'
import { scriptLabel } from '@shared/types'
import { Modal, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  spaceId: string
  record: RunRecord | null
  onClose: () => void
}

export default function LogViewerModal({ spaceId, record, onClose }: Props): ReactNode {
  const { t } = useTranslation()
  const [log, setLog] = useState<{ runId: string, content: string } | null>(null)
  const runId = record?.id

  useEffect(() => {
    if (!runId)
      return
    let active = true
    invoke('history:log', spaceId, runId)
      .then(content => active && setLog({ runId, content: content || t('history.emptyLog') }))
      .catch(error => active && setLog({ runId, content: formatError(t, error) }))
    return () => {
      active = false
    }
  }, [spaceId, runId, t])

  const ready = !!runId && log?.runId === runId

  return (
    <Modal
      open={!!record}
      title={record ? `${scriptLabel(record.script)} · ${formatTime(record.startedAt)}` : ''}
      width="80%"
      footer={null}
      destroyOnHidden
      onCancel={onClose}
    >
      <div style={{ height: '60vh' }}>
        {ready ? <LogTerminal source={runId} content={log.content} /> : <Spin />}
      </div>
    </Modal>
  )
}
