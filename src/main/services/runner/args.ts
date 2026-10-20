/**
 * Split a command line into arguments, honouring single/double quotes
 * and backslash escapes (POSIX shell style, without expansion).
 */
export function parseArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | '\'' | null = null
  let hasToken = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quote) {
      if (char === quote) {
        quote = null
      }
      else if (char === '\\' && quote === '"' && (input[i + 1] === '"' || input[i + 1] === '\\')) {
        current += input[++i]
      }
      else {
        current += char
      }
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      hasToken = true
    }
    else if (char === '\\' && i + 1 < input.length) {
      current += input[++i]
      hasToken = true
    }
    else if (/\s/.test(char)) {
      if (hasToken) {
        args.push(current)
        current = ''
        hasToken = false
      }
    }
    else {
      current += char
      hasToken = true
    }
  }
  if (hasToken)
    args.push(current)
  return args
}
