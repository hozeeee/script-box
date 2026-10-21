import process from 'node:process'
import { parseArgs } from 'node:util'

interface ScriptOption {
  name: string
  type: 'string' | 'boolean'
  short?: string
  default?: string | boolean
  description: string
}

interface ScriptManifest {
  id: string
  title: string
  description: string
  usage: string
  options: ScriptOption[]
  examples: { args: string, description: string }[]
}

export interface CliContext {
  values: Record<string, string | boolean | undefined>
  positionals: string[]
}

/** 参数解析和网页介绍共用 script.json，避免两处维护。 */
export async function runCli(data: unknown, handler: (context: CliContext) => Promise<void>): Promise<void> {
  const manifest = data as ScriptManifest
  try {
    const options = Object.fromEntries(manifest.options.map(({ name, type, short, default: defaultValue }) => [
      name,
      {
        type,
        ...(short !== undefined ? { short } : {}),
        ...(defaultValue !== undefined ? { default: defaultValue } : {}),
      },
    ]))
    const parsed = parseArgs({
      args: process.argv.slice(2),
      options: { ...options, help: { type: 'boolean', short: 'h' } },
      strict: true,
      allowPositionals: true,
    })
    if (parsed.values.help) {
      console.log(`${manifest.title}\n${manifest.description}\n\n用法：node ${manifest.id}.js ${manifest.usage}\n\n参数：`)
      for (const option of manifest.options) {
        const label = `--${option.name}${option.short ? `, -${option.short}` : ''}`
        console.log(`  ${label}${option.type === 'string' ? ' <值>' : ''}：${option.description}${option.default !== undefined ? `（默认：${option.default}）` : ''}`)
      }
      console.log('  --help, -h：显示帮助\n\n示例：')
      for (const example of manifest.examples)
        console.log(`  node ${manifest.id}.js ${example.args}`)
      return
    }
    await handler(parsed)
  }
  catch (error) {
    console.error(`错误：${error instanceof Error ? error.message : String(error)}`)
    console.error(`运行 node ${manifest.id}.js --help 查看用法。`)
    process.exitCode = 1
  }
}

export function integerOption(value: string | boolean | undefined, name: string, min: number, max: number): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value))
    throw new Error(`${name} 必须是 ${min}–${max} 之间的整数`)
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < min || number > max)
    throw new Error(`${name} 必须是 ${min}–${max} 之间的整数`)
  return number
}

export function singleInput(positionals: string[]): string {
  if (positionals.length !== 1 || !positionals[0])
    throw new Error('必须且只能提供一个输入参数')
  return positionals[0]
}
