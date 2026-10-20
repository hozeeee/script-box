import type { ReactNode } from 'react'
import { on, send } from '@renderer/api'
import { useRunsStore } from '@renderer/stores/runs'
import { useEffect, useRef } from 'react'
import { useXterm } from './useXterm'

/** Interactive terminal bound to one run: shows its output and forwards keystrokes to the pty */
export default function RunTerminal({ runId }: { runId: string }): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminal = useXterm(containerRef, { cursorBlink: true })

  useEffect(() => {
    if (!terminal)
      return
    const session = useRunsStore.getState().sessions[runId]
    if (session)
      terminal.write(session.chunks.join(''))

    const offOutput = on('run:output', (event) => {
      if (event.runId === runId)
        terminal.write(event.data)
    })
    const isRunning = (): boolean => useRunsStore.getState().sessions[runId]?.record.status === 'running'
    const input = terminal.onData((data) => {
      if (isRunning())
        send('run:write', runId, data)
    })
    const resize = terminal.onResize(({ cols, rows }) => {
      if (isRunning())
        send('run:resize', runId, cols, rows)
    })
    if (isRunning())
      send('run:resize', runId, terminal.cols, terminal.rows)

    return () => {
      offOutput()
      input.dispose()
      resize.dispose()
      terminal.reset()
    }
  }, [terminal, runId])

  return <div ref={containerRef} className="terminal-host" />
}
