import type { ReactNode } from 'react'
import { CaretRightOutlined, SaveOutlined, SettingOutlined, StopOutlined } from '@ant-design/icons'
import { Badge, Button, Flex, Space, Tooltip, Typography } from 'antd'
import { useTranslation } from 'react-i18next'

interface Props {
  name: string
  dirty: boolean
  running: boolean
  onSave: () => void
  onRun: () => void
  onStop: () => void
  onConfigure: () => void
}

export default function EditorToolbar({ name, dirty, running, onSave, onRun, onStop, onConfigure }: Props): ReactNode {
  const { t } = useTranslation()
  return (
    <Flex align="center" justify="space-between" gap={8} style={{ padding: '6px 12px' }}>
      <Space size={6} style={{ minWidth: 0 }}>
        <Typography.Text strong ellipsis>{name}</Typography.Text>
        {dirty && <Badge status="warning" text={t('editor.unsaved')} />}
      </Space>
      <Space size={8}>
        <Tooltip title={`${t('common.save')} (Ctrl/⌘+S)`}>
          <Button size="small" icon={<SaveOutlined />} disabled={!dirty} onClick={onSave} />
        </Tooltip>
        <Tooltip title={t('runConfig.open')}>
          <Button size="small" icon={<SettingOutlined />} onClick={onConfigure} />
        </Tooltip>
        {running
          ? (
              <Button size="small" danger icon={<StopOutlined />} onClick={onStop}>
                {t('editor.stop')}
              </Button>
            )
          : (
              <Tooltip title="F5">
                <Button size="small" type="primary" icon={<CaretRightOutlined />} onClick={onRun}>
                  {t('editor.run')}
                </Button>
              </Tooltip>
            )}
      </Space>
    </Flex>
  )
}
