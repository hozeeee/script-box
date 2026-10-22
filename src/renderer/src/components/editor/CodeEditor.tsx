import type { OnMount } from '@monaco-editor/react'
import type { ReactNode } from 'react'
import Editor from '@monaco-editor/react'
import { useAppTheme } from '@renderer/hooks/useAppTheme'
import { Spin } from 'antd'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { monaco } from './monacoSetup'

interface Props {
  /** Model URI, e.g. file:///spaces/<id>/scripts/main.ts */
  path: string
  language: 'javascript' | 'typescript' | 'python'
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onRun: () => void
}

export default function CodeEditor({ path, language, value, onChange, onSave, onRun }: Props): ReactNode {
  const mode = useAppTheme()
  const handlersRef = useRef({ onSave, onRun })
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const valueRef = useRef(value)

  useLayoutEffect(() => {
    handlersRef.current = { onSave, onRun }
    valueRef.current = value
  }, [onSave, onRun, value])

  // An existing model (e.g. a background project source) is reused as is when switching paths,
  // make sure it shows the document content
  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (model && model.uri.toString(true) === monaco.Uri.parse(path).toString(true) && model.getValue() !== valueRef.current)
      model.setValue(valueRef.current)
  }, [path])

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
    const model = editor.getModel()
    if (model && model.getValue() !== valueRef.current)
      model.setValue(valueRef.current)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => handlersRef.current.onSave())
    editor.addCommand(monaco.KeyCode.F5, () => handlersRef.current.onRun())
    editor.focus()
  }

  return (
    <Editor
      path={path}
      language={language}
      value={value}
      theme={mode === 'dark' ? 'vs-dark' : 'vs'}
      loading={<Spin />}
      onMount={handleMount}
      onChange={next => onChange(next ?? '')}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        fixedOverflowWidgets: true,
      }}
    />
  )
}
