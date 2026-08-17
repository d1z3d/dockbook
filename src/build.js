'use strict'

const fs = require('fs')
const path = require('path')
const { renderMarkdown, extractFrontmatter, slugify } = require('./markdown')
const { buildOpenApiPages } = require('./openapi')
const { loadNavConfig, getFolderMeta } = require('./navConfig')

function walk (dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      files.push({ type: 'dir', full, name: e.name })
    } else if (/\.(md|mdx)$/i.test(e.name)) {
      files.push({ type: 'file', full, name: e.name })
    }
  }
  return files
}

function routeFromFile (relPath, base) {
  let route = relPath.replace(/\.(md|mdx)$/i, '').replace(/\\/g, '/')
  if (route.endsWith('/index')) route = route.slice(0, -'/index'.length)
  if (route === 'index') route = ''
  const full = base === '/' ? `/${route}` : `${base}/${route}`
  return full.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
}

function stripHtml (html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// Рекурсивно обходит content-папку, возвращает { pages: [], navNode }.
// relDir — путь папки относительно корня content-раздела (используется как
// ключ в dockbook.config.json для заголовка/порядка папки), entryIndex —
// индекс этого content-раздела в config.content, entryBase — его base
// (стабильный ключ раздела, не зависящий от переименований).
function scanContentDir (dir, base, relDir, entryIndex, ctx, navConfig, entryBase) {
  const files = walk(dir)
  const navMeta = getFolderMeta(navConfig, entryBase, relDir)
  const node = { title: navMeta.title || null, order: navMeta.order || null, items: [] }

  for (const entry of files) {
    if (entry.type === 'dir') {
      const childBase = `${base === '/' ? '' : base}/${entry.name}`.replace(/\/+/g, '/')
      const childRelDir = relDir ? `${relDir}/${entry.name}` : entry.name
      const child = scanContentDir(entry.full, childBase, childRelDir, entryIndex, ctx, navConfig, entryBase)
      if (child.node.items.length || child.node.page) {
        node.items.push({
          kind: 'section',
          title: child.node.title || prettify(entry.name),
          order: child.node.order,
          children: child.node.items,
          route: child.node.indexRoute || null,
          entry: entryIndex,
          path: childRelDir
        })
      }
      continue
    }

    const src = fs.readFileSync(entry.full, 'utf8')
    const { data, content } = extractFrontmatter(src)
    const relPathInDir = path.relative(dir, entry.full)
    const route = routeFromFile(relPathInDir, base)
    const { html, toc } = renderMarkdown(content, ctx)
    const title = data.title || (toc[0] && toc[0].text) || prettify(entry.name.replace(/\.(md|mdx)$/i, ''))

    ctx.pages.push({
      route,
      title,
      description: data.description || '',
      html,
      toc,
      order: data.order,
      searchText: stripHtml(html)
    })

    const isIndex = /^index\.(md|mdx)$/i.test(entry.name)
    if (isIndex) {
      node.indexRoute = route
      node.indexPageTitle = title
      node.title = node.title || title
    } else {
      node.items.push({ kind: 'page', title, order: data.order, route })
    }
  }

  node.items.sort(sortNav)
  return { node }
}

function prettify (name) {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function sortNav (a, b) {
  if (a.order != null && b.order != null) return a.order - b.order
  if (a.order != null) return -1
  if (b.order != null) return 1
  return a.title.localeCompare(b.title, 'ru')
}

function flattenNavForPager (items, acc = []) {
  for (const item of items) {
    if (item.kind === 'page') acc.push({ title: item.title, route: item.route })
    if (item.kind === 'section') {
      if (item.route) acc.push({ title: item.title, route: item.route })
      flattenNavForPager(item.children, acc)
    }
  }
  return acc
}

function build (config) {
  const pages = []
  const navSections = []
  const navConfig = loadNavConfig(config.root)

  config.content.forEach((contentEntry, entryIndex) => {
    const ctx = { pages, rootContentDir: contentEntry.dir }
    const { node } = scanContentDir(contentEntry.dir, contentEntry.base, '', entryIndex, ctx, navConfig, contentEntry.base)
    // Для корня content-раздела название берём с приоритетом от самой
    // главной страницы (index.md), а не из dockbook.config.json — в отличие от
    // вложенных папок, корень в сайдбаре отображается как страница, а не
    // как папка (см. renderRootTitle в assets/app.js), поэтому и
    // переименование должно попадать туда же, откуда берётся название.
    navSections.push({
      kind: 'section',
      title: contentEntry.label || (node.indexRoute ? node.indexPageTitle : node.title) || 'Docs',
      route: node.indexRoute || null,
      order: null,
      entry: entryIndex,
      path: '',
      children: node.items
    })
  })

  for (const entry of config.openapi) {
    const { pages: apiPages, navChildren } = buildOpenApiPages(entry, '')
    pages.push(...apiPages)
    navSections.push({
      kind: 'section',
      title: 'API Reference',
      route: entry.path,
      order: null,
      children: navChildren.map(c => ({ kind: 'page', title: c.title, route: c.route }))
    })
  }

  const flatPager = flattenNavForPager(navSections.flatMap(s => (s.route ? [{ kind: 'page', title: s.title, route: s.route }] : []).concat(s.children)))

  const pagesByRoute = {}
  for (const p of pages) pagesByRoute[p.route] = p

  const searchIndex = pages.map(p => ({
    route: p.route,
    title: p.title,
    description: p.description || '',
    text: (p.searchText || stripHtml(p.html || '')).slice(0, 4000)
  }))

  return {
    meta: {
      title: config.title,
      description: config.description,
      edit: config.edit,
      theme: config.theme
    },
    nav: navSections,
    pages: pagesByRoute,
    pager: flatPager,
    search: searchIndex
  }
}

function writeOutput (data, config, assetsDir) {
  const outDir = config.outDir
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(outDir, 'data'), { recursive: true })
  fs.writeFileSync(path.join(outDir, 'data', 'nav.json'), JSON.stringify({ meta: data.meta, nav: data.nav, pager: data.pager }))
  fs.writeFileSync(path.join(outDir, 'data', 'pages.json'), JSON.stringify(data.pages))
  fs.writeFileSync(path.join(outDir, 'data', 'search.json'), JSON.stringify(data.search))
  copyDir(assetsDir, outDir)

  for (const entry of config.content) {
    copyContentAssets(entry.dir, path.join(outDir, entry.base))
  }

  const themeOverride = path.join(config.root, 'theme.css')
  if (fs.existsSync(themeOverride)) {
    fs.copyFileSync(themeOverride, path.join(outDir, 'theme.css'))
  } else {
    fs.writeFileSync(path.join(outDir, 'theme.css'), '/* переопределите переменные из assets/app.css здесь */\n')
  }
}

// Копирует всё, кроме .md/.mdx и служебных файлов (картинки и т.п.),
// сохраняя относительный путь — чтобы markdown мог ссылаться на них
// обычным ![](./img.png) от корня раздела.
function copyContentAssets (srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const s = path.join(srcDir, entry.name)
    if (entry.isDirectory()) {
      copyContentAssets(s, path.join(destDir, entry.name))
      continue
    }
    if (/\.(md|mdx)$/i.test(entry.name)) continue
    fs.mkdirSync(destDir, { recursive: true })
    fs.copyFileSync(s, path.join(destDir, entry.name))
  }
}

function copyDir (src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

module.exports = { build, writeOutput }
