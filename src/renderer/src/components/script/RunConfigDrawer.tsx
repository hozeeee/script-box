import type { RunConfig, Space } from '@shared/types'
import type { ReactNode } from 'react'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import EnvEditor from '@renderer/components/common/EnvEditor'
import { useSpacesStore } from '@renderer/stores/spaces'
import { scriptLabel } from '@shared/types'
import { App, Button, Drawer, Form, Input } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  space: Space
  script: string
  onClose: () => void
}

export default function RunConfigDrawer({ open, space, script, onClose }: Props): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [form] = Form.useForm<RunConfig>()
  const [saving, setSaving] = useState(false)
  const put = useSpacesStore(state => state.put)

  useEffect(() => {
    if (open)
      form.setFieldsValue(space.scripts[script]?.runConfig ?? { args: '', env: [] })
  }, [open, space, script, form])

  const save = async (): Promise<void> => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const env = (values.env ?? []).filter(item => item.key.trim())
      put(await invoke('script:save-run-config', space.id, script, { args: values.args ?? '', env }))
      onClose()
    }
    catch (error) {
      message.error(formatError(t, error))
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      title={t('runConfig.title', { name: scriptLabel(script) })}
      size={480}
      onClose={onClose}
      destroyOnHidden
      extra={<Button type="primary" loading={saving} onClick={() => void save()}>{t('common.save')}</Button>}
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="args" label={t('runConfig.args')} extra={t('runConfig.argsHint')}>
          <Input placeholder="--name world --verbose" />
        </Form.Item>
        <Form.Item name="env" label={t('runConfig.env')} extra={t('runConfig.envHint')}>
          <EnvEditor />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
