'use strict'

// API для редактирования исходников прямо с сайта (только dockbook dev).
// Работает поверх реальных .md/.mdx файлов из config.content — правки,
// созданные страницы и папки подхватываются существующим наблюдателем
// (fs.watch) в bin/dockbook.js и уходят в браузер через live-reload.

const fs = require('fs')
const path = require('path')
const { readJsonBody, sendJson } = require('./httpJson')
const { listDir, isDirectory } = require('./setupApi')
const { setFolderTitle } = require('./navConfig')

function safeJoin (rootDir, relPath) {
  if (typeof relPath !== 'string' || !relPath) return null
  const rel = relPath.replace(/^\/+/, '').replace(/\\/g, '/')
  if (!rel || rel.split('/').includes('..')) return null
  const resolved = path.resolve(rootDir, rel)
  if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) return null
  return resolved
}

// Как safeJoin, но допускает пустой relPath — это сама корневая папка
// content-раздела (тоже безопасна, т.к. приходит из доверенного config.content).
function safeJoinFolder (rootDir, relPath) {
  const rel = String(relPath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  if (!rel) return rootDir
  return safeJoin(rootDir, rel)
}

// Дампер одного плоского YAML-скаляра — числа/булевы без кавычек, строки
// всегда в двойных кавычках (проще и надёжнее, чем угадывать, когда можно
// без них: заголовки могут содержать двоеточия, решётки и т.п.).
function dumpScalar (value) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const str = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  return `"${str}"`
}

// Точечно меняет (добавляет/убирает) поле title во frontmatter markdown-файла,
// не трогая остальные поля и не перепарсивая-передампивая весь YAML-блок —
// так меньше риска сломать что-то нестандартное, что туда уже написали руками.
function updateFrontmatterTitle (src, title) {
  const trimmedTitle = String(title || '').trim()
  const match = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)

  if (!match) {
    if (!trimmedTitle) return src
    return `---\ntitle: ${dumpScalar(trimmedTitle)}\n---\n\n${src}`
  }

  let replaced = false
  const newLines = match[1].split(/\r?\n/).map(line => {
    if (!/^title\s*:/.test(line)) return line
    replaced = true
    return trimmedTitle ? `title: ${dumpScalar(trimmedTitle)}` : null
  }).filter(line => line !== null)

  if (!replaced && trimmedTitle) newLines.unshift(`title: ${dumpScalar(trimmedTitle)}`)

  const rest = src.slice(match[0].length)
  const newBody = newLines.join('\n').trim()
  return newBody ? `---\n${newBody}\n---\n${rest}` : rest
}

function findEntry (entries, index) {
  const i = Number(index)
  if (!Number.isInteger(i) || i < 0 || i >= entries.length) return null
  return entries[i]
}

// Ищет исходный .md/.mdx файл для маршрута страницы, перебирая
// сконфигурированные content-разделы (самый длинный base — приоритетнее).
function resolveRoute (entries, route) {
  const normalized = (route || '/').replace(/\/+$/, '') || '/'
  const sorted = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.base.length - a.entry.base.length)

  for (const { entry, index } of sorted) {
    const base = entry.base
    let relRoute
    if (base === '/') {
      relRoute = normalized === '/' ? '' : normalized.slice(1)
    } else if (normalized === base) {
      relRoute = ''
    } else if (normalized.startsWith(base + '/')) {
      relRoute = normalized.slice(base.length + 1)
    } else {
      continue
    }

    const candidates = relRoute === ''
      ? ['index.md', 'index.mdx']
      : [`${relRoute}.md`, `${relRoute}.mdx`, `${relRoute}/index.md`, `${relRoute}/index.mdx`]

    for (const candidate of candidates) {
      const abs = safeJoin(entry.dir, candidate)
      if (abs && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        return { index, path: candidate, abs }
      }
    }
  }
  return null
}

