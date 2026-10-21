import { ExternalChangeError, useDocumentsStore } from '@renderer/stores/documents'
import { App, Button, Flex } from 'antd'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

type Choice = 'overwrite' | 'reload' | 'cancel'

/**
 * Save a draft, asking whether to overwrite or reload when the file was
 * modified outside the editor. Resolves to false when the user canceled.
 */
export function useSaveGuard(): (spaceId: string, name: string) => Promise<boolean> {
  const { t } = useTranslation()
  const { modal } = App.useApp()

  return useCallback(async (spaceId, name) => {
    const store = useDocumentsStore.getState()
    try {
      await store.save(spaceId, name)
      return true
    }
    catch (error) {
      if (!(error instanceof ExternalChangeError))
        throw error
    }

    const choice = await new Promise<Choice>((resolve) => {
      let destroy = (): void => {}
      const pick = (value: Choice) => (): void => {
        destroy()
        resolve(value)
      }
      const instance = modal.confirm({
        title: t('editor.externalChangeTitle'),
        content: t('editor.externalChangeContent', { name }),
        closable: true,
        onCancel: () => resolve('cancel'),
        footer: (
          <Flex justify="end" gap={8} style={{ marginTop: 16 }}>
            <Button onClick={pick('cancel')}>{t('common.cancel')}</Button>
            <Button onClick={pick('reload')}>{t('editor.reloadFromDisk')}</Button>
            <Button type="primary" danger onClick={pick('overwrite')}>{t('editor.overwrite')}</Button>
          </Flex>
        ),
      })
      destroy = instance.destroy
    })

    if (choice === 'overwrite')
      await store.save(spaceId, name, { force: true })
    else if (choice === 'reload')
      await store.reload(spaceId, name)
    return choice !== 'cancel'
  }, [modal, t])
}
