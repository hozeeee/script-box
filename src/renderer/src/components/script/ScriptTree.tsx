import type { ScriptFile } from '@shared/types'
import type { MenuProps } from 'antd'
import type { ReactNode } from 'react'
import { CaretRightOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons'
import { docKey, isDirty, useDocumentsStore } from '@renderer/stores/documents'
import { runKey, useRunsStore } from '@renderer/stores/runs'
import { Badge, Button, Dropdown, Empty, Flex, theme, Tooltip, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import ImportScriptButton from './ImportScriptButton'
import ScriptDropZone from './ScriptDropZone'

interface Props {
  spaceId: string
  scripts: ScriptFile[]
  selected: string | null
  onSelect: (name: string) => void
  onCreate: () => void
  onImported: (names: string[]) => void
  onRun: (name: string) => void
  onConfigure: (name: string) => void
  onRename: (name: string) => void
  onRemove: (name: string) => void
}

function LanguageBadge({ file }: { file: ScriptFile }): ReactNode {
  const ts = file.language === 'typescript'
  return (
    <span style={{ fontSize: 10, fontWeight: 700, width: 18, color: ts ? '#3178c6' : '#d4a72c' }}>
      {ts ? 'TS' : 'JS'}
    </span>
  )
}

export default function ScriptTree(props: Props): ReactNode {
  const { spaceId, scripts, selected, onSelect, onCreate, onImported } = props
  const { t } = useTranslation()
  const { token } = theme.useToken()
  const docs = useDocumentsStore(state => state.docs)
  const sessions = useRunsStore(state => state.sessions)
  const latest = useRunsStore(state => state.latest)

  const isRunning = (name: string): boolean =>
    sessions[latest[runKey(spaceId, name)] ?? '']?.record.status === 'running'

  const menu = (name: string): MenuProps => ({
    items: [
      { key: 'run', icon: <CaretRightOutlined />, label: t('editor.run'), onClick: () => props.onRun(name) },
      { key: 'config', icon: <SettingOutlined />, label: t('runConfig.open'), onClick: () => props.onConfigure(name) },
      { key: 'rename', icon: <EditOutlined />, label: t('common.rename'), onClick: () => props.onRename(name) },
      { type: 'divider' },
      { key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('common.delete'), onClick: () => props.onRemove(name) },
    ],
  })

  return (
    <ScriptDropZone spaceId={spaceId} onImported={onImported}>
      <Flex vertical className="fill">
        <Flex align="center" justify="space-between" style={{ padding: '8px 8px 8px 16px' }}>
          <Typography.Text strong>{t('editor.scripts')}</Typography.Text>
          <Flex>
            <Tooltip title={t('script.new')}>
              <Button type="text" size="small" icon={<PlusOutlined />} onClick={onCreate} />
            </Tooltip>
            <ImportScriptButton spaceId={spaceId} onImported={onImported} />
          </Flex>
        </Flex>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {scripts.length === 0 && (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('script.empty')} />
          )}
          {scripts.map(file => (
            <Dropdown key={file.name} trigger={['contextMenu']} menu={menu(file.name)}>
              <div
                className="script-item"
                title={file.name}
                style={{ background: file.name === selected ? token.controlItemBgActive : undefined }}
                onClick={() => onSelect(file.name)}
              >
                <LanguageBadge file={file} />
                <span className="script-item-name">{file.name}</span>
                {isDirty(docs[docKey(spaceId, file.name)]) && <Badge status="warning" />}
                {isRunning(file.name) && <Badge status="processing" />}
              </div>
            </Dropdown>
          ))}
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12, padding: '8px 16px' }}>
          {t('script.dropHint')}
        </Typography.Text>
      </Flex>
    </ScriptDropZone>
  )
}
