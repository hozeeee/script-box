import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const port = Number(process.env.PORT || 9173)
await readFile(resolve(root, 'index.html')).catch(() => {
  throw new Error('请先运行 pnpm build 生成网页')
})
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' }
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`)
    if (!file.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)) {
      response.writeHead(403).end('Forbidden')
      return
    }
    const contents = await readFile(file)
    response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    response.setHeader('Cache-Control', 'no-store')
    if (extname(file) === '.js')
      response.setHeader('Content-Disposition', `attachment; filename="${file.split(sep).pop()}"`)
    response.writeHead(200).end(contents)
  }
  catch {
    response.writeHead(404).end('Not Found')
  }
})
server.listen(port, '127.0.0.1', () => console.log(`脚本中心预览：http://127.0.0.1:${port}`))
