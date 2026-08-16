'use strict'

// Минимальный парсер YAML-подмножества, достаточного для frontmatter,
// .navigation.yml и openapi.yaml (блочные map/seq, flow-списки/объекты,
// кавычки, block-скаляры | и >). Без внешних зависимостей и сети.

function stripComment (line) {
  let inS = false
  let inD = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === "'" && !inD) inS = !inS
    else if (c === '"' && !inS) inD = !inD
    else if (c === '#' && !inS && !inD) {
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i).replace(/\s+$/, '')
    }
  }
  return line
}

function tokenize (src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const tokens = []
  for (const rawLine of lines) {
    if (/^\s*---\s*$/.test(rawLine) || /^\s*\.\.\.\s*$/.test(rawLine)) continue
    const line = stripComment(rawLine)
    if (line.trim() === '') continue
    const indent = line.length - line.trimStart().length
    tokens.push({ indent, text: line.trim(), raw: line })
  }
  return tokens
}

function unquote (str) {
  if (str.length >= 2 && str[0] === '"' && str[str.length - 1] === '"') {
    return str.slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  }
  if (str.length >= 2 && str[0] === "'" && str[str.length - 1] === "'") {
    return str.slice(1, -1).replace(/''/g, "'")
  }
  return str
}

function parseScalar (str) {
  str = str.trim()
  if (str === '') return null
  if ((str[0] === '"' && str[str.length - 1] === '"') || (str[0] === "'" && str[str.length - 1] === "'")) {
    return unquote(str)
  }
  if (str === 'null' || str === '~' || str === 'Null' || str === 'NULL') return null
  if (str === 'true' || str === 'True' || str === 'TRUE') return true
  if (str === 'false' || str === 'False' || str === 'FALSE') return false
  if (/^-?\d+$/.test(str)) return parseInt(str, 10)
  if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str)
  return str
}

function findColon (text) {
  let inS = false
  let inD = false
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'" && !inD) inS = !inS
    else if (c === '"' && !inS) inD = !inD
    else if ((c === '[' || c === '{') && !inS && !inD) depth++
    else if ((c === ']' || c === '}') && !inS && !inD) depth--
    else if (c === ':' && !inS && !inD && depth === 0) {
      if (i + 1 === text.length || text[i + 1] === ' ') return i
    }
  }
  return -1
}

function splitFlow (str) {
  const parts = []
  let depth = 0
  let inS = false
  let inD = false
  let cur = ''
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (c === "'" && !inD) inS = !inS
    else if (c === '"' && !inS) inD = !inD
    else if ((c === '[' || c === '{') && !inS && !inD) depth++
    else if ((c === ']' || c === '}') && !inS && !inD) depth--
    if (c === ',' && depth === 0 && !inS && !inD) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  if (cur.trim() !== '') parts.push(cur)
  return parts.map(s => s.trim())
}

function parseFlowValue (str) {
  str = str.trim()
  if (str.startsWith('[') && str.endsWith(']')) return parseFlowSeq(str)
  if (str.startsWith('{') && str.endsWith('}')) return parseFlowMap(str)
  return parseScalar(str)
}

function parseFlowSeq (str) {
  const inner = str.slice(1, -1).trim()
  if (inner === '') return []
  return splitFlow(inner).map(parseFlowValue)
}

function parseFlowMap (str) {
  const inner = str.slice(1, -1).trim()
  const obj = {}
  if (inner === '') return obj
  for (const part of splitFlow(inner)) {
    const idx = findColon(part)
    if (idx === -1) continue
    const key = unquote(part.slice(0, idx).trim())
    obj[key] = parseFlowValue(part.slice(idx + 1))
  }
  return obj
}

function isDash (text) {
  return text === '-' || text.startsWith('- ')
}

class Parser {
  constructor (tokens) {
    this.tokens = tokens
    this.pos = 0
  }

  peek () {
    return this.tokens[this.pos]
  }

  parseBlockScalar (indicator, keyThreshold) {
    const lines = []
    let baseIndent = null
    while (this.pos < this.tokens.length && this.tokens[this.pos].indent > keyThreshold) {
      const tok = this.tokens[this.pos]
      if (baseIndent === null) baseIndent = tok.indent
      lines.push(tok.raw.slice(baseIndent))
      this.pos++
    }
    const joined = lines.join(indicator[0] === '|' ? '\n' : ' ')
    return indicator[0] === '|' ? joined : joined.replace(/\s+/g, ' ').trim()
  }

  parseNode (threshold) {
    if (this.pos >= this.tokens.length) return null
    if (this.tokens[this.pos].indent < threshold) return null
    if (isDash(this.tokens[this.pos].text)) return this.parseSeq(threshold)
    return this.parseMap(threshold)
  }

  parseSeq (indent) {
    const arr = []
    while (this.pos < this.tokens.length && this.tokens[this.pos].indent === indent && isDash(this.tokens[this.pos].text)) {
      const text = this.tokens[this.pos].text
      if (text === '-') {
        this.pos++
        if (this.pos < this.tokens.length && this.tokens[this.pos].indent > indent) {
          arr.push(this.parseNode(this.tokens[this.pos].indent))
        } else {
          arr.push(null)
        }
      } else {
        const rest = text.slice(2)
        const newIndent = indent + 2
        this.tokens[this.pos] = { indent: newIndent, text: rest, raw: ' '.repeat(newIndent) + rest }
        arr.push(this.parseNode(newIndent))
      }
    }
    return arr
  }

  parseMap (threshold) {
    const obj = {}
    while (this.pos < this.tokens.length && this.tokens[this.pos].indent === threshold && !isDash(this.tokens[this.pos].text)) {
      const { text } = this.tokens[this.pos]
      const idx = findColon(text)
      if (idx === -1) {
        obj[unquote(text)] = null
        this.pos++
        continue
      }
      const key = unquote(text.slice(0, idx).trim())
      const valueStr = text.slice(idx + 1).trim()
      this.pos++
      if (valueStr === '') {
        if (this.pos < this.tokens.length && this.tokens[this.pos].indent > threshold) {
          obj[key] = this.parseNode(this.tokens[this.pos].indent)
        } else {
          obj[key] = null
        }
      } else if (valueStr === '|' || valueStr === '>' || valueStr === '|-' || valueStr === '>-') {
        obj[key] = this.parseBlockScalar(valueStr, threshold)
      } else if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
        obj[key] = parseFlowSeq(valueStr)
      } else if (valueStr.startsWith('{') && valueStr.endsWith('}')) {
        obj[key] = parseFlowMap(valueStr)
      } else {
        obj[key] = parseScalar(valueStr)
      }
    }
    return obj
  }
}

function parseYAML (src) {
  const tokens = tokenize(src)
  if (tokens.length === 0) return null
  const parser = new Parser(tokens)
  return parser.parseNode(tokens[0].indent)
}

module.exports = { parseYAML }
