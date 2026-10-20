import type { ReactNode } from 'react'
import { getPathForFile, invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { App } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  spaceId: string
  onImported: (names: string[]) => void
  children: ReactNode
}

const hasFiles = (event: React.DragEvent): boolean => event.dataTransfer.types.includes('Files')

/** Accepts script files dragged in from the OS file manager */
export default function ScriptDropZone({ spaceId, onImported, children }: Props): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [over, setOver] = useState(false)

  const drop = async (event: React.DragEvent): Promise<void> => {
    event.preventDefault()
    setOver(false)
    const paths = [...event.dataTransfer.files].map(getPathForFile).filter(Boolean)
    if (!paths.length)
      return
    try {
      const names = await invoke('script:import', spaceId, paths)
      message.success(t('script.imported', { count: names.length }))
      onImported(names)
    }
    catch (error) {
      message.error(formatError(t, error))
    }
  }

  return (
    <div
      className="fill"
      style={{ position: 'relative' }}
      onDragOver={(event) => {
        if (!hasFiles(event))
          return
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setOver(false)
      }}
      onDrop={event => void drop(event)}
    >
      {children}
      {over && <div className="drop-overlay">{t('script.dropHere')}</div>}
    </div>
  )
}
