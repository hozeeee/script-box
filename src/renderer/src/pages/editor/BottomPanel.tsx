import type { RunStatus } from '@shared/types'
import type { TabsProps } from 'antd'
import type { ReactNode } from 'react'
import { AppstoreOutlined, HistoryOutlined } from '@ant-design/icons'
import DepsPanel from '@renderer/components/deps/DepsPanel'
import HistoryPanel from '@renderer/components/history/HistoryPanel'
import RunTerminal from '@renderer/components/terminal/RunTerminal'
import { useRunsStore } from '@renderer/stores/runs'
import { scriptLabel } from '@shared/types'
import { Badge, Tabs } from 'antd'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export const DEPS_TAB = 'deps'
export const HISTORY_TAB = 'history'

const BADGE_STATUS: Record<RunStatus, 'processing' | 'success' | 'error' | 'default'> = {
  running: 'processing',
  success: 'success',
  failed: 'error',
  stopped: 'default',
}

interface Props {
  spaceId: string
  activeKey: string
  onChange: (key: string) => void
}

/** Terminal tabs (one per script run) plus the dependency and history panels */
export default function BottomPanel({ spaceId, activeKey, onChange }: Props): ReactNode {
  const { t } = useTranslation()
  const sessions = useRunsStore(state => state.sessions)
  const close = useRunsStore(state => state.close)

  const runs = useMemo(
    () => Object.values(sessions)
      .map(session => session.record)
      .filter(record => record.spaceId === spaceId)
      .sort((a, b) => a.startedAt - b.startedAt),
    [sessions, spaceId],
  )

  const items: TabsProps['items'] = [
    ...runs.map(record => ({
      key: record.id,
      label: <Badge status={BADGE_STATUS[record.status]} text={scriptLabel(record.script)} />,
      closable: record.status !== 'running',
      children: <RunTerminal runId={record.id} />,
    })),
    { key: DEPS_TAB, label: t('deps.title'), icon: <AppstoreOutlined />, closable: false, children: <DepsPanel spaceId={spaceId} /> },
    { key: HISTORY_TAB, label: t('history.title'), icon: <HistoryOutlined />, closable: false, children: <HistoryPanel spaceId={spaceId} /> },
  ]

  const active = items.some(item => item.key === activeKey) ? activeKey : DEPS_TAB

  return (
    <Tabs
      className="bottom-tabs"
      type="editable-card"
      hideAdd
      size="small"
      activeKey={active}
      items={items}
      onChange={onChange}
      onEdit={(key, action) => {
        if (action !== 'remove' || typeof key !== 'string')
          return
        close(key)
        if (key === activeKey)
          onChange(runs.find(record => record.id !== key)?.id ?? DEPS_TAB)
      }}
    />
  )
}
