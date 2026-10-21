import type { ProjectEntry, ScriptFile } from '@shared/types'
import type { MenuProps, TreeDataNode } from 'antd'
import type { Key, ReactNode } from 'react'
import { CaretRightOutlined, DeleteOutlined, EditOutlined, FileOutlined, FolderOpenOutlined, FolderOutlined, LinkOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { docKey, isDirty, useDocumentsStore } from '@renderer/stores/documents'
import { runKey, useRunsStore } from '@renderer/stores/runs'
import { App, Badge, Button, Dropdown, Empty, Flex, Spin, Tooltip, Tree, Typography } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  spaceId: string
  selected: string | null
  refreshToken: unknown
  onSelect: (file: ScriptFile) => void
  onCreate: (directory?: string) => void
  onRefresh: () => void
  onRun: (name: string) => void
  onConfigure: (name: string) => void
  onRename: (name: string) => void
  onRemove: (name: string) => void
}

interface FileNode extends TreeDataNode {
  key: string
  entry: ProjectEntry
  children?: FileNode[]
}

function iconOf(entry: ProjectEntry): ReactNode {
  if (entry.kind === 'directory')
    return <FolderOutlined />
  if (entry.kind === 'symlink')
    return <LinkOutlined />
  if (!entry.script)
    return <FileOutlined />
  const ts = entry.script.language === 'typescript'
  return <span style={{ fontSize: 10, fontWeight: 700, color: ts ? '#3178c6' : '#d4a72c' }}>{ts ? 'TS' : 'JS'}</span>
}

