import type { RuntimeKind } from '@shared/types'
import type { ReactNode } from 'react'
import { useRuntimesStore } from '@renderer/stores/runtimes'
import { Select } from 'antd'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

interface Props {
  value?: string | null
  onChange?: (value: string | null) => void
  allowClear?: boolean
  style?: React.CSSProperties
  /** Which runtime kind to list, defaults to 'node' */
  kind?: RuntimeKind
}

/** Picks one of the installed runtimes of the given kind */
export default function NodeVersionSelect({ value, onChange, allowClear, style, kind = 'node' }: Props): ReactNode {
  const { t } = useTranslation()
  const installed = useRuntimesStore(state => state.installed).filter(i => i.kind === kind)
  const missing = !!value && !installed.some(item => item.version === value)

  return (
    <Select
      value={value ?? undefined}
      onChange={next => onChange?.(next ?? null)}
      allowClear={allowClear}
      style={style}
      status={missing ? 'warning' : undefined}
      placeholder={t('runtimes.selectPlaceholder')}
      options={installed.map(item => ({
        value: item.version,
        label: item.npmVersion ? `${item.version} (npm ${item.npmVersion})` : item.version,
      }))}
      notFoundContent={<Link to="/runtimes">{t('runtimes.goInstall')}</Link>}
    />
  )
}
