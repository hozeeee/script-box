import type { Buffer } from 'node:buffer'
import type { Area } from './capture'
import { spawn } from 'node:child_process'
import { access, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { integerOption, runCli } from '../../shared/cli'
import { captureArgs, checkFfmpeg, failureHint, listScreens, parseRegion, resolveSource, screenshot } from './capture'
import { pickArea } from './picker'
import manifest from './script.json'

interface Stopper {
  signal: AbortSignal
  dispose: () => void
}

const FORMATS = ['.mp4', '.gif']

/** 终端按 q / 回车 / Ctrl+C，或收到停止信号时触发；同一个信号既用于取消也用于结束录制。 */
function listenStop(): Stopper {
  const controller = new AbortController()
  const stop = (): void => controller.abort()
  const stdin = process.stdin
  const onData = (chunk: Buffer): void => {
    const key = chunk.toString()
    if (key.includes('\u0003') || /[q\r\n]/i.test(key))
      stop()
  }
  if (stdin.isTTY)
    stdin.setRawMode(true)
  stdin.on('data', onData)
  process.on('SIGINT', stop).on('SIGTERM', stop)
  let disposed = false
  return {
    signal: controller.signal,
    dispose: () => {
      if (disposed)
        return
      disposed = true
      stdin.off('data', onData)
      if (stdin.isTTY)
        stdin.setRawMode(false)
      stdin.pause()
      process.off('SIGINT', stop).off('SIGTERM', stop)
    },
  }
}

async function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  try {
    await sleep(ms, undefined, { signal })
    return true
  }
  catch {
    return false
  }
}

/** ffmpeg 的进度直接输出到终端；向标准输入写入 q 可让它正常收尾并写完文件。 */
function runFfmpeg(ffmpeg: string, args: string[], signal?: AbortSignal): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['pipe', 'ignore', 'inherit'], windowsHide: true })
    const stop = (): void => {
      child.stdin.end('q')
    }
    child.stdin.on('error', () => {})
    if (signal?.aborted)
      stop()
    signal?.addEventListener('abort', stop, { once: true })
    child.on('error', reject)
    child.on('close', (code) => {
      signal?.removeEventListener('abort', stop)
      resolve(code)
    })
  })
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

/** 按本地时间在当前目录生成文件名，同一秒内重复时追加序号。 */
async function defaultOutput(extension: string): Promise<string> {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  for (let index = 0; ; index++) {
    const output = resolve(`screen-record-${stamp}${index ? `-${index}` : ''}${extension}`)
    if (!(await exists(output)))
      return output
  }
}

