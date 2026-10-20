import type { ReactNode } from 'react'
import { formatError } from '@renderer/api/errors'
import { SCRIPT_EXTENSIONS } from '@shared/types'
import { App, Form, Input, Modal, Select } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  title: string
  /** Existing name when renaming */
  initialName?: string
  onSubmit: (name: string) => Promise<void>
  onClose: () => void
}

interface FormValues {
  base: string
  ext: string
}

// eslint-disable-next-line no-control-regex
const INVALID = /[<>:"/\\|?*\u0000-\u001F]|^\.|\.\./

function split(name?: string): FormValues {
  const ext = SCRIPT_EXTENSIONS.find(item => name?.endsWith(item))
  return ext ? { base: name!.slice(0, -ext.length), ext } : { base: name ?? '', ext: '.ts' }
}

/** Name input with an extension picker, used for both creating and renaming scripts */
export default function ScriptNameModal({ open, title, initialName, onSubmit, onClose }: Props): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open)
      form.setFieldsValue(split(initialName))
  }, [open, initialName, form])

  const submit = async (): Promise<void> => {
    const { base, ext } = await form.validateFields()
    setSaving(true)
    try {
      await onSubmit(`${base.trim()}${ext}`)
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
    <Modal open={open} title={title} confirmLoading={saving} onOk={() => void submit()} onCancel={onClose} destroyOnHidden>
      <Form form={form} preserve={false} onFinish={() => void submit()}>
        <Form.Item
          name="base"
          rules={[
            { required: true, whitespace: true, message: t('script.nameRequired') },
            { pattern: /^[^<>:"/\\|?*]+$/, message: t('script.nameInvalid') },
            { validator: (_, value: string) => INVALID.test(value ?? '') ? Promise.reject(new Error(t('script.nameInvalid'))) : Promise.resolve() },
          ]}
        >
          <Input
            autoFocus
            placeholder={t('script.namePlaceholder')}
            suffix={(
              <Form.Item name="ext" noStyle>
                <Select
                  variant="borderless"
                  style={{ width: 80 }}
                  options={SCRIPT_EXTENSIONS.map(ext => ({ value: ext, label: ext }))}
                />
              </Form.Item>
            )}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