// Возвращает true, если запрос обработан этим модулем.
// ctx: { entries, switchDocs } — switchDocs(dir) переключает обслуживаемую
// папку документации в памяти процесса, см. bin/dockbook.js.
function handleEditRequest (req, res, parsed, ctx) {
  if (!parsed.pathname.startsWith('/__dockbook_api/')) return false
  const { entries, switchDocs, configRoot, onFolderTitleChange } = ctx

  if (req.method === 'GET' && parsed.pathname === '/__dockbook_api/browse') {
    sendJson(res, 200, listDir(parsed.searchParams.get('path')))
    return true
  }

  if (req.method === 'POST' && parsed.pathname === '/__dockbook_api/switch-docs') {
    readJsonBody(req).then(body => {
      const target = String(body.path || '').trim()
      if (!target || !isDirectory(target)) { sendJson(res, 400, { error: 'not_a_directory' }); return }
      if (typeof switchDocs !== 'function') { sendJson(res, 500, { error: 'not_supported' }); return }
      const result = switchDocs(path.resolve(target)) || {}
      sendJson(res, 200, { ok: true, empty: !!result.empty })
    }).catch(() => sendJson(res, 400, { error: 'bad_request' }))
    return true
  }

  if (req.method === 'GET' && parsed.pathname === '/__dockbook_api/status') {
    sendJson(res, 200, { enabled: true, entries: entries.map(e => ({ base: e.base, label: e.label })) })
    return true
  }

  if (req.method === 'GET' && parsed.pathname === '/__dockbook_api/resolve') {
    const route = parsed.searchParams.get('route') || '/'
    const found = resolveRoute(entries, route)
    if (!found) { sendJson(res, 404, { error: 'not_found' }); return true }
    fs.readFile(found.abs, 'utf8', (err, content) => {
      if (err) { sendJson(res, 404, { error: 'not_found' }); return }
      sendJson(res, 200, { entry: found.index, path: found.path, content })
    })
    return true
  }

  if (req.method === 'PUT' && parsed.pathname === '/__dockbook_api/source') {
    readJsonBody(req).then(body => {
      const entry = findEntry(entries, body.entry)
      if (!entry) { sendJson(res, 400, { error: 'bad_entry' }); return }
      if (!/\.(md|mdx)$/i.test(body.path || '')) { sendJson(res, 400, { error: 'bad_path' }); return }
      const abs = safeJoin(entry.dir, body.path)
      if (!abs) { sendJson(res, 400, { error: 'bad_path' }); return }
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, String(body.content ?? ''), 'utf8')
      sendJson(res, 200, { ok: true })
    }).catch(() => sendJson(res, 400, { error: 'bad_request' }))
    return true
  }

  if (req.method === 'POST' && parsed.pathname === '/__dockbook_api/page') {
    readJsonBody(req).then(body => {
      const entry = findEntry(entries, body.entry)
      if (!entry) { sendJson(res, 400, { error: 'bad_entry' }); return }
      let relPath = String(body.path || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
      if (!relPath) { sendJson(res, 400, { error: 'bad_path' }); return }
      if (!/\.(md|mdx)$/i.test(relPath)) relPath += '.md'
      const abs = safeJoin(entry.dir, relPath)
      if (!abs) { sendJson(res, 400, { error: 'bad_path' }); return }
      if (fs.existsSync(abs)) { sendJson(res, 409, { error: 'exists' }); return }
      const title = String(body.title || '').trim() || 'Новая страница'
      const content = `---\ntitle: ${title}\n---\n\n# ${title}\n\nОпишите здесь содержимое страницы.\n`
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, content, 'utf8')
      sendJson(res, 200, { ok: true, path: relPath })
    }).catch(() => sendJson(res, 400, { error: 'bad_request' }))
    return true
  }

  if (req.method === 'POST' && parsed.pathname === '/__dockbook_api/folder') {
    readJsonBody(req).then(body => {
      const entry = findEntry(entries, body.entry)
      if (!entry) { sendJson(res, 400, { error: 'bad_entry' }); return }
      const relPath = String(body.path || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
      if (!relPath) { sendJson(res, 400, { error: 'bad_path' }); return }
      const abs = safeJoin(entry.dir, relPath)
      if (!abs) { sendJson(res, 400, { error: 'bad_path' }); return }
      if (fs.existsSync(abs) && !fs.statSync(abs).isDirectory()) { sendJson(res, 409, { error: 'exists_as_file' }); return }
      fs.mkdirSync(abs, { recursive: true })
      sendJson(res, 200, { ok: true })
    }).catch(() => sendJson(res, 400, { error: 'bad_request' }))
    return true
  }

  if (req.method === 'PUT' && parsed.pathname === '/__dockbook_api/folder-title') {
    readJsonBody(req).then(body => {
      const entry = findEntry(entries, body.entry)
      if (!entry) { sendJson(res, 400, { error: 'bad_entry' }); return }
      const dir = safeJoinFolder(entry.dir, body.path)
      if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        sendJson(res, 400, { error: 'bad_path' })
        return
      }
      const root = typeof configRoot === 'function' ? configRoot() : configRoot
      if (!root) { sendJson(res, 500, { error: 'not_supported' }); return }
      const title = String(body.title || '').trim()
      setFolderTitle(root, entry.base, body.path, title)
      if (typeof onFolderTitleChange === 'function') onFolderTitleChange()
      sendJson(res, 200, { ok: true, title: title || null })
    }).catch(() => sendJson(res, 400, { error: 'bad_request' }))
    return true
  }

  if (req.method === 'PUT' && parsed.pathname === '/__dockbook_api/page-title') {
    readJsonBody(req).then(body => {
      const route = String(body.route || '/')
      const found = resolveRoute(entries, route)
      if (!found) { sendJson(res, 404, { error: 'not_found' }); return }
      let content
      try { content = fs.readFileSync(found.abs, 'utf8') } catch (err) { sendJson(res, 404, { error: 'not_found' }); return }
      const title = String(body.title || '').trim()
      fs.writeFileSync(found.abs, updateFrontmatterTitle(content, title), 'utf8')
      sendJson(res, 200, { ok: true, title: title || null })
    }).catch(() => sendJson(res, 400, { error: 'bad_request' }))
    return true
  }

  sendJson(res, 404, { error: 'not_found' })
  return true
}

module.exports = { handleEditRequest, resolveRoute, safeJoin }
