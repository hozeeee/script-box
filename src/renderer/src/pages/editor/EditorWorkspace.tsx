import type { ProjectInfo, Space } from '@shared/types'
import type { ReactNode } from 'react'
import { invoke } from '@renderer/api'
import { useMonacoTypes } from '@renderer/components/editor/useMonacoTypes'
import { useProjectModels } from '@renderer/components/editor/useProjectModels'
import NpmScriptsPanel from '@renderer/components/script/NpmScriptsPanel'
import RunConfigDrawer from '@renderer/components/script/RunConfigDrawer'
import ScriptNameModal from '@renderer/components/script/ScriptNameModal'
import ScriptTree from '@renderer/components/script/ScriptTree'
import { useDocumentsStore } from '@renderer/stores/documents'
import { runKey, useRunsStore } from '@renderer/stores/runs'
import { Alert, Empty, Splitter } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import BottomPanel, { DEPS_TAB } from './BottomPanel'
import ScriptEditorPane from './ScriptEditorPane'
import { useScriptActions } from './useScriptActions'
import { useScripts } from './useScripts'

type NameDialog = { open: boolean } & ({ mode: 'create', dir?: string } | { mode: 'rename', name: string })

export default function EditorWorkspace({ space }: { space: Space }): ReactNode {
  const { t } = useTranslation()
  const isProject = !!space.projectPath
  const { scripts, loaded, error, reload } = useScripts(space.id)
  const [params, setParams] = useSearchParams()
  const [bottomTab, setBottomTab] = useState(DEPS_TAB)
  const [nameDialog, setNameDialog] = useState<NameDialog>({ open: false, mode: 'create' })
  const [configuring, setConfiguring] = useState<string | null>(null)
  const [projectInfo, setProjectInfo] = useState<{ spaceId: string, info: ProjectInfo } | null>(null)
  const selected = params.get('script')
  const selectedFile = scripts.find(file => file.name === selected)
  const running = useRunsStore((state) => {
    const runId = selected ? state.latest[runKey(space.id, selected)] : undefined
    return !!runId && state.sessions[runId]?.record.status === 'running'
  })
  const info = projectInfo?.spaceId === space.id ? projectInfo.info : null

  useMonacoTypes(space.id)
  useProjectModels(space, scripts)

  const loadProjectInfo = useCallback(async () => {
    if (!isProject)
      return
    try {
      setProjectInfo({ spaceId: space.id, info: await invoke('space:project-info', space.id) })
    }
    catch {
      setProjectInfo(null)
    }
  }, [space.id, isProject])

  /** Pick up changes made outside ScriptBox: file list, package.json scripts, clean open documents */
  const refresh = useCallback(async (silent = false) => {
    const files = await reload({ silent })
    await Promise.all([loadProjectInfo(), useDocumentsStore.getState().sync(space.id, files)])
  }, [reload, loadProjectInfo, space.id])

  useEffect(() => {
    void loadProjectInfo()
  }, [loadProjectInfo])

  useEffect(() => {
    const onFocus = (): void => void refresh(true)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

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

  // Open the first script when nothing (or a vanished file) is selected. Projects don't
  // auto-open an arbitrary file, they only drop a selection that no longer exists.
  useEffect(() => {
    if (!loaded || selectedFile)
      return
    if (!isProject && scripts.length)
      setParams({ script: scripts[0]!.name }, { replace: true })
    else if (isProject && selected && !error)
      setParams({}, { replace: true })
  }, [loaded, scripts, selected, selectedFile, setParams, isProject, error])

  return (
    <>
      <Splitter style={{ flex: 1, minHeight: 0 }}>
        <Splitter.Panel defaultSize={isProject ? 260 : 220} min={160} max="40%">
          <ScriptTree
            spaceId={space.id}
            scripts={scripts}
            selected={selected}
            project={isProject}
            error={error}
            footer={isProject && (
              <>
                {info?.truncated && <Alert type="warning" showIcon banner title={t('script.truncated')} />}
                {info && (
                  <NpmScriptsPanel
                    spaceId={space.id}
                    info={info}
                    onRun={key => void actions.run(key)}
                    onStop={actions.stop}
                    onConfigure={setConfiguring}
                  />
                )}
              </>
            )}
            onSelect={select}
            onCreate={dir => setNameDialog({ open: true, mode: 'create', dir })}
            onRefresh={() => void refresh()}
            onImported={(names) => {
              void reload().then(() => names[0] && select(names[0]))
            }}
            onRun={name => void actions.run(name)}
            onConfigure={setConfiguring}
            onRename={name => setNameDialog({ open: true, mode: 'rename', name })}
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
                : <Empty style={{ marginTop: 120 }} description={t(isProject ? 'editor.noScriptProject' : 'editor.noScript')} />}
            </Splitter.Panel>
            <Splitter.Panel defaultSize="35%" min={120}>
              <BottomPanel spaceId={space.id} activeKey={bottomTab} onChange={setBottomTab} />
            </Splitter.Panel>
          </Splitter>
        </Splitter.Panel>
      </Splitter>

      <ScriptNameModal
        open={nameDialog.open}
        title={nameDialog.mode === 'rename' ? t('common.rename') : t('script.new')}
        allowPath={isProject}
        initialName={nameDialog.mode === 'rename' ? nameDialog.name : nameDialog.dir && `${nameDialog.dir}/`}
        // Keep the mode while the close animation plays so the title doesn't flip to "new"
        onClose={() => setNameDialog(prev => ({ ...prev, open: false }))}
        onSubmit={name => nameDialog.mode === 'rename' ? actions.rename(nameDialog.name, name) : actions.create(name)}
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
