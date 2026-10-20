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
