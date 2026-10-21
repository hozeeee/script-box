import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import process from 'node:process'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { escapeHtml, loadScripts, renderPage, validateManifest } from '../tools/catalog.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = join(root, 'dist')
const catalog = JSON.parse(await readFile(join(dist, 'catalog.json'), 'utf8'))
let temporary
let server
let baseUrl
const methods = []

before(async () => {
  temporary = await mkdtemp(join(root, 'node_modules/.hub-test-'))
  await writeFile(join(temporary, 'package.json'), '{"type":"commonjs"}')
  for (const script of catalog)
    await copyFile(join(dist, 'scripts', `${script.id}.js`), join(temporary, `${script.id}.js`))
  server = createServer((request, response) => {
    methods.push(request.method)
    if (request.url === '/slow')
      return
    if (request.url === '/redirect') {
      response.writeHead(302, { location: '/ok' }).end()
      return
    }
    response.writeHead(request.url === '/missing' ? 404 : 200, { 'x-hub-test': 'yes' }).end('ok')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  server?.closeAllConnections()
  if (server)
    await new Promise(resolve => server.close(resolve))
  if (temporary)
    await rm(temporary, { recursive: true, force: true })
})

function run(id, args = [], input, extension = 'js') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(temporary, `${id}.${extension}`), ...args], {
      cwd: temporary,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', chunk => stdout += chunk)
    child.stderr.setEncoding('utf8').on('data', chunk => stderr += chunk)
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}

test('构建目录包含全部脚本，页面链接和哈希与文件一致', async () => {
  const sources = await loadScripts(join(root, 'scripts'))
  assert.deepEqual(catalog.map(item => item.id), sources.map(item => item.manifest.id))
  const html = await readFile(join(dist, 'index.html'), 'utf8')
  const sums = await readFile(join(dist, 'SHA256SUMS.txt'), 'utf8')
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/)
  assert.match(html, /关于 Script Box/)
  assert.doesNotMatch(html, /<script[^>]+src=["'][^"']+\.js/)
  assert.equal((html.match(/class="script-card"/g) || []).length, catalog.length)
  for (const item of catalog) {
    const contents = await readFile(join(dist, 'scripts', `${item.id}.js`))
    assert.equal(contents.byteLength, item.bytes)
    assert.equal(createHash('sha256').update(contents).digest('hex'), item.sha256)
    assert.ok(html.includes(`href="./scripts/${item.id}.js" download="${item.id}.js"`))
    assert.equal(new URL(item.download, 'https://example.github.io/script-box/').pathname, `/script-box/scripts/${item.id}.js`)
    assert.ok(sums.includes(`${item.sha256}  scripts/${item.id}.js`))
  }
  const generated = (await readdir(join(dist, 'scripts'))).filter(file => file !== 'package.json')
  assert.deepEqual(generated.sort(), catalog.map(item => `${item.id}.js`).sort())
})

test('单独复制的 JS 无需其他文件，所有脚本均提供统一帮助', async () => {
  for (const item of catalog) {
    const result = await run(item.id, ['--help'])
    assert.equal(result.code, 0, result.stderr)
    assert.ok(result.stdout.includes(item.title))
    for (const option of item.options)
      assert.ok(result.stdout.includes(`--${option.name}`))
    assert.ok(result.stdout.includes('--help'))
    assert.ok(result.stdout.includes(item.examples[0].args))
  }
})

test('未提供必要输入、非法参数和未知选项以非零退出码结束', async () => {
  for (const item of catalog) {
    assert.equal((await run(item.id)).code, 1)
    assert.equal((await run(item.id, ['--unknown'])).code, 1)
  }
  assert.equal((await run('json-format', ['-', '--indent', '-1'], '{}')).code, 1)
  assert.equal((await run('json-format', ['-', '--indent', '9'], '{}')).code, 1)
  assert.equal((await run('json-format', ['-', '--indent', 'abc'], '{}')).code, 1)
  assert.equal((await run('file-hash', ['x', '--algorithm', 'invalid'])).code, 1)
  assert.equal((await run('file-hash', ['does-not-exist'])).code, 1)
  assert.equal((await run('http-probe', ['file:///tmp/file'])).code, 1)
  assert.equal((await run('http-probe', [baseUrl, '--method', 'POST'])).code, 1)
  assert.equal((await run('http-probe', [baseUrl, '--timeout', '0'])).code, 1)
})

test('JSON 支持标准输入、缩进、压缩和 BOM', async () => {
  const formatted = await run('json-format', ['-', '-i', '4'], '\uFEFF{"hello":[1,2]}')
  assert.equal(formatted.code, 0, formatted.stderr)
  assert.equal(formatted.stdout, `${JSON.stringify({ hello: [1, 2] }, null, 4)}\n`)
  const compact = await run('json-format', ['-', '--indent=0'], '{ "value": 1 }')
  assert.equal(compact.code, 0)
  assert.equal(compact.stdout, '{"value":1}\n')
  assert.equal((await run('json-format', ['-'], '{bad json}')).code, 1)
  assert.equal((await run('json-format', ['-', 'extra'], '{}')).code, 1)
})

test('JSON 支持空格路径，输出到新文件且绝不覆盖已有文件', async () => {
  const original = '{"value":123}'
  await writeFile(join(temporary, 'input file.json'), original)
  const success = await run('json-format', ['input file.json', '-o', 'output file.json'])
  assert.equal(success.code, 0, success.stderr)
  assert.equal(await readFile(join(temporary, 'output file.json'), 'utf8'), '{\n  "value": 123\n}\n')
  const overwrite = await run('json-format', ['input file.json', '-o', 'input file.json'])
  assert.equal(overwrite.code, 1)
  assert.equal(await readFile(join(temporary, 'input file.json'), 'utf8'), original)
})

test('文件哈希支持多文件、多算法和以连字符开头的文件名', async () => {
  const contents = '哈希校验\nhello'
  await writeFile(join(temporary, 'hash file.txt'), contents)
  await writeFile(join(temporary, '-hash.txt'), contents)
  for (const algorithm of ['sha256', 'sha512', 'md5']) {
    const result = await run('file-hash', ['--algorithm', algorithm, '--', 'hash file.txt', '-hash.txt'])
    const hash = createHash(algorithm).update(contents).digest('hex')
    assert.equal(result.code, 0, result.stderr)
    assert.equal(result.stdout, `${hash}  hash file.txt\n${hash}  -hash.txt\n`)
  }
})

test('HTTP 检查支持 HEAD / GET、重定向和打印响应头', async () => {
  const head = await run('http-probe', [`${baseUrl}/ok`])
  assert.equal(head.code, 0, head.stderr)
  assert.match(head.stdout, /状态：200/)
  assert.equal(methods.at(-1), 'HEAD')
  const get = await run('http-probe', [`${baseUrl}/redirect`, '--method', 'GET', '--headers'])
  assert.equal(get.code, 0, get.stderr)
  assert.ok(get.stdout.includes(`${baseUrl}/ok`))
  assert.match(get.stdout, /x-hub-test: yes/)
  assert.equal(methods.at(-1), 'GET')
})

test('HTTP 非成功状态、连接失败和超时均返回 1', async () => {
  const missing = await run('http-probe', [`${baseUrl}/missing`])
  assert.equal(missing.code, 1)
  assert.match(missing.stdout, /状态：404/)
  assert.equal((await run('http-probe', [`${baseUrl}/slow`, '--timeout', '100'])).code, 1)
  const unused = createServer()
  await new Promise(resolve => unused.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${unused.address().port}`
  await new Promise(resolve => unused.close(resolve))
  assert.equal((await run('http-probe', [url, '--timeout', '500'])).code, 1)
})

test('在 ESM 工程中改名 .cjs 后也可独立运行', async () => {
  await mkdir(join(temporary, 'esm'))
  await writeFile(join(temporary, 'esm/package.json'), '{"type":"module"}')
  await copyFile(join(temporary, 'json-format.js'), join(temporary, 'esm/json-format.cjs'))
  const result = await run('esm/json-format', ['--help'], undefined, 'cjs')
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /JSON 格式化/)
})

test('元数据验证拒绝重复参数、保留名和不匹配的默认值', () => {
  const original = catalog[0]
  assert.throws(() => validateManifest({ ...original, id: '../bad' }, '../bad'))
  assert.throws(() => validateManifest({ ...original, options: [{ name: 'help', type: 'boolean', description: 'x' }] }, original.id))
  assert.throws(() => validateManifest({ ...original, options: [{ name: 'x', type: 'string', short: 'h', description: 'x' }] }, original.id))
  assert.throws(() => validateManifest({ ...original, options: [original.options[0], original.options[0]] }, original.id))
  assert.throws(() => validateManifest({ ...original, options: [{ name: 'x', type: 'boolean', default: 'yes', description: 'x' }] }, original.id))
})

test('新增脚本目录自动发现，不需要修改注册表', async () => {
  const scriptsRoot = join(temporary, 'discovery')
  await mkdir(join(scriptsRoot, 'new-tool'), { recursive: true })
  const manifest = { ...catalog[0], id: 'new-tool' }
  await writeFile(join(scriptsRoot, 'new-tool/script.json'), JSON.stringify(manifest))
  await writeFile(join(scriptsRoot, 'new-tool/index.ts'), 'console.log("new")')
  const scripts = await loadScripts(scriptsRoot)
  assert.deepEqual(scripts.map(item => item.manifest.id), ['new-tool'])
})

test('网页转义文本，保留特殊替换字符并拒绝危险 URL', () => {
  const site = { title: '测试', description: '$& <script>alert(1)</script>', projectDescription: '介绍' }
  const html = renderPage('{{TITLE}} {{DESCRIPTION}} {{PROJECT_LINKS}} {{CARDS}}', site, [{ ...catalog[0], title: '<img src=x onerror=alert(1)>' }], 'owner/repo')
  assert.ok(html.includes('$&amp; &lt;script&gt;'))
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  assert.ok(html.includes('https://github.com/owner/repo/releases'))
  assert.equal(escapeHtml('"\'<>&'), '&quot;&#39;&lt;&gt;&amp;')
  assert.throws(() => renderPage('{{PROJECT_LINKS}}', { ...site, repositoryUrl: 'javascript:alert(1)' }, []))
  assert.throws(() => renderPage('{{UNKNOWN}}', site, []))
})
