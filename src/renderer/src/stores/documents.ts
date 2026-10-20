import { invoke } from '@renderer/api'
import { create } from 'zustand'

export interface ScriptDocument {
  saved: string
  content: string
}

interface DocumentsState {
  docs: Record<string, ScriptDocument>
  open: (spaceId: string, name: string) => Promise<ScriptDocument>
  edit: (spaceId: string, name: string, content: string) => void
  save: (spaceId: string, name: string) => Promise<void>
  forget: (spaceId: string, name?: string) => void
  /** Move a draft to its new name after the file was renamed on disk */
  rename: (spaceId: string, from: string, to: string) => void
}

export const docKey = (spaceId: string, name: string): string => `${spaceId}/${name}`

/** In-memory drafts so switching between scripts never loses unsaved edits */
export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  docs: {},
  async open(spaceId, name) {
    const key = docKey(spaceId, name)
    const existing = get().docs[key]
    if (existing)
      return existing
    const saved = await invoke('script:read', spaceId, name)
    const doc = { saved, content: saved }
    set({ docs: { ...get().docs, [key]: doc } })
    return doc
  },
  edit(spaceId, name, content) {
    const key = docKey(spaceId, name)
    const doc = get().docs[key]
    if (doc && doc.content !== content)
      set({ docs: { ...get().docs, [key]: { ...doc, content } } })
  },
  async save(spaceId, name) {
    const key = docKey(spaceId, name)
    const doc = get().docs[key]
    if (!doc || doc.content === doc.saved)
      return
    const content = doc.content
    await invoke('script:write', spaceId, name, content)
    const latest = get().docs[key]
    if (latest)
      set({ docs: { ...get().docs, [key]: { ...latest, saved: content } } })
  },
  forget(spaceId, name) {
    const prefix = name ? docKey(spaceId, name) : `${spaceId}/`
    set({
      docs: Object.fromEntries(Object.entries(get().docs).filter(([key]) => name ? key !== prefix : !key.startsWith(prefix))),
    })
  },
  rename(spaceId, from, to) {
    const { [docKey(spaceId, from)]: doc, ...docs } = get().docs
    if (doc)
      set({ docs: { ...docs, [docKey(spaceId, to)]: doc } })
  },
}))

export function isDirty(doc: ScriptDocument | undefined): boolean {
  return !!doc && doc.content !== doc.saved
}
