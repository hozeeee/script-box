import type { ReactNode } from 'react'
import { useAppTheme } from '@renderer/hooks/useAppTheme'
import { resolveLocale } from '@renderer/i18n'
import { useSettingsStore } from '@renderer/stores/settings'
import { App as AntApp, ConfigProvider, theme } from 'antd'
import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export function Providers({ children }: { children: ReactNode }): ReactNode {
  const { i18n } = useTranslation()
  const localeSetting = useSettingsStore(state => state.settings?.locale ?? 'system')
  const mode = useAppTheme()
  const locale = resolveLocale(localeSetting)

  useEffect(() => {
    if (i18n.language !== locale)
      void i18n.changeLanguage(locale)
    document.documentElement.lang = locale
  }, [i18n, locale])

  useEffect(() => {
    document.documentElement.dataset.theme = mode
  }, [mode])

  return (
    <ConfigProvider
      locale={locale === 'zh-CN' ? zhCN : enUS}
      theme={{
        algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: '#1677ff', borderRadius: 6 },
      }}
    >
      <AntApp className="app-root">{children}</AntApp>
    </ConfigProvider>
  )
}
