import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Area, Shot } from './capture'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import process from 'node:process'
import { clampArea } from './capture'

export type Pick = Area | 'full' | null

const TEXT = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
const DONE_RECORD = '已确认区域。请在倒计时结束前把浏览器移出录制区域或最小化；录制中在终端按 q 或回车停止。此页面可以关闭。'
const DONE_CANCEL = '已取消录制，此页面可以关闭。'

function page(shot: Shot): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>框选录制区域</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#0f1115;color:#e5e7eb;font:13px/1.5 system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
body{display:flex;flex-direction:column}
header{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:10px 16px;background:#181b21;border-bottom:1px solid #2a2f38}
header strong{font-size:14px}
.hint{color:#9ca3af}
.fields{display:flex;gap:8px}
.fields label{display:flex;align-items:center;gap:4px;color:#9ca3af}
.fields input{width:76px;padding:3px 6px;border:1px solid #2f3540;border-radius:4px;background:#0f1115;color:inherit;font:inherit}
.actions{display:flex;gap:8px;margin-left:auto}
button{padding:5px 12px;border:1px solid #2f3540;border-radius:6px;background:#232831;color:inherit;font:inherit;cursor:pointer}
button.primary{background:#2563eb;border-color:#2563eb;color:#fff}
button:disabled{opacity:.45;cursor:not-allowed}
main{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:16px}
#stage{position:relative;overflow:hidden;line-height:0;cursor:crosshair;user-select:none;touch-action:none}
#shot{display:block;max-width:calc(100vw - 32px);max-height:calc(100vh - 110px);pointer-events:none}
#box{position:absolute;display:none;border:1px solid #60a5fa;box-shadow:0 0 0 100000px rgba(0,0,0,.55);cursor:move}
#box i{position:absolute;width:10px;height:10px;margin:-5px;background:#60a5fa;border:1px solid #fff}
#box i[data-corner=nw]{left:0;top:0;cursor:nwse-resize}
#box i[data-corner=ne]{left:100%;top:0;cursor:nesw-resize}
#box i[data-corner=sw]{left:0;top:100%;cursor:nesw-resize}
#box i[data-corner=se]{left:100%;top:100%;cursor:nwse-resize}
.done{margin:auto;max-width:520px;padding:24px;font-size:15px;text-align:center}
</style>
</head>
<body>
<header>
  <strong>框选录制区域</strong>
  <span class="hint">画面 ${shot.width}×${shot.height} · 拖动框选，拖动选区可移动，拖动四角可调整 · Enter 确认</span>
  <div class="fields">
    <label>X <input id="x" type="number" min="0"></label>
    <label>Y <input id="y" type="number" min="0"></label>
    <label>宽 <input id="w" type="number" min="16"></label>
    <label>高 <input id="h" type="number" min="16"></label>
  </div>
  <div class="actions">
    <button id="cancel" type="button">取消</button>
    <button id="full" type="button">录制整个画面</button>
    <button id="submit" class="primary" type="button" disabled>录制选区</button>
  </div>
</header>
<main>
  <div id="stage"><img id="shot" src="shot.png" alt="屏幕截图" draggable="false"><div id="box"><i data-corner="nw"></i><i data-corner="ne"></i><i data-corner="sw"></i><i data-corner="se"></i></div></div>
</main>
<script>
const MIN = 16
const $ = id => document.getElementById(id)
const shot = $('shot')
const stage = $('stage')
const box = $('box')
const fields = { x: $('x'), y: $('y'), width: $('w'), height: $('h') }
const buttons = [$('cancel'), $('full'), $('submit')]
let sel = null
let drag = null

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
const ratio = () => shot.naturalWidth / shot.clientWidth

function point(event) {
  const rect = shot.getBoundingClientRect()
  return {
    x: clamp(Math.round((event.clientX - rect.left) * ratio()), 0, shot.naturalWidth),
    y: clamp(Math.round((event.clientY - rect.top) * ratio()), 0, shot.naturalHeight),
  }
}

function valid() {
  return sel && sel.width >= MIN && sel.height >= MIN
}

function render() {
  $('submit').disabled = !valid()
  if (!sel) {
    box.style.display = 'none'
    return
  }
  const r = ratio()
  box.style.display = 'block'
  box.style.left = sel.x / r + 'px'
  box.style.top = sel.y / r + 'px'
  box.style.width = sel.width / r + 'px'
  box.style.height = sel.height / r + 'px'
  for (const key in fields) {
    if (document.activeElement !== fields[key])
      fields[key].value = sel[key]
  }
}

stage.addEventListener('pointerdown', (event) => {
  if (event.button !== 0)
    return
  const p = point(event)
  const corner = event.target.dataset && event.target.dataset.corner
  if (corner && sel) {
    drag = { ax: corner[1] === 'w' ? sel.x + sel.width : sel.x, ay: corner[0] === 'n' ? sel.y + sel.height : sel.y }
  }
  else if (event.target === box && sel) {
    drag = { dx: p.x - sel.x, dy: p.y - sel.y }
  }
  else {
    drag = { ax: p.x, ay: p.y }
    sel = { x: p.x, y: p.y, width: 0, height: 0 }
  }
  stage.setPointerCapture(event.pointerId)
  render()
})

stage.addEventListener('pointermove', (event) => {
  if (!drag)
    return
  const p = point(event)
  if ('dx' in drag) {
    sel.x = clamp(p.x - drag.dx, 0, shot.naturalWidth - sel.width)
    sel.y = clamp(p.y - drag.dy, 0, shot.naturalHeight - sel.height)
  }
  else {
    sel = { x: Math.min(drag.ax, p.x), y: Math.min(drag.ay, p.y), width: Math.abs(p.x - drag.ax), height: Math.abs(p.y - drag.ay) }
  }
  render()
})

stage.addEventListener('pointerup', () => {
  drag = null
  if (sel && !sel.width && !sel.height)
    sel = null
  render()
})

for (const key in fields) {
  fields[key].addEventListener('input', () => {
    const value = Number.parseInt(fields[key].value, 10)
    if (!sel || Number.isNaN(value))
      return
    const next = { ...sel, [key]: Math.max(value, 0) }
    next.x = clamp(next.x, 0, shot.naturalWidth - MIN)
    next.y = clamp(next.y, 0, shot.naturalHeight - MIN)
    next.width = clamp(next.width, 0, shot.naturalWidth - next.x)
    next.height = clamp(next.height, 0, shot.naturalHeight - next.y)
    sel = next
    render()
  })
  fields[key].addEventListener('change', () => {
    fields[key].blur()
    render()
  })
}

async function send(path, body) {
  for (const button of buttons)
    button.disabled = true
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const text = await response.text()
    if (!response.ok)
      throw new Error(text)
    document.body.innerHTML = '<p class="done"></p>'
    document.querySelector('.done').textContent = text
    window.close()
  }
  catch (error) {
    alert('提交失败：' + error.message)
    $('cancel').disabled = false
    $('full').disabled = false
    render()
  }
}

$('submit').addEventListener('click', () => valid() && send('select', sel))
$('full').addEventListener('click', () => send('select', { full: true }))
$('cancel').addEventListener('click', () => send('cancel', {}))
window.addEventListener('resize', render)
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement)
    return
  if (event.key === 'Enter' && valid())
    send('select', sel)
  else if (event.key === 'Escape') {
    sel = null
    render()
  }
})
</script>
</body>
</html>`
}

function openBrowser(url: string): void {
  const [command, args] = process.platform === 'win32'
    ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
  const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true })
  child.on('error', () => console.error('无法自动打开浏览器，请手动访问上面的地址。'))
  child.unref()
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  request.setEncoding('utf8')
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 4096)
      throw new Error('请求内容过大')
  }
  return JSON.parse(body)
}

/** 在浏览器中展示截图供框选。只监听 127.0.0.1，并使用随机路径，避免其他网页代为提交。 */
export function pickArea(shot: Shot, signal: AbortSignal, open = openBrowser): Promise<Pick> {
  const base = `/${randomBytes(16).toString('hex')}/`
  return new Promise((resolve, reject) => {
    let settled = false
    const server = createServer((request, response) => {
      handle(request, response).catch((error: unknown) => {
        if (!response.headersSent)
          response.writeHead(400, TEXT).end(error instanceof Error ? error.message : String(error))
      })
    })
    function finish(result: Pick): void {
      if (settled)
        return
      settled = true
      signal.removeEventListener('abort', abort)
      server.close()
      server.closeAllConnections()
      resolve(result)
    }
    function abort(): void {
      finish(null)
    }
    function reply(response: ServerResponse, message: string, result: Pick): void {
      response.writeHead(200, TEXT).end(message, () => finish(result))
    }
    async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
      if (request.method === 'GET' && request.url === base) {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(page(shot))
      }
      else if (request.method === 'GET' && request.url === `${base}shot.png`) {
        response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' }).end(shot.image)
      }
      else if (request.method === 'POST' && request.url === `${base}select`) {
        const body = await readBody(request)
        const full = (body as { full?: unknown } | null)?.full === true
        reply(response, DONE_RECORD, full ? 'full' : clampArea(body, shot))
      }
      else if (request.method === 'POST' && request.url === `${base}cancel`) {
        reply(response, DONE_CANCEL, null)
      }
      else {
        response.writeHead(404, TEXT).end('Not Found')
      }
    }
    server.on('error', reject)
    if (signal.aborted) {
      resolve(null)
      return
    }
    signal.addEventListener('abort', abort, { once: true })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}${base}`
      console.log(`请在浏览器中框选录制区域：${url}`)
      console.log('（在终端按 q 取消）')
      open(url)
    })
  })
}