/** 所有文件按需逐层展示，包括隐藏文件、忽略文件与空目录 */
export default function ProjectFileTree(props: Props): ReactNode {
  const { spaceId, selected, refreshToken, onSelect, onCreate } = props
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const [directories, setDirectories] = useState<Record<string, ProjectEntry[]>>({})
  const [expanded, setExpanded] = useState<Key[]>([])
  const [error, setError] = useState<string | null>(null)
  const loadedDirectoriesRef = useRef(new Set<string>(['']))
  const generationRef = useRef(0)
  const docs = useDocumentsStore(state => state.docs)
  const sessions = useRunsStore(state => state.sessions)
  const latest = useRunsStore(state => state.latest)

  useEffect(() => {
    let active = true
    const version = ++generationRef.current
    const parts = selected?.split('/').slice(0, -1) ?? []
    const ancestors = parts.map((_, index) => parts.slice(0, index + 1).join('/'))
    const paths = [...new Set([...loadedDirectoriesRef.current, ...ancestors])]
    void Promise.all(paths.map(async (directory) => {
      const entries = await invoke('script:entries', spaceId, directory).catch((error) => {
        if (!directory)
          throw error
        return []
      })
      return [directory, entries] as const
    })).then((entries) => {
      if (!active || version !== generationRef.current)
        return
      loadedDirectoriesRef.current = new Set(paths)
      setDirectories(Object.fromEntries(entries))
      setExpanded(prev => [...new Set([...prev, ...ancestors])])
      setError(null)
    }).catch((error) => {
      if (active) {
        setDirectories({ '': [] })
        setError(formatError(t, error))
      }
    })
    return () => {
      active = false
    }
  }, [spaceId, refreshToken, selected, t])

  const tree = useMemo(() => {
    const build = (directory: string): FileNode[] => (directories[directory] ?? []).map(entry => ({
      key: entry.name,
      title: entry.name.split('/').at(-1),
      entry,
      isLeaf: entry.kind !== 'directory' || directories[entry.name]?.length === 0,
      children: entry.kind === 'directory' && directories[entry.name] ? build(entry.name) : undefined,
      icon: iconOf(entry),
    }))
    return build('')
  }, [directories])

  const load = async (node: FileNode): Promise<void> => {
    if (directories[node.key])
      return
    const version = generationRef.current
    try {
      const entries = await invoke('script:entries', spaceId, node.key)
      if (version !== generationRef.current)
        return
      loadedDirectoriesRef.current.add(node.key)
      setDirectories(prev => ({ ...prev, [node.key]: entries }))
    }
    catch (error) {
      message.error(formatError(t, error))
      throw error
    }
  }

  const reveal = async (name: string): Promise<void> => {
    try {
      await invoke('script:reveal', spaceId, name)
    }
    catch (error) {
      message.error(formatError(t, error))
    }
  }

  const menuOf = (entry: ProjectEntry): MenuProps => {
    const name = entry.name
    const items: MenuProps['items'] = [
      { key: 'reveal', icon: <FolderOpenOutlined />, label: t('common.openDir'), onClick: () => void reveal(name) },
    ]
    if (entry.kind === 'directory')
      items.unshift({ key: 'new', icon: <PlusOutlined />, label: t('script.new'), onClick: () => onCreate(name) })
    if (entry.script) {
      items.unshift(
        { key: 'run', icon: <CaretRightOutlined />, label: t('editor.run'), onClick: () => props.onRun(name) },
        { key: 'configure', icon: <SettingOutlined />, label: t('runConfig.open'), onClick: () => props.onConfigure(name) },
        { key: 'rename', icon: <EditOutlined />, label: t('common.rename'), onClick: () => props.onRename(name) },
        { key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('common.delete'), onClick: () => props.onRemove(name) },
      )
    }
    return { items }
  }

  return (
    <Flex vertical className="fill">
      <Flex align="center" justify="space-between" style={{ padding: '8px 8px 8px 16px' }}>
        <Typography.Text strong>{t('editor.files')}</Typography.Text>
        <Flex>
          <Tooltip title={t('script.new')}><Button type="text" size="small" icon={<PlusOutlined />} onClick={() => onCreate()} /></Tooltip>
          <Tooltip title={t('script.refresh')}><Button type="text" size="small" icon={<ReloadOutlined />} onClick={props.onRefresh} /></Tooltip>
        </Flex>
      </Flex>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 6px' }}>
        {!directories[''] && <Spin style={{ display: 'block', marginTop: 24 }} />}
        {directories['']?.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error || t('script.emptyDirectory')} />}
        <Tree<FileNode>
          className="script-tree"
          blockNode
          showIcon
          treeData={tree}
          selectedKeys={selected ? [selected] : []}
          expandedKeys={expanded}
          onExpand={setExpanded}
          loadData={load}
          loadedKeys={Object.keys(directories).filter(Boolean)}
          onSelect={(_, { node }) => {
            if (node.entry.script) {
              onSelect(node.entry.script)
            }
            else if (node.entry.kind === 'directory') {
              void load(node).then(() => setExpanded(prev => prev.includes(node.key) ? prev.filter(key => key !== node.key) : [...prev, node.key])).catch(() => {})
            }
            else {
              modal.confirm({
                title: t('editor.unsupportedFile'),
                content: t('editor.viewExternally', { name: node.entry.name }),
                okText: t('common.openDir'),
                cancelText: t('common.cancel'),
                onOk: () => reveal(node.entry.name),
              })
            }
          }}
          titleRender={({ entry, title }) => (
            <Dropdown trigger={['contextMenu']} menu={menuOf(entry)}>
              <span className="script-tree-title" title={entry.name}>
                <span className="script-item-name">{String(title)}</span>
                {entry.script && isDirty(docs[docKey(spaceId, entry.name)]) && <Badge status="warning" />}
                {entry.script && sessions[latest[runKey(spaceId, entry.name)] ?? '']?.record.status === 'running' && <Badge status="processing" />}
                {!entry.script && entry.kind !== 'directory' && (
                  <Button
                    type="text"
                    size="small"
                    title={t('common.openDir')}
                    icon={<FolderOpenOutlined />}
                    onClick={(event) => {
                      event.stopPropagation()
                      void reveal(entry.name)
                    }}
                  />
                )}
              </span>
            </Dropdown>
          )}
        />
      </div>
    </Flex>
  )
}
