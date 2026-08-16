'use strict'

// Минимальная подсветка синтаксиса без внешних библиотек. Не полноценный
// парсер языка — упрощённый токенайзер по регуляркам, достаточный для
// коротких примеров кода в документации. Работает на этапе сборки в Node.

function esc (str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function span (cls, text) {
  return cls ? `<span class="tok-${cls}">${esc(text)}</span>` : esc(text)
}

// --- универсальный сканер: строки/числа/комментарии/идентификаторы ------

function scanGeneric (code, spec) {
  const { lineComment, blockComment, string, number, identifier, classify } = spec
  let out = ''
  let i = 0
  const n = code.length
  let prevSignificant = ''

  const tryMatch = (re) => {
    if (!re) return null
    re.lastIndex = i
    const m = re.exec(code)
    return (m && m.index === i && m[0].length > 0) ? m[0] : null
  }

  const peekNonSpace = (from) => {
    let j = from
    while (j < n && (code[j] === ' ' || code[j] === '\t')) j++
    return code[j]
  }

  while (i < n) {
    let m
    if ((m = tryMatch(lineComment))) { out += span('com', m); i += m.length; prevSignificant = ''; continue }
    if ((m = tryMatch(blockComment))) { out += span('com', m); i += m.length; prevSignificant = ''; continue }
    if ((m = tryMatch(string))) {
      const cls = peekNonSpace(i + m.length) === ':' ? 'prop' : 'str'
      out += span(cls, m); i += m.length; prevSignificant = ''; continue
    }
    if ((m = tryMatch(number))) { out += span('num', m); i += m.length; prevSignificant = ''; continue }
    if ((m = tryMatch(identifier))) {
      const nextChar = peekNonSpace(i + m.length)
      const cls = classify(m, nextChar, prevSignificant)
      out += span(cls, m)
      prevSignificant = m
      i += m.length
      continue
    }
    const ch = code[i]
    if (!/\s/.test(ch)) prevSignificant = ch
    out += esc(ch)
    i++
  }
  return out
}

// --- ключевые слова по языкам --------------------------------------------

const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'default', 'break', 'continue', 'class', 'extends', 'new', 'this',
  'super', 'import', 'export', 'from', 'as', 'async', 'await', 'try', 'catch', 'finally',
  'throw', 'typeof', 'instanceof', 'in', 'of', 'yield', 'static', 'get', 'set', 'void',
  'delete', 'interface', 'type', 'enum', 'implements', 'public', 'private', 'protected',
  'readonly', 'namespace', 'declare', 'module'
])
const JS_LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'])

const PY_KEYWORDS = new Set([
  'def', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'class',
  'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield',
  'pass', 'global', 'nonlocal', 'assert', 'del', 'in', 'is', 'not', 'and', 'or', 'async', 'await'
])
const PY_LITERALS = new Set(['True', 'False', 'None'])

const BASH_KEYWORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac',
  'function', 'return', 'export', 'local', 'readonly', 'in', 'exit', 'break', 'continue',
  'declare', 'set', 'echo', 'source', 'alias', 'unset', 'shift', 'trap'
])

const YAML_LITERALS = new Set(['true', 'false', 'yes', 'no', 'null', '~', 'True', 'False', 'Null'])

// --- конфигурации языков --------------------------------------------------

function jsHighlighter (code) {
  return scanGeneric(code, {
    lineComment: /\/\/.*/y,
    blockComment: /\/\*[\s\S]*?\*\//y,
    string: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/y,
    number: /0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?/y,
    identifier: /[A-Za-z_$][A-Za-z0-9_$]*/y,
    classify (word, nextChar, prevSignificant) {
      if (JS_KEYWORDS.has(word) || JS_LITERALS.has(word)) return 'kw'
      if (nextChar === '(') return 'fn'
      if (nextChar === ':') return 'prop'
      if (prevSignificant === '.') return 'prop'
      return null
    }
  })
}

function pyHighlighter (code) {
  return scanGeneric(code, {
    lineComment: /#.*/y,
    string: /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y,
    number: /\d+\.?\d*/y,
    identifier: /[A-Za-z_][A-Za-z0-9_]*/y,
    classify (word, nextChar, prevSignificant) {
      if (PY_KEYWORDS.has(word) || PY_LITERALS.has(word)) return 'kw'
      if (nextChar === '(') return 'fn'
      if (prevSignificant === '.') return 'prop'
      return null
    }
  })
}

