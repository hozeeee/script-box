import type { ProjectInfo } from '@shared/types'
import type { ReactNode } from 'react'
import { CaretRightOutlined, CodeOutlined, SettingOutlined, StopOutlined } from '@ant-design/icons'
import { runKey, useRunsStore } from '@renderer/stores/runs'
import { npmScriptKey } from '@shared/types'
import { Alert, Badge, Button, Collapse, Flex, Tag, Tooltip, Typography } from 'antd'
import { useTranslation } from 'react-i18next'

interface Props {
  spaceId: string
  info: ProjectInfo
  /** Called with the run key (`npm:<name>`) */
  onRun: (key: string) => void
  onStop: (key: string) => void
  onConfigure: (key: string) => void
}

/** package.json scripts of an imported project, run with the detected package manager */
export default function NpmScriptsPanel({ spaceId, info, onRun, onStop, onConfigure }: Props): ReactNode {
  const { t } = useTranslation()
  const sessions = useRunsStore(state => state.sessions)
  const latest = useRunsStore(state => state.latest)
  const groups = info.scriptGroups ?? [{ directory: '', packageName: info.packageName, packageManager: info.packageManager, scripts: info.scripts }]
  const nonempty = groups.filter(group => Object.keys(group.scripts).length > 0)

  const isRunning = (key: string): boolean =>
    sessions[latest[runKey(spaceId, key)] ?? '']?.record.status === 'running'

  return (
    <Flex vertical className="fill">
      <Flex align="center" justify="space-between" style={{ padding: '6px 8px 6px 16px' }}>
        <Typography.Text strong>{t('npmScripts.title')}</Typography.Text>
        <Tag style={{ margin: 0 }}>{info.packageManager}</Tag>
      </Flex>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingBottom: 6 }}>
        {info.scriptsTruncated && <Alert type="warning" showIcon banner title={t('npmScripts.truncated')} />}
        {nonempty.length === 0 && (
          <Typography.Text type="secondary" style={{ fontSize: 12, padding: '0 16px' }}>{t('npmScripts.empty')}</Typography.Text>
        )}
        <Collapse
          ghost
          size="small"
          defaultActiveKey={['']}
          items={nonempty.map(group => ({
            key: group.directory,
            label: <Tooltip title={group.packageName}><Typography.Text ellipsis>{group.directory || t('npmScripts.root')}</Typography.Text></Tooltip>,
            extra: <Tag style={{ margin: 0 }}>{group.packageManager}</Tag>,
            styles: { body: { padding: 0 } },
            children: Object.keys(group.scripts).map((name) => {
              const key = npmScriptKey(group.directory, name)
              const running = isRunning(key)
              return (
                <Tooltip key={key} title={group.scripts[name]} placement="right" mouseEnterDelay={0.6}>
                  <div className="script-item" onDoubleClick={() => !running && onRun(key)}>
                    <CodeOutlined style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }} />
                    <span className="script-item-name">{name}</span>
                    {running && <Badge status="processing" />}
                    <Button
                      type="text"
                      size="small"
                      title={t('runConfig.open')}
                      icon={<SettingOutlined />}
                      onClick={() => onConfigure(key)}
                    />
                    {running
                      ? <Button type="text" size="small" danger title={t('editor.stop')} icon={<StopOutlined />} onClick={() => onStop(key)} />
                      : <Button type="text" size="small" title={t('editor.run')} icon={<CaretRightOutlined />} onClick={() => onRun(key)} />}
                  </div>
                </Tooltip>
              )
            }),
          }))}
        />
      </div>
    </Flex>
  )
}
