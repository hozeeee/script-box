import type { ReactNode } from 'react'
import { disposeSpaceModels } from '@renderer/components/editor/models'
import { useSpacesStore } from '@renderer/stores/spaces'
import { Button, Flex, Result, Spin } from 'antd'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import EditorWorkspace from './EditorWorkspace'
import SpaceHeader from './SpaceHeader'

export default function SpaceEditorPage(): ReactNode {
  const { t } = useTranslation()
  const { spaceId = '' } = useParams()
  const space = useSpacesStore(state => state.spaces.find(item => item.id === spaceId))
  const loaded = useSpacesStore(state => state.loaded)

  // Drafts live in the documents store; models are cheap to recreate, so free them on leave.
  // Deferred so the editor instance is disposed before its models.
  useEffect(() => () => queueMicrotask(() => disposeSpaceModels(spaceId)), [spaceId])

  if (!space) {
    if (!loaded)
      return <Spin className="app-loading" />
    return (
      <Result
        status="404"
        title={t('spaces.notFound')}
        extra={<Link to="/spaces"><Button type="primary">{t('common.back')}</Button></Link>}
      />
    )
  }

  return (
    <Flex vertical className="fill">
      <SpaceHeader space={space} />
      <EditorWorkspace key={space.id} space={space} />
    </Flex>
  )
}
