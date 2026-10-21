import type { ScriptSource } from '@shared/types'
import { monaco } from './monacoSetup'

/** Model URI of a script; `file:///node_modules/...` type libs resolve relative to it */
export const scriptModelPath = (spaceId: string, name: string): string => `file:///spaces/${spaceId}/scripts/${name}`

export function disposeScriptModel(spaceId: string, name: string): void {
  monaco.editor.getModel(monaco.Uri.parse(scriptModelPath(spaceId, name)))?.dispose()
}

export function disposeSpaceModels(spaceId: string): void {
  const prefix = `file:///spaces/${spaceId}/`
  for (const model of monaco.editor.getModels()) {
    if (!model.isDisposed() && model.uri.toString(true).startsWith(prefix))
      model.dispose()
  }
}

function languageOf(name: string): string {
  return /\.[cm]?tsx?$/i.test(name) ? 'typescript' : 'javascript'
}

/**
 * Background models for the sources of an imported project, so relative
 * imports resolve in the editor. Models listed in `keep` (open documents) are
 * left alone, models of files that disappeared are disposed.
 */
export function syncSourceModels(spaceId: string, sources: ScriptSource[], keep: Set<string>): void {
  const uriOf = (name: string): monaco.Uri => monaco.Uri.parse(scriptModelPath(spaceId, name))
  const wanted = new Set(sources.map(source => uriOf(source.name).toString(true)))
  const kept = new Set([...keep].map(name => uriOf(name).toString(true)))
  const prefix = uriOf('').toString(true)
  for (const model of monaco.editor.getModels()) {
    const uri = model.uri.toString(true)
    if (!model.isDisposed() && uri.startsWith(prefix) && !wanted.has(uri) && !kept.has(uri))
      model.dispose()
  }
  for (const source of sources) {
    const uri = uriOf(source.name)
    const existing = monaco.editor.getModel(uri)
    if (!existing)
      monaco.editor.createModel(source.content, languageOf(source.name), uri)
    else if (!keep.has(source.name) && existing.getValue() !== source.content)
      existing.setValue(source.content)
  }
}
