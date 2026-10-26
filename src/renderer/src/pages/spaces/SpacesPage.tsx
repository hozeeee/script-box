import type { RuntimeKind, Space } from '@shared/types'
import type { DragEvent, ReactNode } from 'react'
import type { PickedProject } from './SpaceFormModal'
import { CheckOutlined, DragOutlined, FolderAddOutlined, PlusOutlined } from '@ant-design/icons'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { useDocumentsStore } from '@renderer/stores/documents'
import { useSpacesStore } from '@renderer/stores/spaces'
import { App, Button, Col, Empty, Flex, Row, Typography } from 'antd'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import SpaceCard from './SpaceCard'
import SpaceFormModal from './SpaceFormModal'

const KINDS: RuntimeKind[] = ['node', 'python']

/** Spaces saved before Python support have no runtime and are Node.js spaces */
const kindOf = (space: Space): RuntimeKind => space.runtime?.kind ?? 'node'

export default function SpacesPage(): ReactNode {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const { spaces, remove, reorder } = useSpacesStore()
  const [editing, setEditing] = useState<{ open: boolean, space?: Space, project?: PickedProject, runtimeKind?: RuntimeKind }>({ open: false })
  const [picking, setPicking] = useState<RuntimeKind | null>(null)
  const [sorting, setSorting] = useState(false)
  const [orderedIds, setOrderedIds] = useState<string[]>([])
  const [sortingSaving, setSortingSaving] = useState(false)
  const [draggingId, setDraggingId] = useState<string>()
  const orderRef = useRef<string[]>([])
  const didDropRef = useRef(false)

  const confirmRemove = (space: Space): void => {
    modal.confirm({
      title: t('spaces.deleteConfirm', { name: space.name }),
      content: space.projectPath
        ? t('spaces.deleteProjectContent', { path: space.projectPath })
        : t('spaces.deleteContent'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await remove(space.id)
          useDocumentsStore.getState().forget(space.id)
        }
        catch (error) {
          message.error(formatError(t, error))
        }
      },
    })
  }

  const pickProject = async (kind: RuntimeKind): Promise<void> => {
    setPicking(kind)
    try {
      const path = await invoke('app:select-directory')
      if (!path)
        return
      const info = await invoke('space:inspect-project', path, kind)
      setEditing({ open: true, project: { path, info }, runtimeKind: kind })
    }
    catch (error) {
      message.error(formatError(t, error))
    }
    finally {
      setPicking(null)
    }
  }

  const resetOrder = (): void => {
    const ids = useSpacesStore.getState().spaces.map(space => space.id)
    orderRef.current = ids
    setOrderedIds(ids)
  }

  const toggleSorting = (): void => {
    if (sorting) {
      setSorting(false)
      setDraggingId(undefined)
      return
    }
    const ids = spaces.map(space => space.id)
    orderRef.current = ids
    setOrderedIds(ids)
    setSorting(true)
  }

  const spacesById = new Map(spaces.map(space => [space.id, space]))

  /** Cards can only be reordered within their own runtime section */
  const sameKind = (sourceId: string | undefined, targetId: string): boolean => {
    const source = sourceId ? spacesById.get(sourceId) : undefined
    const target = spacesById.get(targetId)
    return !!source && !!target && kindOf(source) === kindOf(target)
  }

  const moveSpace = (sourceId: string, targetId: string): void => {
    if (!sameKind(sourceId, targetId))
      return
    const current = orderRef.current
    const sourceIndex = current.indexOf(sourceId)
    const targetIndex = current.indexOf(targetId)
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex)
      return
    const next = [...current]
    next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, sourceId)
    orderRef.current = next
    setOrderedIds(next)
  }

  const persistOrder = async (): Promise<void> => {
    setSortingSaving(true)
    try {
      await reorder(orderRef.current)
    }
    catch (error) {
      resetOrder()
      message.error(formatError(t, error))
    }
    finally {
      setSortingSaving(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string): void => {
    event.preventDefault()
    const sourceId = event.dataTransfer.getData('text/plain') || draggingId
    if (sourceId)
      moveSpace(sourceId, targetId)
    didDropRef.current = true
    setDraggingId(undefined)
    void persistOrder()
  }

  const handleDragEnd = (): void => {
    if (!didDropRef.current)
      resetOrder()
    didDropRef.current = false
    setDraggingId(undefined)
  }

  const displayedSpaces = sorting
    ? orderedIds.map(id => spacesById.get(id)).filter((space): space is Space => space !== undefined)
    : spaces
  const sections = KINDS.map(kind => ({ kind, items: displayedSpaces.filter(space => kindOf(space) === kind) }))

  return (
    <div className="page">
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>{t('spaces.title')}</Typography.Title>
        {sections.some(section => section.items.length > 1) && (
          <Button
            type={sorting ? 'primary' : 'default'}
            icon={sorting ? <CheckOutlined /> : <DragOutlined />}
            loading={sorting && sortingSaving}
            onClick={toggleSorting}
          >
            {t(sorting ? 'spaces.finishSorting' : 'spaces.sort')}
          </Button>
        )}
      </Flex>

      <Flex vertical gap={24}>
        {sections.map(({ kind, items }) => {
          const label = t(kind === 'python' ? 'runtimes.tabPython' : 'runtimes.tabNode')
          return (
            <section key={kind}>
              <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
                <Flex align="baseline" gap={8}>
                  <Typography.Title level={5} style={{ margin: 0 }}>{label}</Typography.Title>
                  <Typography.Text type="secondary">{items.length}</Typography.Text>
                </Flex>
                <Flex gap={8}>
                  <Button icon={<FolderAddOutlined />} disabled={sorting} loading={picking === kind} onClick={() => void pickProject(kind)}>
                    {t('spaces.importProject')}
                  </Button>
                  <Button type="primary" icon={<PlusOutlined />} disabled={sorting} onClick={() => setEditing({ open: true, runtimeKind: kind })}>
                    {t('spaces.create')}
                  </Button>
                </Flex>
              </Flex>

              {items.length === 0
                ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('spaces.emptyKind', { kind: label })} />
                : (
                    <Row gutter={[12, 12]}>
                      {items.map(space => (
                        <Col
                          key={space.id}
                          xs={24}
                          sm={12}
                          md={8}
                          xl={6}
                          xxl={4}
                          draggable={sorting && !sortingSaving}
                          className={sorting ? `space-sortable${draggingId === space.id ? ' dragging' : ''}` : undefined}
                          onDragStart={sorting && !sortingSaving
                            ? (event) => {
                                didDropRef.current = false
                                setDraggingId(space.id)
                                event.dataTransfer.effectAllowed = 'move'
                                event.dataTransfer.setData('text/plain', space.id)
                              }
                            : undefined}
                          onDragOver={sorting
                            ? (event) => {
                                // Not accepting the drop shows the "not allowed" cursor across sections
                                if (!sameKind(draggingId, space.id))
                                  return
                                event.preventDefault()
                                event.dataTransfer.dropEffect = 'move'
                              }
                            : undefined}
                          onDrop={sorting ? event => handleDrop(event, space.id) : undefined}
                          onDragEnd={sorting ? handleDragEnd : undefined}
                        >
                          <SpaceCard
                            space={space}
                            sorting={sorting}
                            onOpen={() => navigate(`/spaces/${space.id}`)}
                            onEdit={() => setEditing({ open: true, space })}
                            onRemove={() => confirmRemove(space)}
                            onOpenDir={() => invoke('space:open-dir', space.id).catch(error => message.error(formatError(t, error)))}
                          />
                        </Col>
                      ))}
                    </Row>
                  )}
            </section>
          )
        })}
      </Flex>

      <SpaceFormModal
        open={editing.open}
        space={editing.space}
        project={editing.project}
        runtimeKind={editing.runtimeKind ?? editing.space?.runtime?.kind ?? 'node'}
        // Keep the space while the close animation plays so the title doesn't flip to "create"
        onClose={() => setEditing(prev => ({ ...prev, open: false }))}
        onSaved={(space) => {
          if (!editing.space)
            navigate(`/spaces/${space.id}`)
        }}
      />
    </div>
  )
}
