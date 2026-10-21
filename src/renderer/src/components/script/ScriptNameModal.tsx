import type { ReactNode } from 'react'
import { formatError } from '@renderer/api/errors'
import { SCRIPT_EXTENSIONS } from '@shared/types'
import { App, Form, Input, Modal, Select } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  title: string
  /** Existing name when renaming, or a folder prefix like `src/` when creating */
  initialName?: string
  /** Accept `dir/name` paths (imported projects) */
  allowPath?: boolean
  onSubmit: (name: string) => Promise<void>
  onClose: () => void
}

interface FormValues {
  base: string
  ext: string
}

// eslint-disable-next-line no-control-regex
const INVALID = /[<>:"/\\|?*\u0000-\u001F]|^\.|\.\./
// eslint-disable-next-line no-control-regex
const INVALID_SEGMENT_CHARS = /[<>:"\\|?*\u0000-\u001F]/

/** `src/utils/a` style path: no empty, `.` or `..` segments, no leading or trailing slash */
function isValidPath(value: string): boolean {
  if (INVALID_SEGMENT_CHARS.test(value))
    return false
  return value.split('/').every(segment => segment.trim() === segment && segment !== '' && segment !== '.' && segment !== '..')
}

function split(name?: string): FormValues {
  const ext = SCRIPT_EXTENSIONS.find(item => name?.endsWith(item))
  return ext ? { base: name!.slice(0, -ext.length), ext } : { base: name ?? '', ext: '.ts' }
}

/** Name input with an extension picker, used for both creating and renaming scripts */
export default function ScriptNameModal({ open, title, initialName, allowPath = false, onSubmit, onClose }: Props): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)

  const submit = async (): Promise<void> => {
    const { base, ext } = await form.validateFields()
    setSaving(true)
    try {
      await onSubmit(`${allowPath ? base : base.trim()}${ext}`)
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
      {/* The form is remounted on every open (destroyOnHidden), so initialValues is applied each time;
          setFieldsValue from an effect would run before the form mounts and get wiped */}
      <Form form={form} preserve={false} initialValues={split(initialName)} onFinish={() => void submit()}>
        <Form.Item
          name="base"
          rules={[
            { required: true, whitespace: true, message: t('script.nameRequired') },
            ...(allowPath
              ? [{ validator: (_: unknown, value: string) => !value || isValidPath(value) ? Promise.resolve() : Promise.reject(new Error(t('script.pathInvalid'))) }]
              : [
                  { pattern: /^[^<>:"/\\|?*]+$/, message: t('script.nameInvalid') },
                  { validator: (_: unknown, value: string) => INVALID.test(value ?? '') ? Promise.reject(new Error(t('script.nameInvalid'))) : Promise.resolve() },
                ]),
          ]}
        >
          <Input
            autoFocus
            placeholder={t(allowPath ? 'script.pathPlaceholder' : 'script.namePlaceholder')}
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
