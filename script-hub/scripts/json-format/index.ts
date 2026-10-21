import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { integerOption, runCli, singleInput } from '../../shared/cli'
import manifest from './script.json'

void runCli(manifest, async ({ values, positionals }) => {
  const input = singleInput(positionals)
  const indent = integerOption(values.indent, '--indent', 0, 8)
  let source: string
  if (input === '-') {
    process.stdin.setEncoding('utf8')
    source = ''
    for await (const chunk of process.stdin)
      source += chunk
  }
  else {
    source = await readFile(input, 'utf8')
  }
  const result = `${JSON.stringify(JSON.parse(source.replace(/^\uFEFF/, '')), null, indent)}\n`
  if (typeof values.output === 'string') {
    await writeFile(values.output, result, { encoding: 'utf8', flag: 'wx' })
    console.error(`已写入：${values.output}`)
  }
  else {
    process.stdout.write(result)
  }
})
