import type { ScriptFile } from '@shared/types'
import { invoke } from '@renderer/api'
import { create } from 'zustand'

export interface ScriptDocument {
  saved: string
  content: string
  /** Modification time of the file when `saved` was read or written, null if unknown */
  mtime: number | null
}

/** Thrown by `save` when the file was modified on disk after it was opened */
export class ExternalChangeError extends Error {
  constructor(readonly script: string) {
    super(`${script} was modified outside the editor`)
    this.name = 'ExternalChangeError'
  }
}

interface DocumentsState {
  docs: Record<string, ScriptDocument>
  open: (spaceId: string, name: string) => Promise<ScriptDocument>
  edit: (spaceId: string, name: string, content: string) => void
  /** Write the draft; rejects with {@link ExternalChangeError} unless `force` is set */
  save: (spaceId: string, name: string, options?: { force?: boolean }) => Promise<void>
  /** Drop the draft and read the file from disk again */
  reload: (spaceId: string, name: string) => Promise<void>
  /** Re-read clean documents whose file changed on disk since they were opened */
  sync: (spaceId: string, files: ScriptFile[]) => Promise<void>
  forget: (spaceId: string, name?: string) => void
  /** Move a draft to its new name after the file was renamed on disk */
  rename: (spaceId: string, from: string, to: string) => void
}

export const docKey = (spaceId: string, name: string): string => `${spaceId}/${name}`

// Filesystems report mtimes with different precision, ignore sub-millisecond noise
const changedSince = (mtime: number, known: number | null): boolean => known !== null && mtime - known > 1

async function readDocument(spaceId: string, name: string): Promise<ScriptDocument> {
  const [saved, mtime] = await Promise.all([
    invoke('script:read', spaceId, name),
    invoke('script:mtime', spaceId, name).catch(() => null),
  ])
  return { saved, content: saved, mtime }
}

/** In-memory drafts so switching between scripts never loses unsaved edits */
export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  docs: {},
  async open(spaceId, name) {
    const key = docKey(spaceId, name)
    const existing = get().docs[key]
    if (existing)
      return existing
    const doc = await readDocument(spaceId, name)
    set({ docs: { ...get().docs, [key]: doc } })
    return doc
  },
  edit(spaceId, name, content) {
    const key = docKey(spaceId, name)
    const doc = get().docs[key]
    if (doc && doc.content !== content)
      set({ docs: { ...get().docs, [key]: { ...doc, content } } })
  },
  async save(spaceId, name, options) {
    const key = docKey(spaceId, name)
    const doc = get().docs[key]
    if (!doc || doc.content === doc.saved)
      return
    if (!options?.force) {
      const current = await invoke('script:mtime', spaceId, name).catch(() => null)
      if (current !== null && changedSince(current, doc.mtime))
        throw new ExternalChangeError(name)
    }
    const content = doc.content
    await invoke('script:write', spaceId, name, content)
    const mtime = await invoke('script:mtime', spaceId, name).catch(() => null)
    const latest = get().docs[key]
    if (latest)
      set({ docs: { ...get().docs, [key]: { ...latest, saved: content, mtime } } })
  },
  async reload(spaceId, name) {
    const doc = await readDocument(spaceId, name)
    set({ docs: { ...get().docs, [docKey(spaceId, name)]: doc } })
  },
  async sync(spaceId, files) {
    const stale = files.filter((file) => {
      const doc = get().docs[docKey(spaceId, file.name)]
      return doc && !isDirty(doc) && changedSince(file.mtime, doc.mtime)
    })
    await Promise.all(stale.map(file => get().reload(spaceId, file.name).catch(() => {})))
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
