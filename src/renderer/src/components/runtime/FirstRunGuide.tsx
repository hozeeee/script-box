import type { ReactNode } from 'react'
import { formatError } from '@renderer/api/errors'
import { useRuntimesStore } from '@renderer/stores/runtimes'
import { useSettingsStore } from '@renderer/stores/settings'
import { isCnPreset, mirrorPreset } from '@renderer/utils/presets'
import { App, Flex, Modal, Select, Switch, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DownloadProgress from './DownloadProgress'

/** Shown until at least one Node.js runtime has been installed */
export default function FirstRunGuide(): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const settings = useSettingsStore(state => state.settings)
  const update = useSettingsStore(state => state.update)
  const { installed, remote, remoteLoading, progress, loadRemote, install, cancel, dismiss } = useRuntimesStore()
  const [dismissed, setDismissed] = useState(false)
  const [version, setVersion] = useState<string>()

  const open = !!settings && installed.length === 0 && !dismissed
  const ltsVersions = useMemo(() => remote.filter(item => item.lts).slice(0, 20), [remote])
  const selected = version ?? ltsVersions[0]?.version
  const current = selected ? progress[selected] : undefined
  const cn = settings ? isCnPreset(settings.network) : false

  useEffect(() => {
    if (open)
      loadRemote().catch(error => message.error(formatError(t, error)))
  }, [open, loadRemote, message, t])

  if (!settings)
    return null

  const toggleMirror = async (checked: boolean): Promise<void> => {
    await update(mirrorPreset(checked, settings.network))
    setVersion(undefined)
    await loadRemote().catch(error => message.error(formatError(t, error)))
  }

  const start = async (): Promise<void> => {
    if (!selected)
      return
    try {
      dismiss(selected)
      await install(selected)
    }
    catch (error) {
      message.error(formatError(t, error))
    }
  }

  return (
    <Modal
      open={open}
      title={t('firstRun.title')}
      okText={t('firstRun.install')}
      cancelText={t('firstRun.later')}
      okButtonProps={{ disabled: !selected || (!!current && current.phase !== 'error') }}
      onOk={() => void start()}
      onCancel={() => setDismissed(true)}
      mask={{ closable: false }}
    >
      <Flex vertical gap={16}>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          {t('firstRun.description')}
        </Typography.Paragraph>
        <Flex justify="space-between" align="center">
          <span>{t('firstRun.useCnMirror')}</span>
          <Switch checked={cn} onChange={checked => void toggleMirror(checked)} />
        </Flex>
        <Flex justify="space-between" align="center" gap={16}>
          <span>{t('firstRun.version')}</span>
          <Select
            style={{ width: 240 }}
            loading={remoteLoading}
            value={selected}
            onChange={setVersion}
            options={ltsVersions.map(item => ({ value: item.version, label: `${item.version} (${item.lts})` }))}
          />
        </Flex>
        {current && (
          <DownloadProgress
            progress={current}
            onCancel={() => void cancel(current.version)}
            onDismiss={() => dismiss(current.version)}
          />
        )}
      </Flex>
    </Modal>
  )
}
