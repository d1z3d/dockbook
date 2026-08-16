'use strict'

// Рендер диаграмм Mermaid и PlantUML в inline SVG на этапе сборки —
// без внешних библиотек (свои парсер и layout-движок). Поддерживается
// осознанно ограниченное подмножество синтаксиса:
//   Mermaid:  flowchart/graph (TD/LR/BT/RL/TB) и sequenceDiagram
//   PlantUML: sequence-диаграммы (@startuml ... @enduml)
// Всё остальное (classDiagram, gantt, pie, activity...) не парсится —
// вызывающий код должен откатиться на обычный блок кода.

function escapeHtml (str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Грубая оценка ширины текста без доступа к canvas/DOM (рендерим в Node).
function textWidth (text, fontSize) {
  let w = 0
  for (const ch of String(text)) {
    if (/[a-zA-Zа-яА-Я0-9]/.test(ch)) w += fontSize * 0.58
    else if (ch === ' ') w += fontSize * 0.32
    else w += fontSize * 0.5
  }
  return w
}

function wrapLabel (text, maxWidth, fontSize) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = []
  let cur = ''
  for (const word of words) {
    const candidate = cur ? `${cur} ${word}` : word
    if (textWidth(candidate, fontSize) > maxWidth && cur) {
      lines.push(cur)
      cur = word
    } else {
      cur = candidate
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

function svgText (x, y, lines, { fontSize = 13, anchor = 'middle', weight = 'normal', fill = 'var(--db-fg)' } = {}) {
  const lineHeight = fontSize * 1.3
  const startY = y - ((lines.length - 1) * lineHeight) / 2
  return lines.map((line, i) => (
    `<text x="${x}" y="${startY + i * lineHeight}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${fontSize}" font-weight="${weight}" style="fill:${fill}">${escapeHtml(line)}</text>`
  )).join('')
}

function wrapSvg (inner, width, height) {
  return `<div class="db-diagram"><svg viewBox="0 0 ${Math.ceil(width)} ${Math.ceil(height)}" width="${Math.ceil(width)}" height="${Math.ceil(height)}" xmlns="http://www.w3.org/2000/svg" font-family="var(--db-font)">` +
    `<defs>
      <marker id="db-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" style="fill:var(--db-fg-muted)"></path>
      </marker>
    </defs>` +
    inner + '</svg></div>'
}

// ---------------------------------------------------------------------
// Flowchart (mermaid graph/flowchart)
// ---------------------------------------------------------------------

const ARROW_PATTERNS = [
  { re: /^-->\|([^|]*)\|/, style: 'solid', arrow: true, label: 1 },
  { re: /^--\s*([^->][^-]*?)\s*-->/, style: 'solid', arrow: true, label: 1 },
  { re: /^-\.->\|([^|]*)\|/, style: 'dashed', arrow: true, label: 1 },
  { re: /^-\.-\s*([^.][^-]*?)\s*\.->/, style: 'dashed', arrow: true, label: 1 },
  { re: /^-\.->/, style: 'dashed', arrow: true },
  { re: /^==>\|([^|]*)\|/, style: 'thick', arrow: true, label: 1 },
  { re: /^==\s*([^=][^=]*?)\s*==>/, style: 'thick', arrow: true, label: 1 },
  { re: /^==>/, style: 'thick', arrow: true },
  { re: /^===/, style: 'thick', arrow: false },
  { re: /^-->/, style: 'solid', arrow: true },
  { re: /^---/, style: 'solid', arrow: false }
]

const NODE_RE = /^\s*([A-Za-zА-Яа-я0-9_]+)(\(\(([^)]*)\)\)|\[([^\]]*)\]|\{([^}]*)\}|\(([^)]*)\))?\s*/

