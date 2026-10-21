import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import process from 'node:process'

export interface Area {
  x: number
  y: number
  width: number
  height: number
}

export interface Shot {
  image: Buffer
  width: number
  height: number
}

/** Windows 与 X11 按绝对坐标采集；macOS 只能整屏采集，区域通过裁剪滤镜实现。 */
export type Source
  = | { kind: 'gdigrab', origin: Area }
    | { kind: 'x11grab', display: string, origin: Area | null }
    | { kind: 'avfoundation', device: string }

interface Output {
  code: number | null
  stdout: Buffer
  stderr: string
}

const MIN_SIZE = 16
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
const MAC_PERMISSION = '请在“系统设置 → 隐私与安全性 → 屏幕录制”中允许 Script Box（或当前终端），然后重启该应用'
const INSTALL_HINTS: Record<string, string> = {
  win32: 'winget install Gyan.FFmpeg（安装后需重启 Script Box 或终端）',
  darwin: 'brew install ffmpeg',
  linux: 'sudo apt install ffmpeg（或使用发行版对应的包管理器）',
}

// 先声明进程 DPI 感知，得到与 gdigrab 一致的物理像素坐标。
const WINDOWS_SCREENS = `
Add-Type -Name Dpi -Namespace ScriptBox -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'
[void][ScriptBox.Dpi]::SetProcessDPIAware()
Add-Type -AssemblyName System.Windows.Forms
$v = [System.Windows.Forms.SystemInformation]::VirtualScreen
$s = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object { @{ name = $_.DeviceName; primary = $_.Primary; x = $_.Bounds.X; y = $_.Bounds.Y; width = $_.Bounds.Width; height = $_.Bounds.Height } })
ConvertTo-Json -Compress -Depth 3 @{ desktop = @{ x = $v.X; y = $v.Y; width = $v.Width; height = $v.Height }; screens = $s }
`

export function exec(command: string, args: string[]): Promise<Output> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const chunks: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => stderr += chunk)
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout: Buffer.concat(chunks), stderr }))
  })
}

function lastLine(text: string): string {
  return text.trim().split(/\r?\n/).at(-1) ?? ''
}

/** 统一为偶数尺寸，满足 H.264 / yuv420p 的要求。 */
export function toArea(x: number, y: number, width: number, height: number): Area {
  const area = { x, y, width: width - (width % 2), height: height - (height % 2) }
  if (area.width < MIN_SIZE || area.height < MIN_SIZE)
    throw new Error(`录制区域至少需要 ${MIN_SIZE}×${MIN_SIZE} 像素`)
  return area
}

export function parseRegion(text: string): Area {
  const match = /^(\d+),(\d+),(\d+),(\d+)$/.exec(text.replace(/\s/g, ''))
  if (!match)
    throw new Error('--region 格式应为 x,y,宽,高，例如 100,100,640,360')
  const [x, y, width, height] = match.slice(1).map(Number) as [number, number, number, number]
  return toArea(x, y, width, height)
}

/** 校验浏览器提交的选区，必须完整落在截图范围内。 */
export function clampArea(value: unknown, shot: Shot): Area {
  const { x, y, width, height } = (value ?? {}) as Record<string, unknown>
  const numbers = [x, y, width, height]
  if (!numbers.every(item => Number.isSafeInteger(item) && (item as number) >= 0))
    throw new Error('选区坐标必须是非负整数')
  const area = toArea(...(numbers as [number, number, number, number]))
  if (area.x + area.width > shot.width || area.y + area.height > shot.height)
    throw new Error('选区超出了屏幕范围')
  return area
}

export async function checkFfmpeg(ffmpeg: string): Promise<{ x264: boolean }> {
  let result: Output
  try {
    result = await exec(ffmpeg, ['-hide_banner', '-encoders'])
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw error
    const hint = INSTALL_HINTS[process.platform] ?? '参考 https://ffmpeg.org/download.html'
    throw new Error(`未找到 ffmpeg（${ffmpeg}）。请先安装：${hint}；或使用 --ffmpeg 指定可执行文件路径`)
  }
  if (result.code !== 0)
    throw new Error(`ffmpeg 无法运行：${lastLine(result.stderr)}`)
  return { x264: /\blibx264\b/.test(result.stdout.toString()) }
}

async function windowsDesktop(): Promise<{ desktop: Area, screens: { label: string, area: Area }[] }> {
  const script = Buffer.from(WINDOWS_SCREENS, 'utf16le').toString('base64')
  const result = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', script])
  if (result.code !== 0)
    throw new Error(`无法读取显示器信息：${lastLine(result.stderr)}`)
  const data = JSON.parse(result.stdout.toString()) as { desktop: Area, screens: (Area & { name: string, primary: boolean })[] }
  const screens = [...data.screens].sort((a, b) => Number(b.primary) - Number(a.primary)).map(({ name, primary, ...area }) => ({
    label: `${name} ${area.width}×${area.height}，位置 ${area.x},${area.y}${primary ? '（主显示器）' : ''}`,
    area,
  }))
  return { desktop: data.desktop, screens }
}

