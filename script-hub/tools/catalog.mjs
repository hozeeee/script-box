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

export function renderPage(template, site, catalog, repository = '') {
  for (const field of ['title', 'description', 'projectDescription'])
    requireText(site[field], `site.${field}`)
  const repo = site.repositoryUrl || (repository ? `https://github.com/${repository}` : '')
  const links = [
    [repo, '查看主项目'],
    [site.releasesUrl || (repo ? `${repo.replace(/\/$/, '')}/releases` : ''), '下载 Script Box'],
  ].filter(([url]) => url).map(([url, label]) => `<a class="text-link" href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`).join('')
  const cards = catalog.map((script) => {
    const options = [...script.options, { name: 'help', short: 'h', type: 'boolean', description: '显示帮助和示例' }]
    const rows = options.map(option => `<tr><td><code>--${escapeHtml(option.name)}${option.short ? ` / -${escapeHtml(option.short)}` : ''}${option.type === 'string' ? ' &lt;值&gt;' : ''}</code></td><td>${escapeHtml(option.description)}${option.default !== undefined ? `<br><small>默认：${escapeHtml(option.default)}</small>` : ''}</td></tr>`).join('')
    const examples = script.examples.map(example => `<div class="example"><p>${escapeHtml(example.description)}</p><pre><code>node ${escapeHtml(script.id)}.js ${escapeHtml(example.args)}</code></pre><small>Script Box 启动参数：</small><pre><code>${escapeHtml(example.args)}</code></pre></div>`).join('')
    return `<article class="script-card" id="${escapeHtml(script.id)}" data-search="${escapeHtml(`${script.title} ${script.id} ${script.category} ${script.description}`.toLowerCase())}">
      <div class="card-heading"><span class="category">${escapeHtml(script.category)}</span><small>${escapeHtml(script.id)}.js</small></div>
      <h3>${escapeHtml(script.title)}</h3><p>${escapeHtml(script.description)}</p>
      <div class="download-row"><a class="download" href="${escapeHtml(script.download)}" download="${escapeHtml(script.id)}.js">下载脚本 ↓</a><small>${(script.bytes / 1024).toFixed(1)} KB · Node.js 22+</small></div>
      <details><summary>启动参数与使用示例</summary><pre><code>node ${escapeHtml(script.id)}.js ${escapeHtml(script.usage)}</code></pre><div class="table-wrap"><table><thead><tr><th>参数</th><th>说明</th></tr></thead><tbody>${rows}</tbody></table></div>${examples}</details>
      <details class="checksum"><summary>SHA-256 校验值</summary><code>${escapeHtml(script.sha256)}</code></details>
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