function parseFlowchart (code) {
  const lines = code.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lines.length) return null
  const head = lines[0].match(/^(graph|flowchart)\s+(TD|TB|BT|LR|RL)?/i)
  if (!head) return null
  const direction = (head[2] || 'TD').toUpperCase()

  const nodes = new Map()
  const edges = []

  const ensureNode = (id, shape, label) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label: label != null ? label : id, shape: shape || 'rect' })
    } else if (label != null) {
      const n = nodes.get(id)
      n.label = label
      n.shape = shape || n.shape
    }
    return nodes.get(id)
  }

  for (const rawLine of lines.slice(1)) {
    if (/^(subgraph|end|classDef|class|click|style|linkStyle)\b/i.test(rawLine)) continue
    let rest = rawLine
    let prevId = null
    let guard = 0
    while (rest.length && guard++ < 100) {
      const nodeMatch = rest.match(NODE_RE)
      if (!nodeMatch) break
      const id = nodeMatch[1]
      let shape = null
      let label = null
      if (nodeMatch[3] !== undefined) { shape = 'circle'; label = nodeMatch[3] }
      else if (nodeMatch[4] !== undefined) { shape = 'rect'; label = nodeMatch[4] }
      else if (nodeMatch[5] !== undefined) { shape = 'diamond'; label = nodeMatch[5] }
      else if (nodeMatch[6] !== undefined) { shape = 'rounded'; label = nodeMatch[6] }
      const node = ensureNode(id, shape, label)
      rest = rest.slice(nodeMatch[0].length)

      if (prevId) edges.push({ from: prevId, to: node.id, style: 'solid', arrow: true, label: '' })
      prevId = null

      let matchedEdge = null
      for (const pattern of ARROW_PATTERNS) {
        const m = rest.match(pattern.re)
        if (m) { matchedEdge = { pattern, m }; break }
      }
      if (!matchedEdge) { prevId = null; break }
      rest = rest.slice(matchedEdge.m[0].length)
      const pendingEdge = {
        from: node.id,
        style: matchedEdge.pattern.style,
        arrow: matchedEdge.pattern.arrow,
        label: matchedEdge.pattern.label ? (matchedEdge.m[matchedEdge.pattern.label] || '').trim() : ''
      }
      const nextNodeMatch = rest.match(NODE_RE)
      if (!nextNodeMatch) break
      const nextId = nextNodeMatch[1]
      let nextShape = null
      let nextLabel = null
      if (nextNodeMatch[3] !== undefined) { nextShape = 'circle'; nextLabel = nextNodeMatch[3] }
      else if (nextNodeMatch[4] !== undefined) { nextShape = 'rect'; nextLabel = nextNodeMatch[4] }
      else if (nextNodeMatch[5] !== undefined) { nextShape = 'diamond'; nextLabel = nextNodeMatch[5] }
      else if (nextNodeMatch[6] !== undefined) { nextShape = 'rounded'; nextLabel = nextNodeMatch[6] }
      const nextNode = ensureNode(nextId, nextShape, nextLabel)
      rest = rest.slice(nextNodeMatch[0].length)
      pendingEdge.to = nextNode.id
      edges.push(pendingEdge)
      prevId = nextNode.id
    }
  }

  if (!nodes.size) return null
  return { direction, nodes: [...nodes.values()], edges }
}

