import type { Space } from '@shared/types'
import type { ReactNode } from 'react'
import { useMonacoTypes } from '@renderer/components/editor/useMonacoTypes'
import RunConfigDrawer from '@renderer/components/script/RunConfigDrawer'
import ScriptNameModal from '@renderer/components/script/ScriptNameModal'
import ScriptTree from '@renderer/components/script/ScriptTree'
import { runKey, useRunsStore } from '@renderer/stores/runs'
import { Empty, Splitter } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import BottomPanel, { DEPS_TAB } from './BottomPanel'
import ScriptEditorPane from './ScriptEditorPane'
import { useScriptActions } from './useScriptActions'
import { useScripts } from './useScripts'

type NameDialog = { mode: 'create' } | { mode: 'rename', name: string } | null

export default function EditorWorkspace({ space }: { space: Space }): ReactNode {
  const { t } = useTranslation()
  const { scripts, loaded, reload } = useScripts(space.id)
  const [params, setParams] = useSearchParams()
  const [bottomTab, setBottomTab] = useState(DEPS_TAB)
  const [nameDialog, setNameDialog] = useState<NameDialog>(null)
  const [configuring, setConfiguring] = useState<string | null>(null)
  const selected = params.get('script')
  const selectedFile = scripts.find(file => file.name === selected)
  const running = useRunsStore((state) => {
    const runId = selected ? state.latest[runKey(space.id, selected)] : undefined
    return !!runId && state.sessions[runId]?.record.status === 'running'
  })

  useMonacoTypes(space.id)

  const select = (name: string | null): void => {
    setParams(name ? { script: name } : {}, { replace: true })
  }

  const actions = useScriptActions({
    spaceId: space.id,
    reload,
    select,
    selected,
    onStarted: record => setBottomTab(record.id),
  })

  // Open the first script when nothing (or a vanished file) is selected
  useEffect(() => {
    if (loaded && scripts.length && !selectedFile)
      setParams({ script: scripts[0]!.name }, { replace: true })
  }, [loaded, scripts, selectedFile, setParams])

  return (
    <>
      <Splitter style={{ flex: 1, minHeight: 0 }}>
        <Splitter.Panel defaultSize={220} min={160} max="40%">
          <ScriptTree
            spaceId={space.id}
            scripts={scripts}
            selected={selected}
            onSelect={select}
            onCreate={() => setNameDialog({ mode: 'create' })}
            onImported={(names) => {
              void reload().then(() => names[0] && select(names[0]))
            }}
            onRun={name => void actions.run(name)}
            onConfigure={setConfiguring}
            onRename={name => setNameDialog({ mode: 'rename', name })}
            onRemove={actions.remove}
          />
        </Splitter.Panel>
        <Splitter.Panel>
          <Splitter orientation="vertical">
            <Splitter.Panel min="20%">
              {selectedFile
                ? (
                    <ScriptEditorPane
                      spaceId={space.id}
                      file={selectedFile}
                      running={running}
                      onRun={() => void actions.run(selectedFile.name)}
                      onStop={() => actions.stop(selectedFile.name)}
                      onConfigure={() => setConfiguring(selectedFile.name)}
                    />
                  )
                : <Empty style={{ marginTop: 120 }} description={t('editor.noScript')} />}
            </Splitter.Panel>
            <Splitter.Panel defaultSize="35%" min={120}>
              <BottomPanel spaceId={space.id} activeKey={bottomTab} onChange={setBottomTab} />
            </Splitter.Panel>
          </Splitter>
        </Splitter.Panel>
      </Splitter>

      <ScriptNameModal
        open={!!nameDialog}
        title={nameDialog?.mode === 'rename' ? t('common.rename') : t('script.new')}
        initialName={nameDialog?.mode === 'rename' ? nameDialog.name : undefined}
        onClose={() => setNameDialog(null)}
        onSubmit={name => nameDialog?.mode === 'rename' ? actions.rename(nameDialog.name, name) : actions.create(name)}
      />
      <RunConfigDrawer
        open={!!configuring}
        space={space}
        script={configuring ?? ''}
        onClose={() => setConfiguring(null)}
      />
    </>
  )
}
