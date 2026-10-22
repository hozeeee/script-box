import type { ScriptFile } from '@shared/types'
import type { MenuProps, TreeDataNode } from 'antd'
import type { Key, ReactNode } from 'react'
import { CaretRightOutlined, DeleteOutlined, EditOutlined, FolderOpenOutlined, FolderOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons'
import { docKey, isDirty, useDocumentsStore } from '@renderer/stores/documents'
import { runKey, useRunsStore } from '@renderer/stores/runs'
import { Badge, Button, Dropdown, Empty, Flex, Tooltip, Tree, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ImportScriptButton from './ImportScriptButton'
import ScriptDropZone from './ScriptDropZone'

interface Props {
  spaceId: string
  scripts: ScriptFile[]
  selected: string | null
  /** Imported project: no copy-in import, files may live in sub folders */
  project?: boolean
  /** Error of the last reload, shown instead of an empty list */
  error?: string | null
  /** Extra content below the tree, e.g. a truncation notice or npm scripts */
  footer?: ReactNode
  onSelect: (name: string) => void
  /** `dir` is the folder the script should be created in */
  onCreate: (dir?: string) => void
  onRefresh: () => void
  onImported: (names: string[]) => void
  onRun: (name: string) => void
  onConfigure: (name: string) => void
  onRename: (name: string) => void
  onRemove: (name: string) => void
}

interface ScriptNode extends TreeDataNode {
  key: string
  /** Folder path for directories */
  dir?: string
  file?: ScriptFile
  children?: ScriptNode[]
}

// `:` can't appear in script paths, so folder keys never clash with file names
const DIR_KEY = 'dir:'

function LanguageBadge({ file }: { file: ScriptFile }): ReactNode {
  if (file.language === 'python') {
    return (
      <span style={{ fontSize: 10, fontWeight: 700, width: 18, display: 'inline-block', color: '#3572a5' }}>
        PY
      </span>
    )
  }
  const ts = file.language === 'typescript'
  return (
    <span style={{ fontSize: 10, fontWeight: 700, width: 18, display: 'inline-block', color: ts ? '#3178c6' : '#d4a72c' }}>
      {ts ? 'TS' : 'JS'}
    </span>
  )
}

function sortNodes(nodes: ScriptNode[]): ScriptNode[] {
  nodes.sort((a, b) => {
    if (!!a.dir !== !!b.dir)
      return a.dir ? -1 : 1
    return String(a.title).localeCompare(String(b.title))
  })
  for (const node of nodes) {
    if (node.children)
      sortNodes(node.children)
  }
  return nodes
}

/** Turn `a/b/c.ts` style names into a folder tree */
function buildTree(scripts: ScriptFile[]): ScriptNode[] {
  const root: ScriptNode[] = []
  const dirs = new Map<string, ScriptNode>()
  for (const file of scripts) {
    const parts = file.name.split('/')
    let level = root
    for (let index = 0; index < parts.length - 1; index++) {
      const dir = parts.slice(0, index + 1).join('/')
      let node = dirs.get(dir)
      if (!node) {
        node = {
          key: `${DIR_KEY}${dir}`,
          title: parts[index],
          dir,
          children: [],
          icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
        }
        dirs.set(dir, node)
        level.push(node)
      }
      level = node.children!
    }
    level.push({ key: file.name, title: parts.at(-1), isLeaf: true, file, icon: <LanguageBadge file={file} /> })
  }
  return sortNodes(root)
}

/** Folder keys containing `name`, so the selected file is visible */
function ancestorKeys(name: string): string[] {
  const parts = name.split('/').slice(0, -1)
  return parts.map((_, index) => `${DIR_KEY}${parts.slice(0, index + 1).join('/')}`)
}

export default function ScriptTree(props: Props): ReactNode {
  const { spaceId, scripts, selected, project = false, error, footer, onSelect, onCreate, onImported } = props
  const { t } = useTranslation()
  const docs = useDocumentsStore(state => state.docs)
  const sessions = useRunsStore(state => state.sessions)
  const latest = useRunsStore(state => state.latest)
  const tree = useMemo(() => buildTree(scripts), [scripts])
  const [expanded, setExpanded] = useState<Key[]>([])
  const expandedKeys = useMemo(
    () => selected ? [...new Set([...expanded, ...ancestorKeys(selected)])] : expanded,
    [expanded, selected],
  )

  const isRunning = (name: string): boolean =>
    sessions[latest[runKey(spaceId, name)] ?? '']?.record.status === 'running'

  const fileMenu = (name: string): MenuProps => ({
    items: [
      { key: 'run', icon: <CaretRightOutlined />, label: t('editor.run'), onClick: () => props.onRun(name) },
      { key: 'config', icon: <SettingOutlined />, label: t('runConfig.open'), onClick: () => props.onConfigure(name) },
      { key: 'rename', icon: <EditOutlined />, label: t('common.rename'), onClick: () => props.onRename(name) },
      { type: 'divider' },
      { key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('common.delete'), onClick: () => props.onRemove(name) },
    ],
  })

  const dirMenu = (dir: string): MenuProps => ({
    items: [{ key: 'new', icon: <PlusOutlined />, label: t('script.new'), onClick: () => onCreate(dir) }],
  })

  const toggle = (key: string): void => {
    setExpanded(prev => prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key])
  }

  const renderTitle = (node: ScriptNode): ReactNode => {
    if (node.dir) {
      return (
        <Dropdown trigger={['contextMenu']} menu={dirMenu(node.dir)}>
          <span className="script-tree-title" title={node.dir}>
            <span className="script-item-name">{String(node.title)}</span>
          </span>
        </Dropdown>
      )
    }
    const file = node.file!
    return (
      <Dropdown trigger={['contextMenu']} menu={fileMenu(file.name)}>
        <span className="script-tree-title" title={file.name}>
          <span className="script-item-name">{String(node.title)}</span>
          {isDirty(docs[docKey(spaceId, file.name)]) && <Badge status="warning" />}
          {isRunning(file.name) && <Badge status="processing" />}
        </span>
      </Dropdown>
    )
  }

  const content = (
    <Flex vertical className="fill">
      <Flex align="center" justify="space-between" style={{ padding: '8px 8px 8px 16px' }}>
        <Typography.Text strong>{t('editor.scripts')}</Typography.Text>
        <Flex>
          <Tooltip title={t('script.new')}>
            <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => onCreate()} />
          </Tooltip>
          <Tooltip title={t('script.refresh')}>
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={props.onRefresh} />
          </Tooltip>
          {!project && <ImportScriptButton spaceId={spaceId} onImported={onImported} />}
        </Flex>
      </Flex>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 6px' }}>
        {scripts.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={error ? <Typography.Text type="danger">{error}</Typography.Text> : t('script.empty')}
          />
        )}
        {scripts.length > 0 && (
          <Tree<ScriptNode>
            className="script-tree"
            blockNode
            showIcon
            treeData={tree}
            selectedKeys={selected ? [selected] : []}
            expandedKeys={expandedKeys}
            onExpand={keys => setExpanded(keys)}
            onSelect={(_, info) => {
              if (info.node.file)
                onSelect(info.node.file.name)
              else
                toggle(info.node.key)
            }}
            titleRender={renderTitle}
          />
        )}
      </div>
      {footer}
      {!project && (
        <Typography.Text type="secondary" style={{ fontSize: 12, padding: '8px 16px' }}>
          {t('script.dropHint')}
        </Typography.Text>
      )}
    </Flex>
  )

  // Imported projects are edited in place, nothing gets copied in
  return project ? content : <ScriptDropZone spaceId={spaceId} onImported={onImported}>{content}</ScriptDropZone>
}