void runCli(manifest, async ({ values, positionals }) => {
  const ffmpeg = typeof values.ffmpeg === 'string' ? values.ffmpeg : 'ffmpeg'
  if (values.list) {
    await checkFfmpeg(ffmpeg)
    const screens = await listScreens(ffmpeg)
    screens.forEach((screen, index) => console.log(`${index}: ${screen.label}`))
    return
  }

  if (positionals.length > 1)
    throw new Error('最多只能提供一个输出文件路径')
  const requested = typeof values.format === 'string' ? `.${values.format.toLowerCase()}` : undefined
  if (requested !== undefined && !FORMATS.includes(requested))
    throw new Error('--format 只支持 mp4 或 gif')
  const named = Boolean(positionals[0])
  const output = positionals[0] ? resolve(positionals[0]) : await defaultOutput(requested ?? '.mp4')
  const format = extname(output).toLowerCase()
  if (!FORMATS.includes(format))
    throw new Error('输出文件扩展名必须是 .mp4 或 .gif')
  if (requested !== undefined && requested !== format)
    throw new Error(`--format ${values.format} 与输出文件扩展名 ${format} 不一致`)
  if (await exists(output))
    throw new Error(`输出文件已存在：${output}`)
  if (values.region !== undefined && values.full)
    throw new Error('--region 与 --full 不能同时使用')
  const gif = format === '.gif'
  const region = typeof values.region === 'string' ? parseRegion(values.region) : null
  const fps = values.fps === undefined ? (gif ? 15 : 30) : integerOption(values.fps, '--fps', 1, 60)
  const duration = values.duration === undefined ? undefined : integerOption(values.duration, '--duration', 1, 86400)
  const width = values.width === undefined ? undefined : integerOption(values.width, '--width', 16, 7680) & ~1
  const delay = integerOption(values.delay, '--delay', 0, 60)
  const screen = values.screen === undefined ? undefined : integerOption(values.screen, '--screen', 0, 31)

  const { x264 } = await checkFfmpeg(ffmpeg)
  const source = await resolveSource(ffmpeg, screen)
  if (!named)
    console.log(`输出文件：${output}`)
  const stopper = listenStop()
  const { signal } = stopper
  const temp = gif ? await mkdtemp(join(tmpdir(), 'screen-record-')) : null
  try {
    let area: Area | null = region
    if (!area && !values.full) {
      console.log('正在截取屏幕画面…')
      const picked = await pickArea(await screenshot(ffmpeg, source), signal)
      area = picked === 'full' ? null : picked
      if (picked === null || signal.aborted) {
        console.log('已取消，未生成文件。')
        process.exitCode = 1
        return
      }
    }
    for (let left = delay; left > 0; left--) {
      process.stdout.write(`\r${left} 秒后开始录制…（按 q 取消）`)
      if (!(await wait(1000, signal))) {
        console.log('\n已取消，未生成文件。')
        process.exitCode = 1
        return
      }
    }
    if (delay)
      process.stdout.write('\n')

    const capture = captureArgs(source, fps, !values['hide-cursor'], area)
    const filters = [...capture.filters]
    if (!gif && width)
      filters.push(`scale=${width}:-2:flags=lanczos`, 'format=yuv420p')
    else
      filters.push('crop=trunc(iw/2)*2:trunc(ih/2)*2', ...(gif ? [] : ['format=yuv420p']))
    // GIF 先无损录制到临时文件，再生成调色板转换，避免实时编码占用大量内存。
    const codec = gif
      ? (x264 ? ['-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0'] : ['-c:v', 'ffv1'])
      : [...(x264 ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'] : ['-c:v', 'mpeg4', '-q:v', '3']), '-movflags', '+faststart']
    const target = temp ? join(temp, 'capture.mkv') : output
    if (!x264)
      console.error('提示：当前 ffmpeg 不含 libx264，将使用内置编码器，画质和体积可能较差。')
    if (gif && !width && (area?.width ?? 0) > 1280)
      console.error('提示：GIF 尺寸较大，可使用 --width 缩小以减小文件体积。')
    console.log(`● 正在录制${area ? ` ${area.width}×${area.height} 区域` : '整个画面'}，${duration ? `${duration} 秒后自动停止，` : ''}按 q 或回车停止`)
    const code = await runFfmpeg(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-stats',
      '-n',
      ...capture.input,
      ...(duration ? ['-t', String(duration)] : []),
      '-vf',
      filters.join(','),
      ...codec,
      target,
    ], signal)
    stopper.dispose()
    // 收到 SIGINT / SIGTERM 时 ffmpeg 也会正常写完文件，但退出码为 255。
    if ((code !== 0 && !(signal.aborted && code === 255)) || !(await exists(target)))
      throw new Error(`ffmpeg 录制失败（退出码 ${code}），请查看上方输出。${failureHint()}`)

    if (temp) {
      console.log('正在生成 GIF…')
      const palette = 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle'
      const converted = await runFfmpeg(ffmpeg, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-stats',
        '-n',
        '-i',
        target,
        '-vf',
        `${width ? `scale=${width}:-1:flags=lanczos,` : ''}${palette}`,
        '-loop',
        '0',
        output,
      ])
      if (converted !== 0)
        throw new Error(`GIF 转换失败（退出码 ${converted}），请查看上方输出`)
    }
    console.log(`已保存：${output}（${formatSize((await stat(output)).size)}）`)
  }
  finally {
    stopper.dispose()
    if (temp)
      await rm(temp, { recursive: true, force: true })
  }
})
