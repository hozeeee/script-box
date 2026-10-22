export const SPACE_NPMRC = `fund=false
audit=false
update-notifier=false
package-lock=true
`

export const WELCOME_SCRIPT_NAME = 'hello.ts'

export const WELCOME_SCRIPT = `import process from 'node:process'
import { createInterface } from 'node:readline/promises'

const rl = createInterface({ input: process.stdin, output: process.stdout })
const name = await rl.question('What is your name? ')
rl.close()

console.log(\`Hello, \${name || 'Script Box'}! Running on Node \${process.version}\`)
`

export const PYTHON_WELCOME_SCRIPT_NAME = 'hello.py'

export const PYTHON_WELCOME_SCRIPT = `import sys

name = input('What is your name? ')
print(f'Hello, {name or "Script Box"}! Running on Python {sys.version}')
`

export function PYTHON_PYPROJECT_TEMPLATE(name: string, pythonVersion: string): string {
  return `[project]
name = "${name}"
version = "0.0.1"
requires-python = ">=${pythonVersion}"
dependencies = []
`
}