function layoutFlowchart ({ direction, nodes, edges }) {
  const FONT = 13
  const PAD_X = 16
  const PAD_Y = 12
  const RANK_GAP = 70
  const NODE_GAP = 24

  const byId = new Map(nodes.map(n => [n.id, n]))
  const outgoing = new Map(nodes.map(n => [n.id, []]))
  const incoming = new Map(nodes.map(n => [n.id, []]))
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue
    outgoing.get(e.from).push(e.to)
    incoming.get(e.to).push(e.from)
  }

  // ранжирование: длиннейший путь от источника (без цикла — с защитой)
  const rank = new Map(nodes.map(n => [n.id, 0]))
  const order = [...nodes.map(n => n.id)]
  for (let pass = 0; pass < nodes.length + 1; pass++) {
    let changed = false
    for (const e of edges) {
      if (!byId.has(e.from) || !byId.has(e.to)) continue
      const r = rank.get(e.from) + 1
      if (r > rank.get(e.to)) { rank.set(e.to, r); changed = true }
    }
    if (!changed) break
  }

  const layers = []
  for (const id of order) {
    const r = rank.get(id)
    if (!layers[r]) layers[r] = []
    layers[r].push(byId.get(id))
  }

  for (const node of nodes) {
    const lines = wrapLabel(node.label, 160, FONT)
    node.lines = lines
    const textW = Math.max(...lines.map(l => textWidth(l, FONT)))
    if (node.shape === 'circle') {
      const d = Math.max(56, textW + PAD_X * 2, lines.length * FONT * 1.3 + PAD_Y * 2)
      node.w = d
      node.h = d
    } else if (node.shape === 'diamond') {
      node.w = Math.max(90, textW * 1.7 + PAD_X * 2)
      node.h = Math.max(56, lines.length * FONT * 1.3 + PAD_Y * 3)
    } else {
      node.w = Math.max(70, textW + PAD_X * 2)
      node.h = Math.max(40, lines.length * FONT * 1.3 + PAD_Y * 2)
    }
  }

  const horizontal = direction === 'LR' || direction === 'RL'
  let crossSize = 0
  for (const layer of layers) {
    if (!layer) continue
    const sizes = layer.map(n => (horizontal ? n.h : n.w))
    const total = sizes.reduce((a, b) => a + b, 0) + NODE_GAP * Math.max(0, layer.length - 1)
    crossSize = Math.max(crossSize, total)
  }

  let rankPos = PAD_Y + 10
  const rankGaps = []
  layers.forEach((layer, i) => {
    if (!layer) return
    const rankSize = Math.max(...layer.map(n => (horizontal ? n.w : n.h)))
    rankGaps.push({ start: rankPos, size: rankSize })
    layer.forEach(n => { n.rankStart = rankPos; n.rankSize = rankSize })
    rankPos += rankSize + RANK_GAP
  })
  const totalRankAxis = rankPos - RANK_GAP + PAD_Y

  layers.forEach(layer => {
    if (!layer) return
    const sizes = layer.map(n => (horizontal ? n.h : n.w))
    const total = sizes.reduce((a, b) => a + b, 0) + NODE_GAP * Math.max(0, layer.length - 1)
    let pos = (crossSize - total) / 2
    layer.forEach((n, i) => {
      const size = sizes[i]
      n.crossCenter = pos + size / 2
      pos += size + NODE_GAP
    })
  })

  for (const n of nodes) {
    const rankCenter = n.rankStart + n.rankSize / 2
    if (direction === 'TD' || direction === 'TB') { n.cx = n.crossCenter; n.cy = rankCenter }
    else if (direction === 'BT') { n.cx = n.crossCenter; n.cy = totalRankAxis - rankCenter }
    else if (direction === 'LR') { n.cx = rankCenter; n.cy = n.crossCenter }
    else { n.cx = totalRankAxis - rankCenter; n.cy = n.crossCenter }
  }

  const width = (horizontal ? totalRankAxis : crossSize) + PAD_X * 2
  const height = (horizontal ? crossSize : totalRankAxis) + PAD_Y * 2
  const offsetX = horizontal ? PAD_X : PAD_X
  const offsetY = PAD_Y
  for (const n of nodes) { n.cx += offsetX; n.cy += offsetY }

  return { nodes, edges: edges.filter(e => byId.has(e.from) && byId.has(e.to)), width: Math.max(width, 120), height: Math.max(height, 80), byId }
}

function edgeAnchor (node, dx, dy) {
  if (node.shape === 'circle') {
    const r = node.w / 2
    const len = Math.hypot(dx, dy) || 1
    return { x: node.cx + (dx / len) * r, y: node.cy + (dy / len) * r }
  }
  if (node.shape === 'diamond') {
    const hw = node.w / 2
    const hh = node.h / 2
    const t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh || 1)
    return { x: node.cx + dx * t, y: node.cy + dy * t }
  }
  const hw = node.w / 2
  const hh = node.h / 2
  if (Math.abs(dx) * hh > Math.abs(dy) * hw) {
    return { x: node.cx + Math.sign(dx) * hw, y: node.cy + (dy * hw) / (Math.abs(dx) || 1) }
  }
  return { x: node.cx + (dx * hh) / (Math.abs(dy) || 1), y: node.cy + Math.sign(dy) * hh }
}

function renderNodeShape (node) {
  const strokeW = 1.5
  const common = `style="fill:var(--db-bg-alt);stroke:var(--db-accent);stroke-width:${strokeW}"`
  if (node.shape === 'circle') {
    return `<circle cx="${node.cx}" cy="${node.cy}" r="${node.w / 2}" ${common}></circle>`
  }
  if (node.shape === 'diamond') {
    const hw = node.w / 2
    const hh = node.h / 2
    const pts = `${node.cx},${node.cy - hh} ${node.cx + hw},${node.cy} ${node.cx},${node.cy + hh} ${node.cx - hw},${node.cy}`
    return `<polygon points="${pts}" ${common}></polygon>`
  }
  const rx = node.shape === 'rounded' ? Math.min(18, node.h / 2) : 4
  return `<rect x="${node.cx - node.w / 2}" y="${node.cy - node.h / 2}" width="${node.w}" height="${node.h}" rx="${rx}" ${common}></rect>`
}

