import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'

// Load the bundled Monaco instead of fetching it from a CDN
globalThis.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'typescript' || label === 'javascript')
      return new TsWorker()
    return new EditorWorker()
  },
}

const { typescript } = monaco

const compilerOptions: monaco.typescript.CompilerOptions = {
  target: typescript.ScriptTarget.ESNext,
  module: typescript.ModuleKind.ESNext,
  moduleResolution: typescript.ModuleResolutionKind.NodeJs,
  lib: ['esnext'],
  allowJs: true,
  checkJs: true,
  allowNonTsExtensions: true,
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
  resolveJsonModule: true,
  skipLibCheck: true,
  noEmit: true,
  strict: false,
  // Every script is its own module, so top-level names never clash between files
  moduleDetection: 3,
}

for (const defaults of [typescript.typescriptDefaults, typescript.javascriptDefaults]) {
  defaults.setCompilerOptions(compilerOptions)
  defaults.setEagerModelSync(true)
}

loader.config({ monaco })

export { monaco }
