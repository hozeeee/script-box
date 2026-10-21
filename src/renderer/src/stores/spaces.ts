import type { Space, SpaceInput } from '@shared/types'
import { invoke } from '@renderer/api'
import { create } from 'zustand'

interface SpacesState {
  spaces: Space[]
  loaded: boolean
  load: () => Promise<void>
  create: (input: SpaceInput) => Promise<Space>
  /** Reference an existing project directory in place */
  importProject: (input: SpaceInput & { projectPath: string }) => Promise<Space>
  update: (id: string, input: Partial<SpaceInput>) => Promise<Space>
  reorder: (ids: string[]) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Replace a space after the main process returned a newer copy */
  put: (space: Space) => void
}

export const useSpacesStore = create<SpacesState>((set, get) => ({
  spaces: [],
  loaded: false,
  async load() {
    set({ spaces: await invoke('space:list'), loaded: true })
  },
  async create(input) {
    const space = await invoke('space:create', input)
    set({ spaces: [space, ...get().spaces] })
    return space
  },
  async importProject(input) {
    const space = await invoke('space:import-project', input)
    set({ spaces: [space, ...get().spaces] })
    return space
  },
  async update(id, input) {
    const space = await invoke('space:update', id, input)
    get().put(space)
    return space
  },
  async reorder(ids) {
    await invoke('space:reorder', ids)
    const positions = new Map(ids.map((id, index) => [id, index]))
    set({
      spaces: [...get().spaces].sort((a, b) => (positions.get(a.id) ?? ids.length) - (positions.get(b.id) ?? ids.length)),
    })
  },
  async remove(id) {
    await invoke('space:remove', id)
    set({ spaces: get().spaces.filter(space => space.id !== id) })
  },
  put(space) {
    const exists = get().spaces.some(item => item.id === space.id)
    set({
      spaces: exists
        ? get().spaces.map(item => (item.id === space.id ? space : item))
        : [space, ...get().spaces],
    })
  },
}))
