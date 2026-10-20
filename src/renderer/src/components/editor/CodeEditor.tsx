import type { OnMount } from '@monaco-editor/react'
import type { ReactNode } from 'react'
import Editor from '@monaco-editor/react'
import { useAppTheme } from '@renderer/hooks/useAppTheme'
import { Spin } from 'antd'
import { useLayoutEffect, useRef } from 'react'
import { monaco } from './monacoSetup'

interface Props {
  /** Model URI, e.g. file:///spaces/<id>/scripts/main.ts */
  path: string
  language: 'javascript' | 'typescript'
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onRun: () => void
}

export default function CodeEditor({ path, language, value, onChange, onSave, onRun }: Props): ReactNode {
  const mode = useAppTheme()
  const handlersRef = useRef({ onSave, onRun })

  useLayoutEffect(() => {
    handlersRef.current = { onSave, onRun }
  }, [onSave, onRun])

  const handleMount: OnMount = (editor) => {
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
