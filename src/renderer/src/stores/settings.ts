import type { DeepPartial, Settings } from '@shared/types'
import { invoke, on } from '@renderer/api'
import { create } from 'zustand'

interface SettingsState {
  settings: Settings | null
  load: () => Promise<Settings>
  update: (patch: DeepPartial<Settings>) => Promise<Settings>
}

export const useSettingsStore = create<SettingsState>(set => ({
  settings: null,
  async load() {
    const settings = await invoke('settings:get')
    set({ settings })
    return settings
  },
  async update(patch) {
    const settings = await invoke('settings:update', patch)
    set({ settings })
    return settings
  },
}))

on('settings:changed', settings => useSettingsStore.setState({ settings }))
