'use strict'

const fs = require('fs')
const { parseYAML } = require('./yaml')
const { escapeHtml, slugify } = require('./markdown')
const { highlight } = require('./highlight')

function get (obj, pointer) {
  const parts = pointer.replace(/^#\//, '').split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'))
  let cur = obj
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

function resolveRefs (node, root, depth = 0) {
  if (depth > 20 || node === null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(n => resolveRefs(n, root, depth + 1))
  if (typeof node.$ref === 'string' && node.$ref.startsWith('#/')) {
    const target = get(root, node.$ref)
    return target === undefined ? node : resolveRefs(target, root, depth + 1)
  }
  const out = {}
  for (const key of Object.keys(node)) {
    out[key] = resolveRefs(node[key], root, depth + 1)
  }
  return out
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

function renderSchema (schema) {
  if (!schema || typeof schema !== 'object') return ''
  if (schema.type === 'object' && schema.properties) {
    const rows = Object.entries(schema.properties).map(([name, prop]) => {
      const required = Array.isArray(schema.required) && schema.required.includes(name)
      return `<tr><td><code>${escapeHtml(name)}</code>${required ? ' <span class="db-req">*</span>' : ''}</td><td>${escapeHtml(prop.type || '')}</td><td>${escapeHtml(prop.description || '')}</td></tr>`
    }).join('')
    return `<div class="db-table-wrap"><table><thead><tr><th>Поле</th><th>Тип</th><th>Описание</th></tr></thead><tbody>${rows}</tbody></table></div>`
  }
  if (schema.type === 'array' && schema.items) {
    return `<div>Массив: ${renderSchema(schema.items)}</div>`
  }
  return `<code>${escapeHtml(schema.type || 'object')}</code>`
}

function renderParams (params, kind) {
  const filtered = (params || []).filter(p => p.in === kind)
  if (!filtered.length) return ''
  const rows = filtered.map(p => {
    return `<tr><td><code>${escapeHtml(p.name)}</code>${p.required ? ' <span class="db-req">*</span>' : ''}</td><td>${escapeHtml((p.schema && p.schema.type) || '')}</td><td>${escapeHtml(p.description || '')}</td></tr>`
  }).join('')
  const titles = { path: 'Path-параметры', query: 'Query-параметры', header: 'Заголовки' }
  return `<h3>${titles[kind] || kind}</h3><div class="db-table-wrap"><table><thead><tr><th>Имя</th><th>Тип</th><th>Описание</th></tr></thead><tbody>${rows}</tbody></table></div>`
}

function renderSnippets (method, url, requestBody) {
  const upper = method.toUpperCase()
  const hasBody = !!requestBody
  const exampleBody = hasBody ? JSON.stringify(firstExample(requestBody), null, 2) : ''
  const curl = [`curl -X ${upper} '${url}'`]
  if (hasBody) curl.push(`  -H 'Content-Type: application/json'`, `  -d '${exampleBody.replace(/'/g, "'\\''")}'`)
  const fetchLines = [
    `fetch('${url}', {`,
    `  method: '${upper}',`
  ]
  if (hasBody) {
    fetchLines.push(`  headers: { 'Content-Type': 'application/json' },`)
    fetchLines.push(`  body: JSON.stringify(${exampleBody})`)
  }
  fetchLines.push('})')
  const pythonLines = [`requests.${method}('${url}'${hasBody ? `, json=${exampleBody}` : ''})`]

  const tabs = [
    { label: 'curl', lang: 'bash', code: curl.join(' \\\n') },
    { label: 'fetch', lang: 'js', code: fetchLines.join('\n') },
    { label: 'python', lang: 'python', code: pythonLines.join('\n') }
  ]
  const groupId = 'snippet-' + Math.random().toString(36).slice(2, 8)
  let out = '<div class="db-tabs db-code-group" data-tabs><div class="db-tabs__list" role="tablist">'
  tabs.forEach((t, i) => {
    out += `<button class="db-tabs__tab${i === 0 ? ' is-active' : ''}" role="tab" data-tab-target="${groupId}-${i}">${t.label}</button>`
  })
  out += '</div>'
  tabs.forEach((t, i) => {
    out += `<div class="db-tabs__panel${i === 0 ? ' is-active' : ''}" id="${groupId}-${i}"><pre class="db-pre"><code class="language-${t.lang}">${highlight(t.lang, t.code)}</code></pre></div>`
  })
  out += '</div>'
  return out
}

function firstExample (requestBody) {
  const content = requestBody && requestBody.content
  if (!content) return {}
  const json = content['application/json']
  if (json && json.example) return json.example
  return {}
}

function renderResponses (responses) {
  if (!responses) return ''
  let out = '<h3>Ответы</h3>'
  for (const [code, resp] of Object.entries(responses)) {
    const content = resp.content && resp.content['application/json']
    const example = content && content.example ? JSON.stringify(content.example, null, 2) : null
    out += `<div class="db-response"><div class="db-response__code db-response__code--${code[0]}xx">${escapeHtml(code)}</div><div>${escapeHtml(resp.description || '')}</div>`
    if (example) out += `<pre class="db-pre"><code class="language-json">${highlight('json', example)}</code></pre>`
    out += '</div>'
  }
  return out
}

function renderOperationHtml (method, urlPath, op, baseUrl) {
  const url = `${baseUrl}${urlPath}`
  let html = `<div class="db-api-endpoint"><div class="db-api-endpoint__head"><span class="db-method db-method--${method}">${method.toUpperCase()}</span><code class="db-api-endpoint__path">${escapeHtml(urlPath)}</code></div>`
  if (op.description) html += `<p>${escapeHtml(op.description)}</p>`
  html += renderParams(op.parameters, 'path')
  html += renderParams(op.parameters, 'query')
  html += renderParams(op.parameters, 'header')
  if (op.requestBody) {
    html += '<h3>Тело запроса</h3>'
    const schema = op.requestBody.content && op.requestBody.content['application/json'] && op.requestBody.content['application/json'].schema
    if (schema) html += renderSchema(schema)
  }
  html += renderResponses(op.responses)
  html += '<h3>Пример запроса</h3>'
  html += renderSnippets(method, url, op.requestBody)
  html += '</div>'
  return html
}

function buildOpenApiPages (entry, siteBaseUrl) {
  const raw = fs.readFileSync(entry.spec, 'utf8')
  const doc = parseYAML(raw)
  const resolved = resolveRefs(doc, doc)
  const pages = []
  const navChildren = []

  const indexToc = []
  let indexHtml = `<h1 id="overview">${escapeHtml((resolved.info && resolved.info.title) || 'API Reference')}</h1>`
  indexToc.push({ level: 1, text: (resolved.info && resolved.info.title) || 'API Reference', id: 'overview' })
  if (resolved.info && resolved.info.description) indexHtml += `<p>${escapeHtml(resolved.info.description)}</p>`
  indexHtml += '<ul>'

  for (const [urlPath, methods] of Object.entries(resolved.paths || {})) {
    for (const method of METHODS) {
      const op = methods[method]
      if (!op) continue
      const title = op.summary || `${method.toUpperCase()} ${urlPath}`
      const slug = slugify(op.operationId || `${method}-${urlPath}`)
      const route = `${entry.path}/${slug}`
      const html = renderOperationHtml(method, urlPath, op, siteBaseUrl)
      pages.push({
        route,
        title,
        html,
        toc: [{ level: 1, text: title, id: 'overview' }],
        description: op.description || ''
      })
      navChildren.push({ title, route })
      indexHtml += `<li><a href="${route}"><span class="db-method db-method--${method}">${method.toUpperCase()}</span> ${escapeHtml(urlPath)} — ${escapeHtml(title)}</a></li>`
    }
  }
  indexHtml += '</ul>'

  pages.unshift({
    route: entry.path,
    title: (resolved.info && resolved.info.title) || 'API Reference',
    html: indexHtml,
    toc: indexToc,
    description: (resolved.info && resolved.info.description) || ''
  })

  return { pages, navChildren }
}

module.exports = { buildOpenApiPages }
