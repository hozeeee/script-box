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
