import type { ReactNode } from 'react'
import { Alert, Button, Space, Tag } from 'antd'
import { useTranslation } from 'react-i18next'

interface Props {
  missing: string[]
  busy: boolean
  onInstall: () => void
}

/** Banner above the editor listing imported packages that are not installed yet */
export default function MissingDepsAlert({ missing, busy, onInstall }: Props): ReactNode {
  const { t } = useTranslation()
  if (!missing.length)
    return null
  return (
    <Alert
      type="warning"
      showIcon
      banner
      title={(
        <Space wrap size={4}>
          {t('deps.missing')}
          {missing.map(name => <Tag key={name}>{name}</Tag>)}
        </Space>
      )}
      action={(
        <Button size="small" type="primary" loading={busy} onClick={onInstall}>
          {t('deps.installMissing')}
        </Button>
      )}
    />
  )
}