function renderFlowchartSvg (ast) {
  const layout = layoutFlowchart(ast)
  let inner = ''

  for (const e of layout.edges) {
    const from = layout.byId.get(e.from)
    const to = layout.byId.get(e.to)
    const dx = to.cx - from.cx
    const dy = to.cy - from.cy
    const p1 = edgeAnchor(from, dx, dy)
    const p2 = edgeAnchor(to, -dx, -dy)
    const dash = e.style === 'dashed' ? ' stroke-dasharray="5,4"' : ''
    const width = e.style === 'thick' ? 2.5 : 1.5
    const marker = e.arrow ? ' marker-end="url(#db-arrow)"' : ''
    inner += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" style="stroke:var(--db-fg-muted);stroke-width:${width}"${dash}${marker}></line>`
    if (e.label) {
      const mx = (p1.x + p2.x) / 2
      const my = (p1.y + p2.y) / 2
      const w = textWidth(e.label, 12) + 10
      inner += `<rect x="${(mx - w / 2).toFixed(1)}" y="${(my - 9).toFixed(1)}" width="${w.toFixed(1)}" height="18" style="fill:var(--db-bg)"></rect>`
      inner += svgText(mx, my, [e.label], { fontSize: 12 })
    }
  }

  for (const n of layout.nodes) {
    inner += renderNodeShape(n)
    inner += svgText(n.cx, n.cy, n.lines, { fontSize: 13 })
  }

  return wrapSvg(inner, layout.width, layout.height)
}

// ---------------------------------------------------------------------
// Sequence diagrams (общий рендерер для mermaid sequenceDiagram и plantuml)
// ---------------------------------------------------------------------

function layoutSequence ({ participants, events }) {
  const FONT = 13
  const BOX_H = 36
  const TOP = 16
  const GAP_MIN = 130
  const ROW_H = 46

  const widths = participants.map(p => Math.max(80, textWidth(p.label, FONT) + 28))
  let x = 40
  for (let i = 0; i < participants.length; i++) {
    const half = widths[i] / 2
    x += half
    participants[i].x = x
    participants[i].w = widths[i]
    x += half + (i < participants.length - 1 ? GAP_MIN : 0)
  }
  const width = x + 40

  let y = TOP + BOX_H + 24
  for (const ev of events) {
    ev.y = y
    y += ev.type === 'note' ? ROW_H * 1.1 : ROW_H
  }
  const height = y + 20

  return { participants, events, width, height, boxH: BOX_H, top: TOP }
}

function renderSequenceSvg (ast) {
  const layout = layoutSequence(ast)
  const byId = new Map(layout.participants.map(p => [p.id, p]))
  let inner = ''

  for (const p of layout.participants) {
    inner += `<line x1="${p.x}" y1="${layout.top + layout.boxH}" x2="${p.x}" y2="${layout.height - 16}" style="stroke:var(--db-fg-muted);stroke-width:1.5" stroke-dasharray="4,4"></line>`
  }

  for (const ev of layout.events) {
    if (ev.type === 'message') {
      const from = byId.get(ev.from)
      const to = byId.get(ev.to)
      if (!from || !to) continue
      const dash = ev.style === 'dashed' ? ' stroke-dasharray="5,4"' : ''
      inner += `<line x1="${from.x}" y1="${ev.y}" x2="${to.x}" y2="${ev.y}" style="stroke:var(--db-fg-muted);stroke-width:1.5"${dash} marker-end="url(#db-arrow)"></line>`
      if (ev.label) {
        const mx = (from.x + to.x) / 2
        const w = textWidth(ev.label, 12) + 10
        inner += `<rect x="${(mx - w / 2).toFixed(1)}" y="${(ev.y - 22).toFixed(1)}" width="${w.toFixed(1)}" height="16" style="fill:var(--db-bg)"></rect>`
        inner += svgText(mx, ev.y - 14, [ev.label], { fontSize: 12 })
      }
    } else if (ev.type === 'note') {
      const ids = ev.over.map(id => byId.get(id)).filter(Boolean)
      if (!ids.length) continue
      const xs = ids.map(p => p.x)
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2
      const w = Math.max(90, textWidth(ev.text, 12) + 20, Math.max(...xs) - Math.min(...xs) + 60)
      inner += `<rect x="${(cx - w / 2).toFixed(1)}" y="${(ev.y - 12).toFixed(1)}" width="${w.toFixed(1)}" height="24" rx="3" style="fill:var(--db-bg);stroke:var(--db-fg-muted)"></rect>`
      inner += svgText(cx, ev.y, [ev.text], { fontSize: 12 })
    }
  }

  for (const p of layout.participants) {
    inner += `<rect x="${p.x - p.w / 2}" y="${layout.top}" width="${p.w}" height="${layout.boxH}" rx="4" style="fill:var(--db-bg-alt);stroke:var(--db-accent);stroke-width:1.5"></rect>`
    inner += svgText(p.x, layout.top + layout.boxH / 2, [p.label], { fontSize: 13, weight: '600' })
  }

  return wrapSvg(inner, layout.width, layout.height)
}

