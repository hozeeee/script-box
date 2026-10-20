import type { Space, SpaceInput } from '@shared/types'
import type { ReactNode } from 'react'
import { formatError } from '@renderer/api/errors'
import NodeVersionSelect from '@renderer/components/runtime/NodeVersionSelect'
import { useRuntimesStore } from '@renderer/stores/runtimes'
import { useSettingsStore } from '@renderer/stores/settings'
import { useSpacesStore } from '@renderer/stores/spaces'
import { App, Form, Input, Modal } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  /** Edit this space, or create a new one when omitted */
  space?: Space
  onClose: () => void
  onSaved?: (space: Space) => void
}

export default function SpaceFormModal({ open, space, onClose, onSaved }: Props): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [form] = Form.useForm<SpaceInput>()
  const [saving, setSaving] = useState(false)
  const { create, update } = useSpacesStore()
  const installed = useRuntimesStore(state => state.installed)
  const defaultVersion = useSettingsStore(state => state.settings?.run.defaultNodeVersion)

  // The modal body mounts lazily (and is destroyed on close), so values set from an effect
  // can land before the Form is connected and get lost. Seed them via initialValues instead,
  // which are applied every time the Form mounts.
  const initialValues: SpaceInput = space
    ? { name: space.name, description: space.description, nodeVersion: space.nodeVersion }
    : { name: '', description: '', nodeVersion: defaultVersion ?? installed[0]?.version ?? null }

  const submit = async (): Promise<void> => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const saved = space ? await update(space.id, values) : await create(values)
      onSaved?.(saved)
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
    <Modal
      open={open}
      title={space ? t('spaces.edit') : t('spaces.create')}
      confirmLoading={saving}
      onOk={() => void submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <Form.Item name="name" label={t('common.name')} rules={[{ required: true, whitespace: true, max: 64 }]}>
          <Input placeholder={t('spaces.namePlaceholder')} autoFocus />
        </Form.Item>
        <Form.Item name="description" label={t('common.description')}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} />
        </Form.Item>
        <Form.Item name="nodeVersion" label={t('spaces.nodeVersion')} extra={t('spaces.nodeVersionHint')}>
          <NodeVersionSelect />
        </Form.Item>
      </Form>
    </Modal>
  )
}
