import type { Space } from '@shared/types'
import type { ReactNode } from 'react'
import { PlusOutlined } from '@ant-design/icons'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { useDocumentsStore } from '@renderer/stores/documents'
import { useSpacesStore } from '@renderer/stores/spaces'
import { App, Button, Col, Empty, Flex, Row, Typography } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import SpaceCard from './SpaceCard'
import SpaceFormModal from './SpaceFormModal'

export default function SpacesPage(): ReactNode {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const { spaces, remove } = useSpacesStore()
  const [editing, setEditing] = useState<{ open: boolean, space?: Space }>({ open: false })

  const confirmRemove = (space: Space): void => {
    modal.confirm({
      title: t('spaces.deleteConfirm', { name: space.name }),
      content: t('spaces.deleteContent'),
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

  return (
    <div className="page">
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>{t('spaces.title')}</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ open: true })}>
          {t('spaces.create')}
        </Button>
      </Flex>

      {spaces.length === 0
        ? (
            <Empty description={t('spaces.empty')} style={{ marginTop: 80 }}>
              <Button type="primary" onClick={() => setEditing({ open: true })}>{t('spaces.create')}</Button>
            </Empty>
          )
        : (
            <Row gutter={[16, 16]}>
              {spaces.map(space => (
                <Col key={space.id} xs={24} sm={12} lg={8} xxl={6}>
                  <SpaceCard
                    space={space}
                    onOpen={() => navigate(`/spaces/${space.id}`)}
                    onEdit={() => setEditing({ open: true, space })}
                    onRemove={() => confirmRemove(space)}
                    onOpenDir={() => void invoke('space:open-dir', space.id)}
                  />
                </Col>
              ))}
            </Row>
          )}

      <SpaceFormModal
        open={editing.open}
        space={editing.space}
        onClose={() => setEditing({ open: false })}
        onSaved={(space) => {
          if (!editing.space)
            navigate(`/spaces/${space.id}`)
        }}
      />
    </div>
  )
}