function parseMermaidSequence (code) {
  const lines = code.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lines.length || !/^sequenceDiagram/i.test(lines[0])) return null

  const participants = []
  const byId = new Map()
  const events = []
  const ensure = (id, label) => {
    if (!byId.has(id)) {
      const p = { id, label: label || id }
      byId.set(id, p)
      participants.push(p)
    }
    return byId.get(id)
  }

  for (const line of lines.slice(1)) {
    let m
    if ((m = line.match(/^participant\s+([\w-]+)(?:\s+as\s+(.+))?$/i)) ||
        (m = line.match(/^actor\s+([\w-]+)(?:\s+as\s+(.+))?$/i))) {
      ensure(m[1], m[2])
      continue
    }
    if ((m = line.match(/^Note\s+(over|left of|right of)\s+([\w,\- ]+?)\s*:\s*(.*)$/i))) {
      const ids = m[2].split(',').map(s => s.trim())
      ids.forEach(id => ensure(id))
      events.push({ type: 'note', over: ids, text: m[3] })
      continue
    }
    if ((m = line.match(/^(\w+)\s*(-->>|--\)|->>|-\)|-->|->)\s*(\w+)\s*:\s*(.*)$/))) {
      const style = m[2].startsWith('--') ? 'dashed' : 'solid'
      const from = ensure(m[1])
      const to = ensure(m[3])
      events.push({ type: 'message', from: from.id, to: to.id, style, label: m[4] })
    }
  }

  if (!participants.length || !events.length) return null
  return { participants, events }
}

function parsePlantUmlSequence (code) {
  const lines = code.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const participants = []
  const byId = new Map()
  const events = []
  const ensure = (id, label) => {
    if (!byId.has(id)) {
      const p = { id, label: label || id }
      byId.set(id, p)
      participants.push(p)
    }
    return byId.get(id)
  }

  for (const line of lines) {
    if (/^@(start|end)uml/i.test(line)) continue
    let m
    if ((m = line.match(/^(participant|actor|boundary|control|entity|database)\s+"?([^"]+?)"?(?:\s+as\s+([\w-]+))?$/i))) {
      const label = m[2].trim()
      const id = m[3] || label
      ensure(id, label)
      continue
    }
    if ((m = line.match(/^note\s+(left|right)(?:\s+of)?\s+([\w-]+)\s*:\s*(.*)$/i))) {
      ensure(m[2])
      events.push({ type: 'note', over: [m[2]], text: m[3] })
      continue
    }
    if ((m = line.match(/^note\s+over\s+([\w,\- ]+?)\s*:\s*(.*)$/i))) {
      const ids = m[1].split(',').map(s => s.trim())
      ids.forEach(id => ensure(id))
      events.push({ type: 'note', over: ids, text: m[2] })
      continue
    }
    if (/^(activate|deactivate|autonumber|title|skinparam)\b/i.test(line)) continue
    if ((m = line.match(/^"?(\w+)"?\s*(<-->|<--|<-|-->>|-->|->>|->|--)\s*"?(\w+)"?\s*:\s*(.*)$/))) {
      const style = m[2].includes('--') ? 'dashed' : 'solid'
      const reversed = m[2].startsWith('<')
      const a = ensure(m[1])
      const b = ensure(m[3])
      const from = reversed ? b : a
      const to = reversed ? a : b
      events.push({ type: 'message', from: from.id, to: to.id, style, label: m[4] })
    }
  }

  if (!participants.length || !events.length) return null
  return { participants, events }
}

// ---------------------------------------------------------------------

function renderMermaid (code) {
  try {
    const trimmed = code.trim()
    if (/^(graph|flowchart)\s/i.test(trimmed)) {
      const ast = parseFlowchart(trimmed)
      if (ast) return renderFlowchartSvg(ast)
    }
    if (/^sequenceDiagram/i.test(trimmed)) {
      const ast = parseMermaidSequence(trimmed)
      if (ast) return renderSequenceSvg(ast)
    }
  } catch {
    return null
  }
  return null
}

function renderPlantUml (code) {
  try {
    const ast = parsePlantUmlSequence(code)
    if (ast) return renderSequenceSvg(ast)
  } catch {
    return null
  }
  return null
}

module.exports = { renderMermaid, renderPlantUml }
