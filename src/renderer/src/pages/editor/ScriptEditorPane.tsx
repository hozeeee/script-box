import type { ScriptFile } from '@shared/types'
import type { ReactNode } from 'react'
import { formatError } from '@renderer/api/errors'
import MissingDepsAlert from '@renderer/components/deps/MissingDepsAlert'
import CodeEditor from '@renderer/components/editor/CodeEditor'
import { scriptModelPath } from '@renderer/components/editor/models'
import { useDepsStore } from '@renderer/stores/deps'
import { docKey, isDirty, useDocumentsStore } from '@renderer/stores/documents'
import { App, Flex, Result, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import EditorToolbar from './EditorToolbar'
import { useMissingDeps } from './useMissingDeps'

interface Props {
  spaceId: string
  file: ScriptFile
  running: boolean
  onRun: () => void
  onStop: () => void
  onConfigure: () => void
}

export default function ScriptEditorPane({ spaceId, file, running, onRun, onStop, onConfigure }: Props): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const doc = useDocumentsStore(state => state.docs[docKey(spaceId, file.name)])
  const depsBusy = useDepsStore(state => !!state.tasks[spaceId] && !state.tasks[spaceId].done)
  const installDeps = useDepsStore(state => state.install)
  const missing = useMissingDeps(spaceId, file.name, doc?.saved)
  const [loadError, setLoadError] = useState<{ name: string, message: string } | null>(null)

  useEffect(() => {
    useDocumentsStore.getState()
      .open(spaceId, file.name)
      .catch(error => setLoadError({ name: file.name, message: formatError(t, error) }))
  }, [spaceId, file.name, t])

  const save = (): void => {
    useDocumentsStore.getState().save(spaceId, file.name).catch(error => message.error(formatError(t, error)))
  }

  const install = (): void => {
    installDeps(spaceId, missing).catch(error => message.error(formatError(t, error)))
  }

  if (loadError?.name === file.name)
    return <Result status="error" title={t('editor.loadFailed')} subTitle={loadError.message} />

  return (
    <Flex vertical className="fill">
      <EditorToolbar
        name={file.name}
        dirty={isDirty(doc)}
        running={running}
        onSave={save}
        onRun={onRun}
        onStop={onStop}
        onConfigure={onConfigure}
      />
      <MissingDepsAlert missing={missing} busy={depsBusy} onInstall={install} />
      <div style={{ flex: 1, minHeight: 0 }}>
        {doc
          ? (
              <CodeEditor
                path={scriptModelPath(spaceId, file.name)}
                language={file.language}
                value={doc.content}
                onChange={content => useDocumentsStore.getState().edit(spaceId, file.name, content)}
                onSave={save}
                onRun={onRun}
              />
            )
          : <Spin style={{ margin: 24 }} />}
      </div>
    </Flex>
  )
}
