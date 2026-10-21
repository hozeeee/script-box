import process from 'node:process'
import { integerOption, runCli, singleInput } from '../../shared/cli'
import manifest from './script.json'

void runCli(manifest, async ({ values, positionals }) => {
  const url = new URL(singleInput(positionals))
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('只支持 HTTP / HTTPS 地址')
  const method = String(values.method).toUpperCase()
  if (!['HEAD', 'GET'].includes(method))
    throw new Error('--method 只支持 HEAD 或 GET')
  const timeout = integerOption(values.timeout, '--timeout', 1, 300000)
  const start = performance.now()
  const response = await fetch(url, { method, signal: AbortSignal.timeout(timeout) })
  console.log(`状态：${response.status} ${response.statusText}`)
  console.log(`地址：${response.url}`)
  console.log(`响应头耗时：${Math.round(performance.now() - start)} ms`)
  if (values.headers) {
    for (const [name, value] of response.headers)
      console.log(`${name}: ${value}`)
  }
  await response.body?.cancel()
  if (!response.ok)
    process.exitCode = 1
})
