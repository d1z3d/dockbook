'use strict'

const fs = require('fs')
const path = require('path')
const {
  extractFrontmatter,
  Lines,
  parseBlockAttrs,
  collectRawUntilClose,
  splitTopLevelSubBlocks,
  consumeFence,
  HINT_TITLES
} = require('./markdown')

// Превращает исходный markdown dockbook (с блоками ::hint, ::tabs, ::steps,
// ::accordion, ::cards, ::code-group, ::mermaid/::plantuml) в «чистый»
// markdown без кастомного синтаксиса — для выгрузки в Confluence и другие
// системы, которые понимают только обычный markdown. Обычные конструкции
// (заголовки, списки, таблицы, код, ссылки) переносятся дословно.

function transformBlocks (lines) {
  let out = ''
  while (!lines.eof()) {
    const line = lines.peek()

    const fence = line.match(/^(```+|~~~+)/)
    if (fence) {
      const fenceChar = fence[1][0]
      const fenceLen = fence[1].length
      out += lines.next() + '\n'
      while (!lines.eof()) {
        const l = lines.next()
        out += l + '\n'
        const trimmed = l.trim()
        const isClose = trimmed.length >= fenceLen && trimmed !== '' &&
          trimmed.split('').every(ch => ch === fenceChar)
        if (isClose) break
      }
      continue
    }

    const customOpen = line.match(/^::([\w-]+)(?:\{(.*)\})?\s*$/)
    if (customOpen && line.trim() !== '::') {
      lines.next()
      const name = customOpen[1]
      const attrs = customOpen[2] ? parseBlockAttrs(customOpen[2]) : {}
      out += transformCustomBlock(name, attrs, lines)
      continue
    }

    out += lines.next() + '\n'
  }
  return out
}

function transformCustomBlock (name, attrs, lines) {
  const raw = collectRawUntilClose(lines)

  switch (name) {
    case 'hint': {
      const type = attrs.type || 'info'
      const title = attrs.title || HINT_TITLES[type] || HINT_TITLES.info
      const body = transformBlocks(new Lines(raw)).replace(/\n+$/, '')
      const quoted = body.split('\n').map(l => (l ? `> ${l}` : '>')).join('\n')
      return `> **${title}**\n>\n${quoted}\n\n`
    }
    case 'tabs': {
      const tabs = splitTopLevelSubBlocks(raw, ['tab'])
      return tabs.map((t, i) => {
        const label = t.attrs.label || `Tab ${i + 1}`
        const body = transformBlocks(new Lines(t.body)).trim()
        return `#### ${label}\n\n${body}\n`
      }).join('\n') + '\n'
    }
    case 'code-group': {
      const groupLines = new Lines(raw)
      let out = ''
      while (!groupLines.eof()) {
        const l = groupLines.peek()
        if (/^```/.test(l.trim()) || /^~~~/.test(l.trim())) {
          const fenceChar = l.trim().startsWith('```') ? '```' : '~~~'
          const { lang, label, code } = consumeFence(groupLines, fenceChar)
          if (label) out += `**${label}**\n\n`
          out += '```' + (lang || '') + '\n' + code + '\n```\n\n'
        } else {
          groupLines.next()
        }
      }
      return out
    }
    case 'steps': {
      return transformBlocks(new Lines(raw))
    }
    case 'accordion': {
      const items = splitTopLevelSubBlocks(raw, ['accordion-item'])
      return items.map(it => {
        const label = it.attrs.label || ''
        const body = transformBlocks(new Lines(it.body)).trim()
        return `#### ${label}\n\n${body}\n`
      }).join('\n') + '\n'
    }
    case 'cards': {
      const items = splitTopLevelSubBlocks(raw, ['card'])
      return items.map(it => {
        const title = it.attrs.title || ''
        const href = it.attrs.to || it.attrs.href || ''
        const body = transformBlocks(new Lines(it.body)).trim()
        const heading = href ? `**[${title}](${href})**` : `**${title}**`
        return body ? `${heading}\n\n${body}\n` : `${heading}\n`
      }).join('\n') + '\n'
    }
    case 'mermaid':
    case 'plantuml': {
      const code = raw.replace(/^```[\w-]*\n?/, '').replace(/```\s*$/, '').trim()
      return '```' + name + '\n' + code + '\n```\n\n'
    }
    default: {
      return transformBlocks(new Lines(raw))
    }
  }
}

function exportMarkdown (src) {
  const { data, content } = extractFrontmatter(src)
  let body = transformBlocks(new Lines(content))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (data.title && !/^#\s+/.test(body)) {
    body = `# ${data.title}\n\n${body}`
  }
  return body + '\n'
}

function exportDir (srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const s = path.join(srcDir, entry.name)
    if (entry.isDirectory()) {
      exportDir(s, path.join(destDir, entry.name))
      continue
    }
    if (/\.(md|mdx)$/i.test(entry.name)) {
      const src = fs.readFileSync(s, 'utf8')
      const out = exportMarkdown(src)
      const destName = entry.name.replace(/\.mdx$/i, '.md')
      fs.writeFileSync(path.join(destDir, destName), out, 'utf8')
    } else {
      fs.copyFileSync(s, path.join(destDir, entry.name))
    }
  }
}

function exportContent (config, outDir) {
  fs.rmSync(outDir, { recursive: true, force: true })
  for (const entry of config.content) {
    const rel = entry.base === '/' ? '' : entry.base.replace(/^\//, '')
    const target = rel ? path.join(outDir, rel) : outDir
    exportDir(entry.dir, target)
  }
}

module.exports = { exportMarkdown, exportContent }