function bashHighlighter (code) {
  return scanGeneric(code, {
    lineComment: /#.*/y,
    string: /"(?:\\.|[^"\\])*"|'[^']*'/y,
    number: /\b\d+\b/y,
    identifier: /\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\$[0-9@#?*$!-]|[A-Za-z_][A-Za-z0-9_-]*/y,
    classify (word) {
      if (word[0] === '$') return 'var'
      if (BASH_KEYWORDS.has(word)) return 'kw'
      return null
    }
  })
}

function jsonHighlighter (code) {
  return scanGeneric(code, {
    string: /"(?:\\.|[^"\\])*"/y,
    number: /-?\d+\.?\d*(?:[eE][+-]?\d+)?/y,
    identifier: /true|false|null/y,
    classify (word) { return 'kw' }
  })
}

function yamlHighlighter (code) {
  return scanGeneric(code, {
    lineComment: /#.*/y,
    string: /"(?:\\.|[^"\\])*"|'(?:[^']|'')*'/y,
    number: /-?\d+\.?\d*\b/y,
    identifier: /[A-Za-z_][A-Za-z0-9_-]*/y,
    classify (word, nextChar) {
      if (nextChar === ':') return 'prop'
      if (YAML_LITERALS.has(word)) return 'kw'
      return null
    }
  })
}

function cssHighlighter (code) {
  return scanGeneric(code, {
    blockComment: /\/\*[\s\S]*?\*\//y,
    string: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y,
    number: /-?\d*\.?\d+(?:[a-zA-Z%]+)?/y,
    identifier: /--[A-Za-z0-9_-]+|@[A-Za-z-]+|#[0-9a-fA-F]{3,8}\b|[A-Za-z_-][A-Za-z0-9_-]*/y,
    classify (word, nextChar) {
      if (word[0] === '@') return 'kw'
      if (/^#[0-9a-fA-F]{3,8}$/.test(word)) return 'num'
      if (word.startsWith('--')) return 'prop'
      if (word === 'important') return 'kw'
      if (nextChar === ':') return 'prop'
      return null
    }
  })
}

function htmlHighlighter (code) {
  let out = ''
  let i = 0
  const n = code.length
  while (i < n) {
    if (code.startsWith('<!--', i)) {
      let end = code.indexOf('-->', i)
      end = end === -1 ? n : end + 3
      out += span('com', code.slice(i, end))
      i = end
      continue
    }
    if (code[i] === '<') {
      let end = code.indexOf('>', i)
      end = end === -1 ? n - 1 : end
      out += highlightHtmlTag(code.slice(i, end + 1))
      i = end + 1
      continue
    }
    out += esc(code[i])
    i++
  }
  return out
}

function highlightHtmlTag (tag) {
  let out = ''
  let i = 0
  const n = tag.length
  const open = /^<\/?/.exec(tag)
  out += esc(open[0]); i += open[0].length
  const name = /^[A-Za-z][A-Za-z0-9-]*/.exec(tag.slice(i))
  if (name) { out += span('tag', name[0]); i += name[0].length }
  while (i < n) {
    const ch = tag[i]
    if (ch === '>' || (ch === '/' && tag[i + 1] === '>')) { out += esc(tag.slice(i)); break }
    if (/\s/.test(ch)) { out += ch; i++; continue }
    const attr = /^[A-Za-z_:][A-Za-z0-9_:.-]*/.exec(tag.slice(i))
    if (attr) {
      out += span('prop', attr[0]); i += attr[0].length
      if (tag[i] === '=') {
        out += esc('='); i++
        const val = /^"[^"]*"|^'[^']*'/.exec(tag.slice(i))
        if (val) { out += span('str', val[0]); i += val[0].length }
      }
      continue
    }
    out += esc(ch); i++
  }
  return out
}

// --- markdown (для примеров в самой документации) ------------------------

function highlightAttrs (attrStr) {
  const inner = attrStr.slice(1, -1)
  const re = /([\w-]+)=("([^"]*)"|'([^']*)'|\S+)/g
  let out = esc('{')
  let last = 0
  let m
  while ((m = re.exec(inner))) {
    out += esc(inner.slice(last, m.index))
    out += span('prop', m[1]) + esc('=') + span('str', m[2])
    last = re.lastIndex
  }
  out += esc(inner.slice(last)) + esc('}')
  return out
}

