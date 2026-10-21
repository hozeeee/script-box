import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { loadScripts, renderPage } from './catalog.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = join(root, 'dist')
const scripts = await loadScripts(join(root, 'scripts'))
const site = JSON.parse(await readFile(join(root, 'site.json'), 'utf8'))
const template = await readFile(join(root, 'web/index.html'), 'utf8')
const bundles = []
for (const { manifest, source } of scripts) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [source],
    outfile: join(dist, 'scripts', `${manifest.id}.js`),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    splitting: false,
    sourcemap: false,
    write: false,
    metafile: true,
    legalComments: 'inline',
    banner: { js: `// ${manifest.title} · Script Box 脚本中心 · Node.js 22+\n// MIT License · 使用 --help 查看启动参数` },
    logLevel: 'silent',
  })
  if (result.outputFiles.length !== 1)
    throw new Error(`${manifest.id} 必须构建为单文件，不允许附带资源`)
  for (const output of Object.values(result.metafile.outputs)) {
    if (output.imports.some(item => item.external && !isBuiltin(item.path)))
      throw new Error(`${manifest.id} 含有未打包的非 Node.js 内置依赖`)
  }
  const contents = result.outputFiles[0].contents
  bundles.push({
    contents,
    manifest: {
      ...manifest,
      download: `./scripts/${manifest.id}.js`,
      bytes: contents.byteLength,
      sha256: createHash('sha256').update(contents).digest('hex'),
    },
  })
}
const catalog = bundles.map(item => item.manifest)
const html = renderPage(template, site, catalog, process.env.GITHUB_REPOSITORY)
// 所有脚本和网页校验成功后才清理子项目自身的生成目录。
await rm(dist, { recursive: true, force: true })
await mkdir(join(dist, 'scripts'), { recursive: true })
for (const { contents, manifest } of bundles)
  await writeFile(join(dist, 'scripts', `${manifest.id}.js`), contents)
// 在子项目 type: module 环境预览和运行时，仍明确将产物按 CommonJS 处理。
await writeFile(join(dist, 'scripts/package.json'), '{"type":"commonjs"}\n')
await writeFile(join(dist, 'index.html'), html)
await writeFile(join(dist, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`)
await writeFile(join(dist, 'SHA256SUMS.txt'), `${catalog.map(item => `${item.sha256}  scripts/${item.id}.js`).join('\n')}\n`)
console.log(`已构建 ${catalog.length} 个独立脚本，网站产物：${dist}`)