async function x11Screens(): Promise<{ label: string, area: Area }[]> {
  let result: Output
  try {
    result = await exec('xrandr', ['--listmonitors'])
  }
  catch {
    throw new Error('读取显示器需要 xrandr，请先安装（例如 sudo apt install x11-xserver-utils）')
  }
  const screens: { label: string, area: Area, primary: boolean }[] = []
  for (const line of result.stdout.toString().split('\n')) {
    // 形如：0: +*eDP-1 1920/344x1080/194+0+0  eDP-1
    const match = /^\s*\d+:\s+\+?(\*?)([^\s*]\S*)\s+(\d+)\/\d+x(\d+)\/\d+\+(-?\d+)\+(-?\d+)/.exec(line)
    if (!match)
      continue
    const [, star, name, width, height, x, y] = match
    const area = { x: Number(x), y: Number(y), width: Number(width), height: Number(height) }
    screens.push({ label: `${name} ${area.width}×${area.height}，位置 ${area.x},${area.y}${star ? '（主显示器）' : ''}`, area, primary: Boolean(star) })
  }
  return screens.sort((a, b) => Number(b.primary) - Number(a.primary))
}

async function macScreens(ffmpeg: string): Promise<{ label: string, device: string }[]> {
  const { stderr } = await exec(ffmpeg, ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''])
  const screens = [...stderr.matchAll(/\[(\d+)\] Capture screen (\d+)/g)].map(match => ({ label: `Capture screen ${match[2]}`, device: match[1] ?? '' }))
  if (!screens.length)
    throw new Error(`没有找到可录制的屏幕。${MAC_PERMISSION}`)
  return screens
}

function assertX11(): string {
  if (process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY)
    throw new Error('检测到 Wayland 会话，ffmpeg 无法在其中录屏。请在登录界面切换到 X11（Xorg）会话后重试')
  if (!process.env.DISPLAY)
    throw new Error('没有找到 X11 显示（DISPLAY 环境变量为空），请在图形桌面中运行')
  return process.env.DISPLAY
}

export async function listScreens(ffmpeg: string): Promise<{ label: string }[]> {
  if (process.platform === 'win32')
    return (await windowsDesktop()).screens
  if (process.platform === 'darwin')
    return macScreens(ffmpeg)
  if (process.platform === 'linux') {
    assertX11()
    return x11Screens()
  }
  throw new Error(`暂不支持当前平台：${process.platform}`)
}

function pick<T>(screens: T[], index: number): T {
  const screen = screens[index]
  if (!screen)
    throw new Error(`显示器 ${index} 不存在（共 ${screens.length} 个），可使用 --list 查看编号`)
  return screen
}

export async function resolveSource(ffmpeg: string, screen: number | undefined): Promise<Source> {
  if (process.platform === 'win32') {
    const { desktop, screens } = await windowsDesktop()
    return { kind: 'gdigrab', origin: screen === undefined ? desktop : pick(screens, screen).area }
  }
  if (process.platform === 'darwin')
    return { kind: 'avfoundation', device: pick(await macScreens(ffmpeg), screen ?? 0).device }
  if (process.platform === 'linux') {
    const display = assertX11()
    return { kind: 'x11grab', display, origin: screen === undefined ? null : pick(await x11Screens(), screen).area }
  }
  throw new Error(`暂不支持当前平台：${process.platform}`)
}

/** 生成采集输入参数；region 为空时录制整个所选画面。 */
export function captureArgs(source: Source, fps: number, cursor: boolean, region: Area | null): { input: string[], filters: string[] } {
  const common = ['-framerate', String(fps)]
  const flag = cursor ? '1' : '0'
  if (source.kind === 'gdigrab') {
    const area = region ? { ...region, x: region.x + source.origin.x, y: region.y + source.origin.y } : source.origin
    return {
      input: ['-f', 'gdigrab', ...common, '-draw_mouse', flag, '-offset_x', String(area.x), '-offset_y', String(area.y), '-video_size', `${area.width}x${area.height}`, '-i', 'desktop'],
      filters: [],
    }
  }
  if (source.kind === 'x11grab') {
    const origin = source.origin ?? { x: 0, y: 0 }
    const area = region ? { ...region, x: region.x + origin.x, y: region.y + origin.y } : source.origin
    return {
      input: ['-f', 'x11grab', ...common, '-draw_mouse', flag, ...(area ? ['-video_size', `${area.width}x${area.height}`, '-i', `${source.display}+${area.x},${area.y}`] : ['-i', source.display])],
      filters: [],
    }
  }
  return {
    input: ['-f', 'avfoundation', ...common, '-capture_cursor', flag, '-i', `${source.device}:none`],
    filters: region ? [`crop=${region.width}:${region.height}:${region.x}:${region.y}`] : [],
  }
}

export function failureHint(): string {
  return process.platform === 'darwin' ? `如果画面为空或无法采集，${MAC_PERMISSION}` : ''
}

/** 截取一帧 PNG 供框选，坐标系与录制时完全一致。 */
export async function screenshot(ffmpeg: string, source: Source): Promise<Shot> {
  const { input } = captureArgs(source, 10, false, null)
  const result = await exec(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...input, '-frames:v', '1', '-c:v', 'png', '-f', 'image2pipe', 'pipe:1'])
  const image = result.stdout
  if (result.code !== 0 || image.length < 24 || !image.subarray(0, 8).equals(PNG_SIGNATURE))
    throw new Error(`截取屏幕失败：${lastLine(result.stderr) || `ffmpeg 退出码 ${result.code}`}。${failureHint()}`)
  return { image, width: image.readUInt32BE(16), height: image.readUInt32BE(20) }
}
