import type { DeepPartial, Settings } from '@shared/types'
import { EventEmitter } from 'node:events'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import { paths } from '../../paths'
import { readJson, writeJson } from '../../utils/fs'
import { deepMerge } from './merge'

class SettingsStore extends EventEmitter<{ change: [Settings] }> {
  private current: Settings = DEFAULT_SETTINGS

  async load(): Promise<Settings> {
    const saved = await readJson<DeepPartial<Settings>>(paths.settings, {})
    this.current = deepMerge(DEFAULT_SETTINGS, saved)
    return this.current
  }

  get(): Settings {
    return this.current
  }

  async update(patch: DeepPartial<Settings>): Promise<Settings> {
    this.current = deepMerge(this.current, patch)
    await writeJson(paths.settings, this.current)
    this.emit('change', this.current)
    return this.current
  }
}

export const settingsStore = new SettingsStore()
