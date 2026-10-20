import type { ReactNode } from 'react'
import { Form, Modal, Select, Switch, Typography } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onClose: () => void
  onInstall: (specs: string[], update: boolean) => Promise<void>
}

const SPEC = /^(?:@[a-z0-9~-][\w.~-]*\/)?[a-z0-9~-][\w.~-]*(?:@[^\s@]+)?$/i

export default function InstallDepModal({ open, onClose, onInstall }: Props): ReactNode {
  const { t } = useTranslation()
  const [specs, setSpecs] = useState<string[]>([])
  const [latest, setLatest] = useState(false)
  const [saving, setSaving] = useState(false)
  const invalid = specs.filter(spec => !SPEC.test(spec))

  const submit = async (): Promise<void> => {
    if (!specs.length || invalid.length)
      return
    setSaving(true)
    try {
      await onInstall(specs, latest)
      setSpecs([])
      onClose()
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('deps.install')}
      okText={t('deps.install')}
      confirmLoading={saving}
      okButtonProps={{ disabled: !specs.length || invalid.length > 0 }}
      onOk={() => void submit()}
      onCancel={onClose}
    >
      <Form layout="vertical">
        <Form.Item
          label={t('deps.packages')}
          extra={t('deps.installHint')}
          validateStatus={invalid.length ? 'error' : undefined}
          help={invalid.length ? t('deps.invalidSpec', { specs: invalid.join(', ') }) : undefined}
        >
          <Select
            mode="tags"
            autoFocus
            open={false}
            value={specs}
            onChange={values => setSpecs(values.map(value => value.trim()).filter(Boolean))}
            tokenSeparators={[' ', ',']}
            placeholder="lodash  dayjs@1  @types/lodash"
            suffixIcon={null}
          />
        </Form.Item>
        <Form.Item>
          <Switch size="small" checked={latest} onChange={setLatest} />
          <Typography.Text style={{ marginLeft: 8 }}>{t('deps.preferOnline')}</Typography.Text>
        </Form.Item>
      </Form>
    </Modal>
  )
}
