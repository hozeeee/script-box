import { access, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[char])
}

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${field} 必须是非空字符串`)
}

export function validateManifest(manifest, directory) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(directory) || manifest.id !== directory)
    throw new Error(`脚本 id 必须与目录名一致，并使用小写字母、数字和连字符：${directory}`)
  for (const field of ['title', 'description', 'category', 'usage'])
    requireText(manifest[field], `${directory}.${field}`)
  if (!Array.isArray(manifest.options) || !Array.isArray(manifest.examples) || !manifest.examples.length)
    throw new Error(`${directory} 必须包含 options 数组和至少一个 example`)
  const names = new Set(['help', '__proto__', 'constructor', 'prototype'])
  const shorts = new Set(['h'])
  for (const option of manifest.options) {
    if (!option || !/^[a-z][a-z0-9-]*$/.test(option.name) || names.has(option.name))
      throw new Error(`${directory} 包含非法、保留或重复的参数名`)
    names.add(option.name)
    if (!['string', 'boolean'].includes(option.type))
      throw new Error(`${directory}.${option.name} 的 type 必须是 string 或 boolean`)
    requireText(option.description, `${directory}.${option.name}.description`)
    if (option.default !== undefined && (option.type === 'string' ? typeof option.default !== 'string' : typeof option.default !== 'boolean'))
      throw new Error(`${directory}.${option.name} 的默认值类型不匹配`)
    if (option.short !== undefined) {
      if (typeof option.short !== 'string' || !/^[a-z]$/i.test(option.short) || shorts.has(option.short))
        throw new Error(`${directory} 包含非法或重复的参数缩写`)
      shorts.add(option.short)
    }
  }
  for (const example of manifest.examples) {
    requireText(example.args, `${directory}.example.args`)
    requireText(example.description, `${directory}.example.description`)
  }
  return manifest
}

export async function loadScripts(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const scripts = []
  for (const entry of entries.filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const folder = join(directory, entry.name)
    const manifest = validateManifest(JSON.parse(await readFile(join(folder, 'script.json'), 'utf8')), entry.name)
    const source = join(folder, 'index.ts')
    await access(source)
    scripts.push({ manifest, source })
  }
  if (!scripts.length)
    throw new Error('scripts 目录中至少需要一个脚本项目')
  return scripts
}

function safeUrl(value) {
  if (!value)
    return ''
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('网站链接只允许 HTTP / HTTPS 地址')
  return escapeHtml(url.href)
}

const ICON_DOWNLOAD = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v7.5m0 0L5 7m3 3 3-3M3 12.5h10"/></svg>'
const ICON_COPY = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5"/></svg>'
const ICON_EXTERNAL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 3.5h-3v9h9v-3M9 2.5h4.5V7M13.5 2.5 7 9"/></svg>'

export function renderPage(template, site, catalog, repository = '') {
  for (const field of ['title', 'description', 'projectDescription'])
    requireText(site[field], `site.${field}`)
  const repo = site.repositoryUrl || (repository ? `https://github.com/${repository}` : '')
  const links = [
    [repo, '查看主项目'],
    [site.releasesUrl || (repo ? `${repo.replace(/\/$/, '')}/releases` : ''), '下载 Script Box'],
  ].filter(([url]) => url).map(([url, label]) => `<a class="btn btn-sm" href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${label}${ICON_EXTERNAL}</a>`).join('')
  const cards = catalog.map((script) => {
    const id = escapeHtml(script.id)
    const options = [...script.options, { name: 'help', short: 'h', type: 'boolean', description: '显示帮助和示例' }]
    const rows = options.map(option => `<tr><td><code>--${escapeHtml(option.name)}${option.type === 'string' ? ' &lt;值&gt;' : ''}</code>${option.short ? `<span class="alias">-${escapeHtml(option.short)}</span>` : ''}</td><td>${escapeHtml(option.description)}${option.default !== undefined ? ` <span class="default">默认 ${escapeHtml(option.default)}</span>` : ''}</td></tr>`).join('')
    const examples = script.examples.map(example => `<li><p>${escapeHtml(example.description)}</p><div class="code-line"><span>终端</span><code>node ${id}.js ${escapeHtml(example.args)}</code></div><div class="code-line"><span>Script Box</span><code>${escapeHtml(example.args)}</code></div></li>`).join('')
    return `<article class="script-card" id="${id}" data-category="${escapeHtml(script.category)}" data-search="${escapeHtml(`${script.title} ${script.id} ${script.category} ${script.description}`.toLowerCase())}">
      <div class="card-head"><span class="badge">${escapeHtml(script.category)}</span><span class="meta">${id}.js · ${(script.bytes / 1024).toFixed(1)} KB</span></div>
      <h3>${escapeHtml(script.title)}</h3>
      <p class="card-desc">${escapeHtml(script.description)}</p>
      <code class="usage" title="node ${id}.js ${escapeHtml(script.usage)}">node ${id}.js ${escapeHtml(script.usage)}</code>
      <div class="card-actions"><a class="btn btn-primary btn-sm" href="${escapeHtml(script.download)}" download="${id}.js">${ICON_DOWNLOAD}下载</a><button class="btn btn-sm" type="button" data-copy="node ${id}.js ${escapeHtml(script.examples[0].args)}" hidden>${ICON_COPY}<span>复制示例</span></button><span class="meta push">Node.js 22+</span></div>
      <details class="fold"><summary>参数与示例<span class="pill">${options.length}</span></summary><div class="table-wrap"><table><tbody>${rows}</tbody></table></div><ul class="examples">${examples}</ul></details>
      <details class="fold"><summary>SHA-256 校验值</summary><code class="hash">${escapeHtml(script.sha256)}</code></details>
    </article>`
  }).join('\n')
  const replacements = {
    TITLE: escapeHtml(site.title),
    DESCRIPTION: escapeHtml(site.description),
    PROJECT_DESCRIPTION: escapeHtml(site.projectDescription),
    PROJECT_LINKS: links,
    COUNT: String(catalog.length),
    CARDS: cards,
  }
  // 使用回调替换，避免元数据中的 $& 等文本被当成替换指令。
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (marker, key) => {
    if (!(key in replacements))
      throw new Error(`未知网页占位符：${marker}`)
    return replacements[key]
  })
}
