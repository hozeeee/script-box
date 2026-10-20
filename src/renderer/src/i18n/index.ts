import type { LocaleSetting } from '@shared/types'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enUS from './locales/en-US.json'
import zhCN from './locales/zh-CN.json'

export type AppLocale = 'zh-CN' | 'en-US'

export function resolveLocale(setting: LocaleSetting): AppLocale {
  if (setting !== 'system')
    return setting
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: resolveLocale('system'),
  fallbackLng: 'en-US',
  interpolation: { escapeValue: false },
})

export default i18n
