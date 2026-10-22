import type { ProjectInfo, Space } from '@shared/types'
import type { ReactNode } from 'react'
import { invoke } from '@renderer/api'
import { useMonacoTypes } from '@renderer/components/editor/useMonacoTypes'
import { useProjectModels } from '@renderer/components/editor/useProjectModels'
import NpmScriptsPanel from '@renderer/components/script/NpmScriptsPanel'
import ProjectFileTree from '@renderer/components/script/ProjectFileTree'
import RunConfigDrawer from '@renderer/components/script/RunConfigDrawer'
import ScriptNameModal from '@renderer/components/script/ScriptNameModal'
import ScriptTree from '@renderer/components/script/ScriptTree'
import { useDocumentsStore } from '@renderer/stores/documents'
import { runKey, useRunsStore } from '@renderer/stores/runs'
import { Empty, Splitter } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import BottomPanel, { DEPS_TAB, HISTORY_TAB } from './BottomPanel'
import ScriptEditorPane from './ScriptEditorPane'
import { useScriptActions } from './useScriptActions'
import { useScripts } from './useScripts'

type NameDialog = { open: boolean } & ({ mode: 'create', dir?: string } | { mode: 'rename', name: string })

export default function EditorWorkspace({ space }: { space: Space }): ReactNode {
  const { t } = useTranslation()
  const isProject = !!space.projectPath
  const { scripts, loaded, error, reload } = useScripts(space.id)
  const [params, setParams] = useSearchParams()
  const [bottomTab, setBottomTab] = useState(space.runtime.kind === 'node' ? DEPS_TAB : HISTORY_TAB)
  const [nameDialog, setNameDialog] = useState<NameDialog>({ open: false, mode: 'create' })
  const [configuring, setConfiguring] = useState<string | null>(null)
  const [projectInfo, setProjectInfo] = useState<{ spaceId: string, info: ProjectInfo } | null>(null)
  const selected = params.get('script')
  // 工程树按需加载，忽略目录中的脚本也能打开，不依赖后台源码扫描列表。
  const selectedFile = useMemo(() => scripts.find(file => file.name === selected)
    ?? (isProject && selected && /\.(?:[cm]?[jt]s|py)$/i.test(selected) && !/\.d\.[cm]?ts$/i.test(selected)
      ? { name: selected, language: (/\.py$/i.test(selected) ? 'python' : /\.[cm]?ts$/i.test(selected) ? 'typescript' : 'javascript') as 'python' | 'typescript' | 'javascript', size: 0, mtime: 0 }
      : undefined), [scripts, isProject, selected])
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

  // 普通空间自动选择首个脚本，工程空间的选择由按需加载的文件树管理。
  useEffect(() => {
    if (!loaded || selectedFile)
      return
    if (!isProject && scripts.length)
      setParams({ script: scripts[0]!.name }, { replace: true })
  }, [loaded, scripts, selected, selectedFile, setParams, isProject, error])

  const treeActions = {
    onCreate: (dir?: string) => setNameDialog({ open: true, mode: 'create', dir }),
    onRefresh: () => void refresh(),
    onRun: (name: string) => void actions.run(name),
    onConfigure: setConfiguring,
    onRename: (name: string) => setNameDialog({ open: true, mode: 'rename', name }),
    onRemove: actions.remove,
  }

  return (
    <>
      <Splitter style={{ flex: 1, minHeight: 0 }}>
        <Splitter.Panel defaultSize={isProject ? 260 : 220} min={160} max="40%">
          {isProject
            ? (
                <Splitter orientation="vertical">
                  <Splitter.Panel min={100}>
                    <ProjectFileTree
                      key={`${space.id}/${space.projectPath}`}
                      spaceId={space.id}
                      selected={selected}
                      refreshToken={scripts}
                      onSelect={file => select(file.name)}
                      {...treeActions}
                    />
                  </Splitter.Panel>
                  <Splitter.Panel defaultSize="35%" min={100}>
                    {info && space.runtime.kind === 'node' && (
                      <NpmScriptsPanel
                        spaceId={space.id}
                        info={info}
                        onRun={key => void actions.run(key)}
                        onStop={actions.stop}
                        onConfigure={setConfiguring}
                      />
                    )}
                  </Splitter.Panel>
                </Splitter>
              )
            : (
                <ScriptTree
                  spaceId={space.id}
                  scripts={scripts}
                  selected={selected}
                  error={error}
                  onSelect={select}
                  onImported={(names) => {
                    void reload().then(() => names[0] && select(names[0]))
                  }}
                  {...treeActions}
                />
              )}
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
              <BottomPanel spaceId={space.id} runtimeKind={space.runtime.kind} activeKey={bottomTab} onChange={setBottomTab} />
            </Splitter.Panel>
          </Splitter>
        </Splitter.Panel>
      </Splitter>

      <ScriptNameModal
        open={nameDialog.open}
        title={nameDialog.mode === 'rename' ? t('common.rename') : t('script.new')}
        allowPath={isProject}
        runtimeKind={space.runtime.kind}
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
