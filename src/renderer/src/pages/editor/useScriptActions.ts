import type { RunRecord } from '@shared/types'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { disposeScriptModel } from '@renderer/components/editor/models'
import { useDocumentsStore } from '@renderer/stores/documents'
import { runKey, useRunsStore } from '@renderer/stores/runs'
import { isNpmScriptKey } from '@shared/types'
import { App } from 'antd'
import { useTranslation } from 'react-i18next'
import { useSaveGuard } from './useSaveGuard'

interface Options {
  spaceId: string
  reload: () => Promise<unknown>
  select: (name: string | null) => void
  selected: string | null
  onStarted: (record: RunRecord) => void
}

/** Create / rename / delete / run / stop for the scripts of one space */
export function useScriptActions({ spaceId, reload, select, selected, onStarted }: Options) {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const guardedSave = useSaveGuard()
  const fail = (error: unknown): void => {
    message.error(formatError(t, error))
  }

  const isRunning = (name: string): boolean => {
    const { sessions, latest } = useRunsStore.getState()
    return sessions[latest[runKey(spaceId, name)] ?? '']?.record.status === 'running'
  }

  return {
    isRunning,

    async create(name: string): Promise<void> {
      const file = await invoke('script:create', spaceId, name)
      await reload()
      select(file.name)
    },

    async rename(from: string, to: string): Promise<void> {
      if (from === to)
        return
      await invoke('script:rename', spaceId, from, to)
      useDocumentsStore.getState().rename(spaceId, from, to)
      disposeScriptModel(spaceId, from)
      await reload()
      if (selected === from)
        select(to)
    },

    remove(name: string): void {
      modal.confirm({
        title: t('script.removeConfirm', { name }),
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await invoke('script:remove', spaceId, name)
            useDocumentsStore.getState().forget(spaceId, name)
            disposeScriptModel(spaceId, name)
            await reload()
            if (selected === name)
              select(null)
          }
          catch (error) {
            fail(error)
          }
        },
      })
    },

    async run(name: string): Promise<void> {
      if (isRunning(name)) {
        message.info(t('editor.alreadyRunning'))
        return
      }
      try {
        // The runner reads from disk, so flush the draft first (npm scripts have no draft)
        if (!isNpmScriptKey(name) && !(await guardedSave(spaceId, name)))
          return
        onStarted(await useRunsStore.getState().start(spaceId, name))
      }
      catch (error) {
        fail(error)
      }
    },

    stop(name: string): void {
      const runId = useRunsStore.getState().latest[runKey(spaceId, name)]
      if (runId)
        useRunsStore.getState().stop(runId).catch(fail)
    },
  }
}
