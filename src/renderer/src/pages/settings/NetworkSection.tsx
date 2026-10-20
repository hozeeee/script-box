import type { NetworkSettings } from '@shared/types'
import type { ReactNode } from 'react'
import EnvEditor from '@renderer/components/common/EnvEditor'
import { mirrorPreset } from '@renderer/utils/presets'
import { NODE_MIRROR_CN, NODE_MIRROR_OFFICIAL, NPM_REGISTRY_CN, NPM_REGISTRY_OFFICIAL } from '@shared/defaults'
import { AutoComplete, Button, Card, Divider, Flex, Form, Input, Switch } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ConnectionTest from './ConnectionTest'
import { useSettingsUpdate } from './useSettingsUpdate'

const urlRule = { type: 'url' as const, warningOnly: false }

export default function NetworkSection(): ReactNode {
  const { t } = useTranslation()
  const { settings, update } = useSettingsUpdate()
  const [form] = Form.useForm<NetworkSettings>()
  const [saving, setSaving] = useState(false)
  const network = settings?.network
  const proxyEnabled = Form.useWatch(['proxy', 'enabled'], form)

  useEffect(() => {
    if (network)
      form.setFieldsValue(network)
  }, [network, form])

  if (!network)
    return null

  const save = async (): Promise<void> => {
    const values = await form.validateFields()
    setSaving(true)
    const binaryMirrors = values.binaryMirrors.filter(item => item.key.trim())
    await update({ network: { ...values, binaryMirrors } })
    setSaving(false)
  }

  const applyPreset = (cn: boolean): void => {
    const current = { ...network, ...form.getFieldsValue(true) as NetworkSettings }
    form.setFieldsValue(mirrorPreset(cn, current).network as Partial<NetworkSettings>)
  }

  return (
    <Card
      title={t('settings.network')}
      size="small"
      extra={(
        <Flex gap={8}>
          <Button size="small" onClick={() => applyPreset(true)}>{t('settings.cnPreset')}</Button>
          <Button size="small" onClick={() => applyPreset(false)}>{t('settings.officialPreset')}</Button>
        </Flex>
      )}
    >
      <Form form={form} layout="horizontal" labelCol={{ span: 6 }} initialValues={network}>
        <Form.Item label={t('settings.nodeMirror')} name="nodeMirror" rules={[{ required: true }, urlRule]}>
          <AutoComplete options={[{ value: NODE_MIRROR_OFFICIAL }, { value: NODE_MIRROR_CN }]} />
        </Form.Item>
        <Form.Item label={t('settings.npmRegistry')} name="npmRegistry" rules={[{ required: true }, urlRule]}>
          <AutoComplete options={[{ value: NPM_REGISTRY_OFFICIAL }, { value: NPM_REGISTRY_CN }]} />
        </Form.Item>

        <Divider titlePlacement="start" plain>{t('settings.proxy')}</Divider>
        <Form.Item label={t('settings.proxyEnabled')} name={['proxy', 'enabled']} valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item
          label="HTTP"
          name={['proxy', 'http']}
          rules={[{ required: !!proxyEnabled, message: t('settings.proxyRequired') }, urlRule]}
        >
          <Input placeholder="http://127.0.0.1:7890" disabled={!proxyEnabled} />
        </Form.Item>
        <Form.Item label="HTTPS" name={['proxy', 'https']} rules={[urlRule]} extra={t('settings.httpsProxyHint')}>
          <Input placeholder={t('settings.sameAsHttp')} disabled={!proxyEnabled} />
        </Form.Item>
        <Form.Item label="No proxy" name={['proxy', 'noProxy']} extra={t('settings.noProxyHint')}>
          <Input placeholder="localhost,127.0.0.1,.internal" disabled={!proxyEnabled} />
        </Form.Item>

        <Divider titlePlacement="start" plain>{t('settings.binaryMirrors')}</Divider>
        <Form.Item name="binaryMirrors" extra={t('settings.binaryMirrorsHint')} wrapperCol={{ span: 24 }}>
          <EnvEditor keyPlaceholder="ELECTRON_MIRROR" />
        </Form.Item>

        <Flex justify="space-between" align="center" wrap gap={8}>
          <ConnectionTest registry={network.npmRegistry} />
          <Button type="primary" loading={saving} onClick={() => void save().catch(() => setSaving(false))}>
            {t('common.save')}
          </Button>
        </Flex>
      </Form>
    </Card>
  )
}
