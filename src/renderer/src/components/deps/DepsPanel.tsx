import type { DependencyInfo } from '@shared/types'
import type { ReactNode } from 'react'
import { DownloadOutlined, PlusOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons'
import { invoke, on } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import LogTerminal from '@renderer/components/terminal/LogTerminal'
import { useDepsStore } from '@renderer/stores/deps'
import { App, Button, Flex, Splitter, Tooltip } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DepList from './DepList'
import InstallDepModal from './InstallDepModal'

export default function DepsPanel({ spaceId }: { spaceId: string }): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [deps, setDeps] = useState<DependencyInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const session = useDepsStore(state => state.tasks[spaceId])
  const revision = useDepsStore(state => state.revision[spaceId] ?? 0)
  const store = useDepsStore()
  const busy = !!session && !session.done

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setDeps(await invoke('deps:list', spaceId))
    }
    catch (error) {
      message.error(formatError(t, error))
    }
    finally {
      setLoading(false)
    }
  }, [spaceId, message, t])

  useEffect(() => {
    void reload()
  }, [reload, revision])

  const guard = (task: Promise<unknown>): void => {
    task.catch(error => message.error(formatError(t, error)))
  }

  const follow = useCallback((write: (data: string) => void) => on('deps:task', (event) => {
    if (event.type === 'data' && event.taskId === session?.task.id)
      write(event.data)
  }), [session?.task.id])

  return (
    <Flex vertical className="fill">
      <Flex gap={8} style={{ padding: '6px 12px' }}>
        <Button size="small" type="primary" icon={<PlusOutlined />} disabled={busy} onClick={() => setModalOpen(true)}>
          {t('deps.install')}
        </Button>
        <Tooltip title={t('deps.installAllHint')}>
          <Button size="small" icon={<DownloadOutlined />} disabled={busy} onClick={() => guard(store.installAll(spaceId))}>
            {t('deps.installAll')}
          </Button>
        </Tooltip>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void reload()} />
        {busy && (
          <Button size="small" danger icon={<StopOutlined />} onClick={() => guard(store.cancel(session.task.id))}>
            {t('common.cancel')}
          </Button>
        )}
      </Flex>
      <Splitter style={{ flex: 1, minHeight: 0 }}>
        <Splitter.Panel defaultSize="55%" min="30%" style={{ overflow: 'auto' }}>
          <DepList
            deps={deps}
            loading={loading}
            busy={busy}
            onUpdate={name => guard(store.update(spaceId, [name]))}
            onUninstall={name => guard(store.uninstall(spaceId, [name]))}
          />
        </Splitter.Panel>
        <Splitter.Panel min="20%">
          <LogTerminal
            source={session?.task.id ?? 'empty'}
            content={session ? session.chunks.join('') : t('deps.outputPlaceholder')}
            follow={session ? follow : undefined}
          />
        </Splitter.Panel>
      </Splitter>
      <InstallDepModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onInstall={async (specs, latest) => {
          try {
            await (latest ? store.update(spaceId, specs) : store.install(spaceId, specs))
          }
          catch (error) {
            message.error(formatError(t, error))
            throw error
          }
        }}
      />
    </Flex>
  )
}
