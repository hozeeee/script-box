import { languageOf } from './naming'

const JS_TEMPLATE = `// Use require/import to load packages installed in this space.
console.log('Hello from Script Box')
`

const TS_TEMPLATE = `import process from 'node:process'

const args = process.argv.slice(2)
console.log('Hello from Script Box', args)
`

const PY_TEMPLATE = `import sys

print(f'Hello from Script Box, Python {sys.version}')
`

export function templateFor(name: string): string {
  const lang = languageOf(name)
  if (lang === 'python')
    return PY_TEMPLATE
  return lang === 'typescript' ? TS_TEMPLATE : JS_TEMPLATE
}
