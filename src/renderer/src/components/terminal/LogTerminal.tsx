import type { ReactNode } from 'react'
import { useEffect, useEffectEvent, useRef } from 'react'
import { useXterm } from './useXterm'

interface Props {
  /** Initial content, written once per `source` */
  content: string
  /** Changing this value clears the terminal and writes `content` again */
  source: string
  /** Subscribe to further output; return an unsubscribe function */
  follow?: (write: (data: string) => void) => () => void
}

/** Read-only terminal for npm output and history logs */
export default function LogTerminal({ content, source, follow }: Props): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminal = useXterm(containerRef, { convertEol: true, disableStdin: true, cursorInactiveStyle: 'none' })

  const attach = useEffectEvent((write: (data: string) => void) => {
    write(content)
    return follow?.(write)
  })

  useEffect(() => {
    if (!terminal)
      return
    terminal.reset()
    return attach(data => terminal.write(data))
  }, [terminal, source])

  return <div ref={containerRef} className="terminal-host" />
}
