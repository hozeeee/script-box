import { languageOf } from './naming'

const JS_TEMPLATE = `// Use require/import to load packages installed in this space.
console.log('Hello from Script Box')
`

const TS_TEMPLATE = `import process from 'node:process'

const args = process.argv.slice(2)
console.log('Hello from Script Box', args)
`

export function templateFor(name: string): string {
  return languageOf(name) === 'typescript' ? TS_TEMPLATE : JS_TEMPLATE
}
