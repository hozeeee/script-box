import type { ITerminalOptions } from '@xterm/xterm'
import type { RefObject } from 'react'
import { useAppTheme } from '@renderer/hooks/useAppTheme'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { useEffect, useRef, useState } from 'react'
import { darkTerminalTheme, lightTerminalTheme } from './theme'
import '@xterm/xterm/css/xterm.css'

const FONT_FAMILY = 'Menlo, Consolas, "DejaVu Sans Mono", "Courier New", monospace'

/**
 * Mount an xterm.js terminal into `container`, keep it fitted to the element
 * size and in sync with the app theme. Returns the terminal once it is ready.
 */
export function useXterm(container: RefObject<HTMLDivElement | null>, options: ITerminalOptions = {}): Terminal | null {
  const [terminal, setTerminal] = useState<Terminal | null>(null)
  const mode = useAppTheme()
  const optionsRef = useRef(options)

  useEffect(() => {
    const element = container.current
    if (!element)
      return
    const term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: 13,
      scrollback: 10_000,
      allowProposedApi: true,
      ...optionsRef.current,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(element)

    const refit = (): void => {
      // Hidden tabs have no size; fitting them would collapse the terminal
      if (element.offsetWidth > 0 && element.offsetHeight > 0)
        fit.fit()
    }
    const observer = new ResizeObserver(() => refit())
    observer.observe(element)
    refit()
    setTerminal(term)

    return () => {
      observer.disconnect()
      term.dispose()
      setTerminal(null)
    }
  }, [container])

  useEffect(() => {
    if (terminal)
      terminal.options.theme = mode === 'dark' ? darkTerminalTheme : lightTerminalTheme
  }, [terminal, mode])

  return terminal
}