function highlightInlineSpans (text) {
  let out = ''
  let i = 0
  const n = text.length
  while (i < n) {
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end === -1) { out += esc(text.slice(i)); break }
      out += span('str', text.slice(i, end + 1)); i = end + 1; continue
    }
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2)
      if (end === -1) { out += esc(text.slice(i)); break }
      out += span('kw', text.slice(i, end + 2)); i = end + 2; continue
    }
    const link = /^\[[^\]]*\]\([^)]*\)/.exec(text.slice(i))
    if (link) { out += span('fn', link[0]); i += link[0].length; continue }
    out += esc(text[i]); i++
  }
  return out
}

function highlightInlineMd (line) {
  const bq = line.match(/^(\s*>+\s?)/)
  if (bq) return span('com', bq[1]) + highlightInlineSpans(line.slice(bq[1].length))
  const list = line.match(/^(\s*(?:[-*+]|\d+[.)])\s+)/)
  if (list) return span('com', list[1]) + highlightInlineSpans(line.slice(list[1].length))
  return highlightInlineSpans(line)
}

function mdHighlighter (code) {
  const lines = code.split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    const fence = line.match(/^(\s*)(```+|~~~+)(\s*)([\w-]*)(\s*\[[^\]]*\])?\s*$/)
    if (fence) {
      const [, indent, mark, gap, lang, label] = fence
      out.push(indent + span('com', mark) + esc(gap) + (lang ? span('fn', lang) : '') + (label ? span('str', label) : ''))
      i++
      const body = []
      const closeRe = new RegExp('^\\s*' + mark[0] + '{' + mark.length + ',}\\s*$')
      while (i < lines.length && !closeRe.test(lines[i])) { body.push(lines[i]); i++ }
      const inner = body.join('\n')
      const innerFn = HIGHLIGHTERS[(lang || '').toLowerCase()]
      out.push(innerFn ? innerFn(inner) : esc(inner))
      if (i < lines.length) { out.push(span('com', lines[i])); i++ }
      continue
    }

    const directive = line.match(/^(\s*)(::[\w-]*)(\{[^}]*\})?\s*$/)
    if (directive) {
      out.push(directive[1] + span('kw', directive[2]) + (directive[3] ? highlightAttrs(directive[3]) : ''))
      i++
      continue
    }

    const heading = line.match(/^(\s*)(#{1,6})(\s.*)?$/)
    if (heading) {
      out.push(heading[1] + span('kw', heading[2]) + (heading[3] ? highlightInlineSpans(heading[3]) : ''))
      i++
      continue
    }

    out.push(highlightInlineMd(line))
    i++
  }
  return out.join('\n')
}

const HIGHLIGHTERS = {
  js: jsHighlighter,
  javascript: jsHighlighter,
  mjs: jsHighlighter,
  cjs: jsHighlighter,
  jsx: jsHighlighter,
  ts: jsHighlighter,
  typescript: jsHighlighter,
  tsx: jsHighlighter,
  json: jsonHighlighter,
  json5: jsonHighlighter,
  yaml: yamlHighlighter,
  yml: yamlHighlighter,
  bash: bashHighlighter,
  sh: bashHighlighter,
  shell: bashHighlighter,
  zsh: bashHighlighter,
  shellscript: bashHighlighter,
  python: pyHighlighter,
  py: pyHighlighter,
  css: cssHighlighter,
  scss: cssHighlighter,
  less: cssHighlighter,
  html: htmlHighlighter,
  xml: htmlHighlighter,
  svg: htmlHighlighter,
  vue: htmlHighlighter,
  md: mdHighlighter,
  markdown: mdHighlighter,
  mdx: mdHighlighter
}

// возвращает уже готовый (экранированный) HTML — просто escapeHtml, если
// язык не распознан или не задан
function highlight (lang, code) {
  const fn = HIGHLIGHTERS[(lang || '').toLowerCase()]
  if (!fn) return esc(code)
  try {
    return fn(code)
  } catch {
    return esc(code)
  }
}

module.exports = { highlight }
