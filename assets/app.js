;(function () {
  'use strict'

  var state = { nav: null, meta: null, pages: null, pager: [], search: null, current: null, editEnabled: false, editEntries: [] }
  var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '')

  // Короткая подпись сочетания клавиш для бейджей на кнопках редактора:
  // символы ⌘⌥⇧ на Mac, слова Ctrl/Alt/Shift на остальных платформах.
  function hotkeyLabel (mods, key) {
    if (isMac) {
      var symbols = { mod: '⌘', alt: '⌥', shift: '⇧' }
      return mods.map(function (m) { return symbols[m] }).join('') + key
    }
    var names = { mod: 'Ctrl', alt: 'Alt', shift: 'Shift' }
    return mods.map(function (m) { return names[m] }).join('+') + (mods.length ? '+' : '') + key
  }

  function qs (sel, root) { return (root || document).querySelector(sel) }
  function el (tag, attrs, children) {
    var node = document.createElement(tag)
    for (var k in attrs || {}) {
      if (k === 'html') node.innerHTML = attrs[k]
      else if (k === 'text') node.textContent = attrs[k]
      else node.setAttribute(k, attrs[k])
    }
    ;(children || []).forEach(function (c) { if (c) node.appendChild(c) })
    return node
  }

  // ---- загрузка данных -------------------------------------------------

  function fetchJSON (path) {
    return fetch(path, { cache: 'no-store' }).then(function (r) { return r.json() })
  }

  function boot () {
    Promise.all([fetchJSON('/data/nav.json'), fetchJSON('/data/pages.json')]).then(function (res) {
      state.meta = res[0].meta
      state.nav = res[0].nav
      state.pager = res[0].pager
      state.pages = res[1]
      document.title = state.meta.title
      qs('#db-site-title-text').textContent = state.meta.title
      renderSidebar()
      renderRoute(location.pathname, false)
    }).catch(function (err) {
      qs('#db-content').innerHTML = '<p>Не удалось загрузить документацию: ' + escapeHtml(err.message) + '</p>'
    })
    detectEditApi()
  }

  // ---- локальное редактирование (dockbook dev) ----------------------------

  function detectEditApi () {
    fetch('/__dockbook_api/status', { cache: 'no-store' }).then(function (r) {
      var type = r.headers.get('content-type') || ''
      if (!r.ok || type.indexOf('json') === -1) return null
      return r.json()
    }).then(function (data) {
      if (!data || !data.enabled) return
      state.editEnabled = true
      state.editEntries = data.entries || []
      qs('#db-sidebar-tools').hidden = false
      qs('#db-switch-docs-btn').hidden = false
      if (state.nav) renderSidebar()
      if (state.current) renderEditLink(state.current)
    }).catch(function () {})
  }

  var editState = { entry: null, path: null }

  function openEditor (route) {
    fetch('/__dockbook_api/resolve?route=' + encodeURIComponent(route), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('not_found'); return r.json() })
      .then(function (data) {
        editState.entry = data.entry
        editState.path = data.path
        qs('#db-edit-path').textContent = data.path
        qs('#db-edit-status').textContent = ''
        qs('#db-edit-textarea').value = data.content
        qs('#db-edit-overlay').hidden = false
        qs('#db-edit-textarea').focus()
        renderEditHighlight()
      })
      .catch(function () { alert('Не удалось найти исходный файл для этой страницы') })
  }

  function closeEditor () { qs('#db-edit-overlay').hidden = true; closeBlockMenu(); closePageLinkMenu(); closeHeadingMenu() }

  function saveEditor () {
    var status = qs('#db-edit-status')
    status.textContent = 'Сохранение…'
    fetch('/__dockbook_api/source', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: editState.entry, path: editState.path, content: qs('#db-edit-textarea').value })
    }).then(function (r) {
      if (!r.ok) throw new Error('save_failed')
      status.textContent = 'Сохранено, страница обновится автоматически…'
      setTimeout(closeEditor, 600)
    }).catch(function () { status.textContent = 'Не удалось сохранить файл' })
  }

  qs('#db-edit-save-btn').addEventListener('click', saveEditor)
  qs('#db-edit-cancel-btn').addEventListener('click', closeEditor)
  qs('#db-edit-overlay').addEventListener('click', function (e) {
    if (e.target.id === 'db-edit-overlay') closeEditor()
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !qs('#db-edit-overlay').hidden) closeEditor()
  })

  // ---- подсветка синтаксиса в редакторе -----------------------------------
  //
  // textarea остаётся прозрачной (виден только курсор и выделение) и лежит
  // поверх <pre><code>, куда мы рендерим ту же строку с markdown-разметкой,
  // обёрнутой в цветные span'ы. Шрифт/отступы/line-height у обоих элементов
  // идентичны (см. CSS), поэтому текст совпадает посимвольно и подсветка
  // выглядит так, будто подсвечивается сама textarea.

  function highlightEscape (s) { return escapeHtml(s) }

  var MD_INLINE_RE = /(`[^`\n]+`)|(!\[[^\]\n]*\]\([^)\n]*\))|(\[[^\]\n]*\]\([^)\n]*\))|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\n]+\*)|(_[^_\n]+_)/g

  // Инлайн-разметка внутри строки (жирный, курсив, код, ссылки…). Работает
  // на уже экранированном тексте — синтаксис markdown не пересекается с
  // экранируемыми HTML-символами, так что порядок безопасен.
  function highlightInline (escaped) {
    return escaped.replace(MD_INLINE_RE, function (m, code, img, link, boldStar, boldUnd, strike, italicStar, italicUnd) {
      if (code) {
        return '<span class="db-hl-marker">`</span><span class="db-hl-code">' + code.slice(1, -1) + '</span><span class="db-hl-marker">`</span>'
      }
      if (img || link) {
        var lm = /^(!?)\[([^\]]*)\]\(([^)]*)\)$/.exec(img || link)
        return (lm[1] ? '<span class="db-hl-marker">!</span>' : '') +
          '<span class="db-hl-marker">[</span><span class="db-hl-link-text">' + lm[2] + '</span><span class="db-hl-marker">]</span>' +
          '<span class="db-hl-marker">(</span><span class="db-hl-link-url">' + lm[3] + '</span><span class="db-hl-marker">)</span>'
      }
      var bold = boldStar || boldUnd
      if (bold) {
        var bm = bold.slice(0, 2)
        return '<span class="db-hl-marker">' + bm + '</span><span class="db-hl-bold">' + bold.slice(2, -2) + '</span><span class="db-hl-marker">' + bm + '</span>'
      }
      if (strike) {
        return '<span class="db-hl-marker">~~</span><span class="db-hl-strike">' + strike.slice(2, -2) + '</span><span class="db-hl-marker">~~</span>'
      }
      var italic = italicStar || italicUnd
      var im = italic.charAt(0)
      return '<span class="db-hl-marker">' + im + '</span><span class="db-hl-italic">' + italic.slice(1, -1) + '</span><span class="db-hl-marker">' + im + '</span>'
    })
  }

  // Атрибуты dockbook-виджетов: ::hint{type="info"} — имя атрибута, `=` и
  // строковое значение красятся отдельно, остальное (пробелы) остаётся как есть.
  function highlightAttrs (raw) {
    var inner = raw.slice(1, -1)
    var out = '<span class="db-hl-punct">{</span>'
    var re = /([\w-]+)(=)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s}]+)|(\s+)/g
    var mm
    while ((mm = re.exec(inner))) {
      if (mm[1]) {
        out += '<span class="db-hl-prop">' + highlightEscape(mm[1]) + '</span><span class="db-hl-punct">' + highlightEscape(mm[2]) + '</span><span class="db-hl-str">' + highlightEscape(mm[3]) + '</span>'
      } else {
        out += highlightEscape(mm[4])
      }
    }
    out += '<span class="db-hl-punct">}</span>'
    return out
  }

  var HEADING_RE = /^(#{1,6})(\s+)([\s\S]*)$/
  var QUOTE_RE = /^(\s*)(>+)(\s?)([\s\S]*)$/
  var LIST_RE = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?([\s\S]*)$/
  var HR_RE = /^\s*([-*_])\s*(?:\1\s*){2,}$/
  var FENCE_RE = /^(\s*)(```|~~~)(.*)$/
  var DIRECTIVE_RE = /^(\s*)(::+)([\w-]*)(\{[^}]*\})?\s*$/
  var FRONTMATTER_DELIM_RE = /^---\s*$/
  var YAML_KV_RE = /^([\w.-]+)(:)(\s*)([\s\S]*)$/

  function highlightMarkdown (text) {
    var lines = text.split('\n')
    var out = []
    var fence = null
    var inFrontmatter = false
    lines.forEach(function (raw, i) {
      var m
      if (fence) {
        if (raw.trim() === fence) {
          out.push('<span class="db-hl-fence">' + highlightEscape(raw) + '</span>')
          fence = null
        } else {
          out.push('<span class="db-hl-codeblock">' + highlightEscape(raw) + '</span>')
        }
        return
      }
      if ((m = FENCE_RE.exec(raw))) {
        fence = m[2]
        out.push('<span class="db-hl-fence">' + highlightEscape(m[1] + m[2]) + '<span class="db-hl-lang">' + highlightEscape(m[3]) + '</span></span>')
        return
      }
      if (i === 0 && FRONTMATTER_DELIM_RE.test(raw)) {
        inFrontmatter = true
        out.push('<span class="db-hl-fm-delim">' + highlightEscape(raw) + '</span>')
        return
      }
      if (inFrontmatter) {
        if (FRONTMATTER_DELIM_RE.test(raw)) {
          inFrontmatter = false
          out.push('<span class="db-hl-fm-delim">' + highlightEscape(raw) + '</span>')
          return
        }
        if ((m = YAML_KV_RE.exec(raw))) {
          out.push('<span class="db-hl-fm-key">' + highlightEscape(m[1]) + '</span><span class="db-hl-punct">' + highlightEscape(m[2]) + '</span>' + highlightEscape(m[3]) + '<span class="db-hl-fm-val">' + highlightEscape(m[4]) + '</span>')
          return
        }
        out.push(highlightEscape(raw))
        return
      }
      if (raw.trim().length >= 3 && HR_RE.test(raw)) {
        out.push('<span class="db-hl-hr">' + highlightEscape(raw) + '</span>')
        return
      }
      if ((m = DIRECTIVE_RE.exec(raw))) {
        out.push('<span class="db-hl-marker">' + highlightEscape(m[1] + m[2]) + '</span><span class="db-hl-tag">' + highlightEscape(m[3]) + '</span>' + (m[4] ? highlightAttrs(m[4]) : ''))
        return
      }
      if ((m = HEADING_RE.exec(raw))) {
        out.push('<span class="db-hl-heading"><span class="db-hl-marker">' + highlightEscape(m[1]) + '</span>' + highlightEscape(m[2]) + highlightInline(highlightEscape(m[3])) + '</span>')
        return
      }
      if ((m = QUOTE_RE.exec(raw))) {
        out.push(highlightEscape(m[1]) + '<span class="db-hl-quote"><span class="db-hl-marker">' + highlightEscape(m[2]) + '</span>' + highlightEscape(m[3]) + highlightInline(highlightEscape(m[4])) + '</span>')
        return
      }
      if ((m = LIST_RE.exec(raw))) {
        out.push(highlightEscape(m[1]) + '<span class="db-hl-marker">' + highlightEscape(m[2]) + '</span>' + highlightEscape(m[3]) +
          (m[4] ? '<span class="db-hl-checkbox">' + highlightEscape(m[4]) + '</span>' : '') + highlightInline(highlightEscape(m[5])))
        return
      }
      out.push(highlightInline(highlightEscape(raw)))
    })
    return out.join('\n')
  }

  function renderEditHighlight () {
    var textarea = qs('#db-edit-textarea')
    qs('#db-edit-highlight code').innerHTML = highlightMarkdown(textarea.value) + '\n'
    syncEditHighlightScroll()
  }

  function syncEditHighlightScroll () {
    var textarea = qs('#db-edit-textarea')
    var pre = qs('#db-edit-highlight')
    pre.scrollTop = textarea.scrollTop
    pre.scrollLeft = textarea.scrollLeft
  }

  qs('#db-edit-textarea').addEventListener('input', renderEditHighlight)
  qs('#db-edit-textarea').addEventListener('scroll', syncEditHighlightScroll)

  // ---- панель инструментов редактора: вставка markdown-виджетов -----------

  function insertAtCursor (textarea, text) {
    textarea.focus()
    var ok = false
    try { ok = document.execCommand('insertText', false, text) } catch (err) { ok = false }
    if (!ok) {
      var start = textarea.selectionStart
      var end = textarea.selectionEnd
      var value = textarea.value
      textarea.value = value.slice(0, start) + text + value.slice(end)
      textarea.selectionStart = textarea.selectionEnd = start + text.length
      renderEditHighlight()
    }
  }

  function wrapInline (textarea, before, after, placeholder) {
    var start = textarea.selectionStart
    var end = textarea.selectionEnd
    var selected = textarea.value.slice(start, end)
    var body = selected || placeholder
    insertAtCursor(textarea, before + body + after)
    if (!selected) {
      var insertEnd = textarea.selectionEnd
      var bodyEnd = insertEnd - after.length
      textarea.setSelectionRange(bodyEnd - body.length, bodyEnd)
    }
  }

  function insertBlock (textarea, body, selectText) {
    var start = textarea.selectionStart
    var end = textarea.selectionEnd
    var value = textarea.value
    var leading = (start > 0 && value.charAt(start - 1) !== '\n') ? '\n\n' : ''
    var trailing = (end < value.length && value.charAt(end) !== '\n') ? '\n\n' : '\n'
    var insertedFrom = start + leading.length
    insertAtCursor(textarea, leading + body + trailing)
    if (selectText) {
      var idx = body.indexOf(selectText)
      if (idx !== -1) {
        textarea.setSelectionRange(insertedFrom + idx, insertedFrom + idx + selectText.length)
      }
    }
  }

  // ---- Tab / Shift+Tab: отступ табом ---------------------------------------

  // Tab без выделения (или с выделением в пределах одной строки) — обычная
  // вставка символа табуляции. Tab с выделением нескольких строк — отступ
  // каждой строки табом. Shift+Tab всегда убирает один уровень отступа
  // (таб или до 4 пробелов) у текущей/выделенных строк.
  // Отступ — 2 пробела, а не символ табуляции: таб внутри markdown/кода
  // рендерится в разных местах (эта же страница, GitHub, терминал) с разной
  // шириной и может «разъезжаться», а сами пробелы выглядят одинаково везде.
  var TAB_INDENT = '  '
  var TAB_OUTDENT_SPACES_RE = new RegExp('^ {1,' + TAB_INDENT.length + '}')

  function handleTabKey (textarea, shiftKey) {
    var value = textarea.value
    var start = textarea.selectionStart
    var end = textarea.selectionEnd
    var multiLine = value.slice(start, end).indexOf('\n') !== -1

    if (!shiftKey && !multiLine) {
      insertAtCursor(textarea, TAB_INDENT)
      renderEditHighlight()
      return
    }

    var lineStart = value.lastIndexOf('\n', start - 1) + 1
    // выделение, заканчивающееся ровно на начале строки, не должно отступать
    // эту последнюю (по сути невыделенную) строку — как в обычных редакторах
    var lineEnd = (end > start && value.charAt(end - 1) === '\n') ? end - 1 : end
    var blockEnd = value.indexOf('\n', lineEnd)
    if (blockEnd === -1) blockEnd = value.length

    var firstLineDelta = 0
    var totalDelta = 0
    var lines = value.slice(lineStart, blockEnd).split('\n').map(function (line, i) {
      if (shiftKey) {
        // сначала пробуем убрать наш отступ целиком, потом одиночный таб
        // (совместимость со старым текстом), потом просто пробелы
        var removed
        if (line.slice(0, TAB_INDENT.length) === TAB_INDENT) removed = TAB_INDENT.length
        else if (line.charAt(0) === '\t') removed = 1
        else removed = (line.match(TAB_OUTDENT_SPACES_RE) || [''])[0].length
        if (i === 0) firstLineDelta = -removed
        totalDelta -= removed
        return line.slice(removed)
      }
      if (i === 0) firstLineDelta = TAB_INDENT.length
      totalDelta += TAB_INDENT.length
      return TAB_INDENT + line
    })

    textarea.value = value.slice(0, lineStart) + lines.join('\n') + value.slice(blockEnd)
    var newStart = Math.max(lineStart, start + firstLineDelta)
    textarea.setSelectionRange(newStart, Math.max(newStart, end + totalDelta))
    textarea.focus()
    renderEditHighlight()
  }

  // ---- уровень заголовка текущей строки -----------------------------------

  function currentLineRange (value, pos) {
    var start = value.lastIndexOf('\n', pos - 1) + 1
    var end = value.indexOf('\n', pos)
    if (end === -1) end = value.length
    return { start: start, end: end }
  }

  // Превращает строку под курсором в заголовок нужного уровня (или убирает
  // его, если это тот же уровень / явно попросили level 0), не трогая
  // остальной текст. Существующая решётка-префикс заменяется, а не
  // дублируется.
  function applyHeading (textarea, level) {
    var value = textarea.value
    var pos = textarea.selectionStart
    var range = currentLineRange(value, pos)
    var line = value.slice(range.start, range.end)
    var match = line.match(/^(#{1,6})\s+/)
    var bareText = match ? line.slice(match[0].length) : line
    var currentLevel = match ? match[1].length : 0
    var targetLevel = level === 0 ? 0 : (level === currentLevel ? 0 : level)
    var newLine = targetLevel ? '#'.repeat(targetLevel) + ' ' + bareText : bareText
    textarea.setSelectionRange(range.start, range.end)
    insertAtCursor(textarea, newLine)
    var caret = range.start + newLine.length
    textarea.setSelectionRange(caret, caret)
    textarea.focus()
  }

  var HEADING_LEVELS = [1, 2, 3, 4, 5, 6]

  var headingMenuBuilt = false
  function buildHeadingMenu () {
    if (headingMenuBuilt) return
    headingMenuBuilt = true
    var menu = qs('#db-heading-menu')
    HEADING_LEVELS.forEach(function (level) {
      var label = hotkeyLabel(['mod', 'alt'], String(level))
      var btn = el('button', {
        type: 'button',
        class: 'db-heading-menu__item db-heading-menu__item--h' + level,
        title: label
      }, [
        el('span', { text: 'Заголовок H' + level }),
        el('span', { class: 'db-kbd', text: label })
      ])
      btn.addEventListener('click', function () {
        applyHeading(qs('#db-edit-textarea'), level)
        closeHeadingMenu()
      })
      menu.appendChild(btn)
    })
    var clearLabel = hotkeyLabel(['mod', 'alt'], '0')
    var clearBtn = el('button', { type: 'button', class: 'db-heading-menu__item db-heading-menu__item--clear', title: clearLabel }, [
      el('span', { text: 'Обычный текст' }),
      el('span', { class: 'db-kbd', text: clearLabel })
    ])
    clearBtn.addEventListener('click', function () {
      applyHeading(qs('#db-edit-textarea'), 0)
      closeHeadingMenu()
    })
    menu.appendChild(clearBtn)
  }

  function closeHeadingMenu () {
    var menu = qs('#db-heading-menu')
    if (menu.hidden) return
    menu.hidden = true
    qs('#db-heading-menu-btn').setAttribute('aria-expanded', 'false')
  }

  buildHeadingMenu()
  qs('#db-heading-menu-btn').addEventListener('click', function (e) {
    e.stopPropagation()
    closeBlockMenu()
    closePageLinkMenu()
    var menu = qs('#db-heading-menu')
    var willOpen = menu.hidden
    menu.hidden = !willOpen
    this.setAttribute('aria-expanded', String(willOpen))
  })
  document.addEventListener('click', function (e) {
    if (!qs('#db-heading-menu').hidden && !e.target.closest('.db-edit-toolbar__dropdown')) closeHeadingMenu()
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !qs('#db-heading-menu').hidden) closeHeadingMenu()
  })

  var INLINE_ACTIONS = {
    bold: { before: '**', after: '**', placeholder: 'жирный текст' },
    italic: { before: '*', after: '*', placeholder: 'курсив' },
    strike: { before: '~~', after: '~~', placeholder: 'зачёркнутый' },
    code: { before: '`', after: '`', placeholder: 'код' },
    link: { before: '[', after: '](/route)', placeholder: 'текст ссылки' },
    image: { before: '![', after: '](/image.png)', placeholder: 'описание картинки' }
  }

  document.querySelectorAll('#db-edit-toolbar [data-inline]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = INLINE_ACTIONS[btn.getAttribute('data-inline')]
      wrapInline(qs('#db-edit-textarea'), action.before, action.after, action.placeholder)
    })
  })

  // ---- горячие клавиши редактора -------------------------------------

  // e.code (а не e.key) используется намеренно: он не зависит от раскладки
  // клавиатуры (кириллица и т.п.) и не ломается модификаторами вроде Alt,
  // которые на некоторых раскладках меняют символ, приходящий в e.key.
  var INLINE_HOTKEYS = { KeyB: 'bold', KeyI: 'italic', KeyE: 'code', KeyK: 'link' }

  var INLINE_HOTKEY_LABELS = {
    bold: hotkeyLabel(['mod'], 'B'),
    italic: hotkeyLabel(['mod'], 'I'),
    strike: hotkeyLabel(['mod', 'shift'], 'X'),
    code: hotkeyLabel(['mod'], 'E'),
    link: hotkeyLabel(['mod'], 'K')
  }

  // Добавляет видимый бейдж с сочетанием клавиш прямо на кнопку (не только
  // в title), чтобы горячие клавиши было видно без наведения.
  function addKbdBadge (btn, label, extraClass) {
    btn.appendChild(el('span', { class: 'db-kbd' + (extraClass ? ' ' + extraClass : ''), text: label }))
    btn.title = btn.title ? btn.title + ' (' + label + ')' : label
  }

  function decorateToolbarHotkeys () {
    document.querySelectorAll('#db-edit-toolbar [data-inline]').forEach(function (btn) {
      var label = INLINE_HOTKEY_LABELS[btn.getAttribute('data-inline')]
      if (label) addKbdBadge(btn, label, 'db-kbd--toolbar')
    })
    addKbdBadge(qs('#db-edit-save-btn'), hotkeyLabel(['mod'], 'S'))
    addKbdBadge(qs('#db-edit-cancel-btn'), 'Esc')
    qs('#db-heading-menu-btn').title = 'Заголовок (' + hotkeyLabel(['mod', 'alt'], '1…6') + ')'
  }
  decorateToolbarHotkeys()

  qs('#db-edit-overlay').addEventListener('keydown', function (e) {
    if (e.code === 'Tab' && e.target.id === 'db-edit-textarea') {
      e.preventDefault()
      handleTabKey(e.target, e.shiftKey)
      return
    }

    var mod = e.metaKey || e.ctrlKey
    if (!mod) return

    if (e.code === 'KeyS') {
      e.preventDefault()
      saveEditor()
      return
    }

    if (e.target.id !== 'db-edit-textarea') return
    var textarea = e.target

    if (e.altKey) {
      var headingMatch = /^Digit([0-6])$/.exec(e.code)
      if (headingMatch) {
        e.preventDefault()
        applyHeading(textarea, Number(headingMatch[1]))
      }
      return
    }

    if (e.shiftKey && e.code === 'KeyX') {
      e.preventDefault()
      var strike = INLINE_ACTIONS.strike
      wrapInline(textarea, strike.before, strike.after, strike.placeholder)
      return
    }

    var inlineKey = INLINE_HOTKEYS[e.code]
    if (inlineKey) {
      e.preventDefault()
      var action = INLINE_ACTIONS[inlineKey]
      wrapInline(textarea, action.before, action.after, action.placeholder)
    }
  })

  var BLOCK_SNIPPETS = [
    {
      label: 'Подсказка (hint)',
      text: ['::hint{type="info"}', 'Текст подсказки.', '::'].join('\n'),
      select: 'Текст подсказки.'
    },
    {
      label: 'Вкладки (tabs)',
      text: [
        '::tabs', '::tab{label="Вкладка 1"}', 'Содержимое первой вкладки.', '::',
        '::tab{label="Вкладка 2"}', 'Содержимое второй вкладки.', '::', '::'
      ].join('\n'),
      select: 'Содержимое первой вкладки.'
    },
    {
      label: 'Шаги (steps)',
      text: ['::steps', '### Шаг 1', 'Описание первого шага.', '', '### Шаг 2', 'Описание второго шага.', '::'].join('\n'),
      select: 'Описание первого шага.'
    },
    {
      label: 'Аккордеон (accordion)',
      text: ['::accordion', '::accordion-item{label="Вопрос"}', 'Ответ.', '::', '::'].join('\n'),
      select: 'Ответ.'
    },
    {
      label: 'Карточки (cards)',
      text: ['::cards', '::card{title="Заголовок" to="/route"}', 'Описание карточки.', '::', '::'].join('\n'),
      select: 'Описание карточки.'
    },
    {
      label: 'Группа кода (code-group)',
      text: [
        '::code-group', '```bash [npm]', 'npm install package', '```',
        '```bash [pnpm]', 'pnpm add package', '```', '::'
      ].join('\n'),
      select: 'npm install package'
    },
    {
      label: 'Таблица',
      text: ['| Колонка 1 | Колонка 2 |', '| --- | --- |', '| Значение | Значение |'].join('\n'),
      select: 'Колонка 1'
    },
    {
      label: 'Mermaid: схема (flowchart)',
      text: ['```mermaid', 'graph TD', '  A[Начало] --> B[Шаг]', '  B --> C[Конец]', '```'].join('\n'),
      select: 'A[Начало] --> B[Шаг]'
    },
    {
      label: 'Mermaid: последовательность',
      text: [
        '```mermaid', 'sequenceDiagram', '  participant A', '  participant B',
        '  A->>B: запрос', '  B-->>A: ответ', '```'
      ].join('\n'),
      select: 'A->>B: запрос'
    },
    {
      label: 'PlantUML: последовательность',
      text: [
        '```plantuml', '@startuml', 'actor User', 'participant Server',
        'User -> Server: запрос', 'Server --> User: ответ', '@enduml', '```'
      ].join('\n'),
      select: 'User -> Server: запрос'
    }
  ]

  var blockMenuBuilt = false
  function buildBlockMenu () {
    if (blockMenuBuilt) return
    blockMenuBuilt = true
    var menu = qs('#db-block-menu')
    BLOCK_SNIPPETS.forEach(function (item) {
      var btn = el('button', { type: 'button', text: item.label })
      btn.addEventListener('click', function () {
        insertBlock(qs('#db-edit-textarea'), item.text, item.select)
        closeBlockMenu()
      })
      menu.appendChild(btn)
    })
  }

  function closeBlockMenu () {
    var menu = qs('#db-block-menu')
    if (menu.hidden) return
    menu.hidden = true
    qs('#db-block-menu-btn').setAttribute('aria-expanded', 'false')
  }

  buildBlockMenu()
  qs('#db-block-menu-btn').addEventListener('click', function (e) {
    e.stopPropagation()
    closePageLinkMenu()
    closeHeadingMenu()
    var menu = qs('#db-block-menu')
    var willOpen = menu.hidden
    menu.hidden = !willOpen
    this.setAttribute('aria-expanded', String(willOpen))
  })
  document.addEventListener('click', function (e) {
    if (!qs('#db-block-menu').hidden && !e.target.closest('.db-edit-toolbar__dropdown')) closeBlockMenu()
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !qs('#db-block-menu').hidden) closeBlockMenu()
  })

  // ---- вставка ссылки на другую страницу документации ---------------------

  function closePageLinkMenu () {
    var menu = qs('#db-page-link-menu')
    if (menu.hidden) return
    menu.hidden = true
    qs('#db-page-link-btn').setAttribute('aria-expanded', 'false')
  }

  function insertPageLink (page) {
    var textarea = qs('#db-edit-textarea')
    var start = textarea.selectionStart
    var end = textarea.selectionEnd
    var selected = textarea.value.slice(start, end)
    insertAtCursor(textarea, '[' + (selected || page.title) + '](' + page.route + ')')
  }

  function renderPageLinkList (query) {
    var list = qs('#db-page-link-list')
    list.innerHTML = ''
    var term = query.toLowerCase().trim()
    var items = (state.pager || []).filter(function (p) {
      return !term || p.title.toLowerCase().indexOf(term) !== -1 || p.route.toLowerCase().indexOf(term) !== -1
    })
    if (!items.length) {
      list.appendChild(el('div', { class: 'db-page-link-empty', text: 'Ничего не найдено' }))
      return
    }
    items.forEach(function (p) {
      var btn = el('button', { type: 'button' }, [
        el('span', { text: p.title }),
        el('span', { class: 'db-page-link-route', text: p.route })
      ])
      btn.addEventListener('click', function () {
        insertPageLink(p)
        closePageLinkMenu()
      })
      list.appendChild(btn)
    })
  }

  qs('#db-page-link-btn').addEventListener('click', function (e) {
    e.stopPropagation()
    closeBlockMenu()
    closeHeadingMenu()
    var menu = qs('#db-page-link-menu')
    var willOpen = menu.hidden
    menu.hidden = !willOpen
    this.setAttribute('aria-expanded', String(willOpen))
    if (willOpen) {
      var search = qs('#db-page-link-search')
      search.value = ''
      renderPageLinkList('')
      search.focus()
    }
  })
  qs('#db-page-link-search').addEventListener('input', function () {
    renderPageLinkList(this.value)
  })
  qs('#db-page-link-search').addEventListener('click', function (e) { e.stopPropagation() })
  document.addEventListener('click', function (e) {
    if (!qs('#db-page-link-menu').hidden && !e.target.closest('.db-edit-toolbar__dropdown')) closePageLinkMenu()
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !qs('#db-page-link-menu').hidden) closePageLinkMenu()
  })

  // ---- создание страниц и папок -------------------------------------------

  var promptState = { mode: null }

  function fillEntrySelect () {
    var select = qs('#db-prompt-entry-select')
    var field = qs('#db-prompt-field-entry')
    select.innerHTML = ''
    state.editEntries.forEach(function (e, i) {
      select.appendChild(el('option', { value: String(i), text: e.label || e.base }))
    })
    field.hidden = state.editEntries.length <= 1
  }

  function openPrompt (mode, prefill) {
    var titleField = qs('#db-prompt-field-title')
    var titleInput = qs('#db-prompt-title-input')
    var pathInput = qs('#db-prompt-path-input')
    var pathLabel = qs('#db-prompt-path-label')
    var hint = qs('#db-prompt-hint')
    var title = qs('#db-prompt-title')

    promptState.mode = mode
    pathInput.value = (prefill && prefill.path) || ''
    titleInput.value = (prefill && prefill.title) || ''
    fillEntrySelect()

    if (mode === 'page') {
      title.textContent = 'Новая страница'
      titleField.hidden = false
      pathLabel.textContent = 'Путь (например guide/new-topic)'
      hint.textContent = 'Вложенные папки в пути будут созданы автоматически.'
    } else {
      title.textContent = 'Новая папка'
      titleField.hidden = true
      pathLabel.textContent = 'Путь папки (например guide/advanced)'
      hint.textContent = 'Папка появится в навигации, когда в ней будет хотя бы одна страница.'
    }

    qs('#db-prompt-overlay').hidden = false
    ;(titleField.hidden ? pathInput : titleInput).focus()
  }

  function closePrompt () { qs('#db-prompt-overlay').hidden = true }

  function closeAddMenu () {
    qs('#db-sidebar-add-menu').hidden = true
    qs('#db-sidebar-add-btn').setAttribute('aria-expanded', 'false')
  }
  qs('#db-sidebar-add-btn').addEventListener('click', function (e) {
    e.stopPropagation()
    var menu = qs('#db-sidebar-add-menu')
    var willOpen = menu.hidden
    menu.hidden = !willOpen
    this.setAttribute('aria-expanded', String(willOpen))
  })
  document.addEventListener('click', function (e) {
    if (!qs('#db-sidebar-add-menu').hidden && !e.target.closest('#db-sidebar-tools')) closeAddMenu()
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !qs('#db-sidebar-add-menu').hidden) closeAddMenu()
  })

  qs('#db-new-page-btn').addEventListener('click', function () { closeAddMenu(); openPrompt('page') })
  qs('#db-new-folder-btn').addEventListener('click', function () { closeAddMenu(); openPrompt('folder') })
  qs('#db-prompt-cancel-btn').addEventListener('click', closePrompt)
  qs('#db-prompt-overlay').addEventListener('click', function (e) {
    if (e.target.id === 'db-prompt-overlay') closePrompt()
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !qs('#db-prompt-overlay').hidden) closePrompt()
  })

  qs('#db-prompt-form').addEventListener('submit', function (e) {
    e.preventDefault()
    var entrySelect = qs('#db-prompt-entry-select')
    var entryIndex = entrySelect.options.length ? Number(entrySelect.value) : 0
    var pathValue = qs('#db-prompt-path-input').value.trim().replace(/^\/+/, '')
    if (!pathValue) return

    if (promptState.mode === 'page') {
      var titleValue = qs('#db-prompt-title-input').value.trim() || pathValue
      fetch('/__dockbook_api/page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry: entryIndex, path: pathValue, title: titleValue })
      }).then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'failed') })
        closePrompt()
      }).catch(function (err) {
        alert(err.message === 'exists' ? 'Страница с таким путём уже существует' : 'Не удалось создать страницу')
      })
    } else {
      fetch('/__dockbook_api/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry: entryIndex, path: pathValue })
      }).then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'failed') })
        closePrompt()
        alert('Папка создана. Она появится в навигации после того, как в неё добавят страницу.')
      }).catch(function () { alert('Не удалось создать папку') })
    }
  })

  // ---- сайдбар -----------------------------------------------------------

  var EDIT_PENCIL_ICON = '<svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>'
  var NAV_FOLDER_ICON = '<svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M2.5 5.5a1 1 0 011-1h3.6l1.6 1.8h7.3a1 1 0 011 1v7.2a1 1 0 01-1 1H3.5a1 1 0 01-1-1v-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>'
  var NAV_FILE_ICON = '<svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M5 2.5h6.5L15 6v11.5H5V2.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M11.5 2.5V6H15" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>'

  function navIconAndText (icon, text) {
    return [el('span', { class: 'db-nav-icon', html: icon }), el('span', { class: 'db-nav-text', text: text })]
  }

  function renderTitleEditBtn (label, onClick) {
    var btn = el('button', {
      type: 'button',
      class: 'db-nav-edit-btn',
      title: label,
      'aria-label': label,
      html: EDIT_PENCIL_ICON
    })
    btn.addEventListener('click', function (e) {
      e.preventDefault()
      e.stopPropagation()
      onClick()
    })
    return btn
  }

  // ---- сворачивание папок в сайдбаре ---------------------------------------

  var COLLAPSE_STORAGE_KEY = 'db-sidebar-collapsed'

  function loadCollapsedSet () {
    try {
      var raw = localStorage.getItem(COLLAPSE_STORAGE_KEY)
      return new Set(raw ? JSON.parse(raw) : [])
    } catch (err) { return new Set() }
  }

  function saveCollapsedSet () {
    try { localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(Array.from(collapsedSections))) } catch (err) {}
  }

  var collapsedSections = loadCollapsedSet()

  // У content-разделов есть entry/path (устойчивы к переименованию), у
  // openapi-раздела их нет — используем route/title как запасной ключ.
  function sectionKey (section) {
    if (section.path !== undefined) return 'c' + section.entry + ':' + section.path
    return 'a' + (section.route || section.title)
  }

  var NAV_CHEVRON_ICON = '<svg width="10" height="10" viewBox="0 0 20 20" fill="none"><path d="M6 4l7 6-7 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

  function renderNavToggle (key, collapsed, onToggle) {
    var btn = el('button', {
      type: 'button',
      class: 'db-nav-toggle',
      'aria-expanded': String(!collapsed),
      'aria-label': collapsed ? 'Развернуть раздел' : 'Свернуть раздел',
      title: collapsed ? 'Развернуть раздел' : 'Свернуть раздел',
      html: NAV_CHEVRON_ICON
    })
    btn.addEventListener('click', function (e) {
      e.preventDefault()
      e.stopPropagation()
      onToggle()
    })
    return btn
  }

  function navToggleSpacer () {
    return el('span', { class: 'db-nav-toggle db-nav-toggle--spacer' })
  }

  // Заголовок раздела (папки) + свёрнутый/развёрнутый список его детей.
  // Состояние сворачивания хранится в localStorage по ключу раздела, поэтому
  // переживает перезагрузку страницы и переходы между страницами (сайдбар
  // рисуется один раз при загрузке).
  function renderSectionTitle (section, linkClass, plainClass) {
    var key = sectionKey(section)
    var collapsed = collapsedSections.has(key)
    var wrap = el('div', { class: 'db-nav-section-block' + (collapsed ? ' is-collapsed' : '') })
    var row = el('div', { class: 'db-nav-title-row' })

    row.appendChild(renderNavToggle(key, collapsed, function () {
      var nowCollapsed = wrap.classList.toggle('is-collapsed')
      if (nowCollapsed) collapsedSections.add(key)
      else collapsedSections.delete(key)
      saveCollapsedSet()
      var toggleBtn = row.querySelector('.db-nav-toggle')
      toggleBtn.setAttribute('aria-expanded', String(!nowCollapsed))
      var label = nowCollapsed ? 'Развернуть раздел' : 'Свернуть раздел'
      toggleBtn.setAttribute('aria-label', label)
      toggleBtn.setAttribute('title', label)
    }))

    var titleNode = section.route
      ? el('a', { class: linkClass, href: section.route }, navIconAndText(NAV_FOLDER_ICON, section.title))
      : el('div', { class: plainClass }, navIconAndText(NAV_FOLDER_ICON, section.title))
    row.appendChild(titleNode)
    if (state.editEnabled && section.entry !== undefined && section.entry !== null) {
      row.appendChild(renderTitleEditBtn('Переименовать раздел', function () { openFolderTitlePrompt(section) }))
    }
    wrap.appendChild(row)
    wrap.appendChild(renderNavList(section.children))
    return wrap
  }

  // Корень content-раздела (entry задан, path пустой) — это не «папка», а
  // сама главная страница раздела (index.md), если она есть: показываем её
  // как обычную страницу (значок файла, переименование через frontmatter),
  // а не как раздел с значком папки, который сбивает с толку на самом верху
  // дерева. Настоящие вложенные папки (в т.ч. без index.md, и openapi-раздел)
  // по-прежнему рендерятся как разделы через renderSectionTitle.
  function isContentRoot (section) {
    return section.entry !== undefined && section.entry !== null && section.path === ''
  }

  // Вызывается только когда isContentRoot(section) && section.route — см.
  // renderSidebar. Флаг остаётся плоской ссылкой-страницей, без сворачивания.
  function renderRootTitle (section) {
    var row = el('div', { class: 'db-nav-title-row' })
    row.appendChild(navToggleSpacer())
    row.appendChild(el('a', { class: 'db-nav-link db-nav-section__title', href: section.route }, navIconAndText(NAV_FILE_ICON, section.title)))
    if (state.editEnabled) {
      row.appendChild(renderTitleEditBtn('Переименовать страницу', function () { openPageTitlePrompt(section) }))
    }
    return row
  }

  function renderSidebar () {
    var root = qs('#db-sidebar-tree')
    root.innerHTML = ''
    state.nav.forEach(function (section) {
      // Плоский корень (главная страница раздела) отдельно тянет свой
      // список детей — сворачивать нечего, это не папка. Иначе (обычный
      // раздел без своей страницы, например «API Reference») — целиком
      // через renderSectionTitle, он сам рисует и заголовок, и детей.
      if (isContentRoot(section) && section.route) {
        var wrap = el('div', { class: 'db-nav-section' })
        wrap.appendChild(renderRootTitle(section))
        wrap.appendChild(renderNavList(section.children))
        root.appendChild(wrap)
      } else {
        root.appendChild(el('div', { class: 'db-nav-section' }, [
          renderSectionTitle(section, 'db-nav-link db-nav-section__title', 'db-nav-section__title')
        ]))
      }
    })
    highlightSidebar()
  }

  function renderNavList (items) {
    var ul = el('ul', { class: 'db-nav-list' })
    items.forEach(function (item) {
      var li = el('li')
      if (item.kind === 'page') {
        var row = el('div', { class: 'db-nav-title-row' })
        row.appendChild(navToggleSpacer())
        row.appendChild(el('a', { class: 'db-nav-link', href: item.route }, navIconAndText(NAV_FILE_ICON, item.title)))
        if (state.editEnabled) {
          row.appendChild(renderTitleEditBtn('Переименовать страницу', function () { openPageTitlePrompt(item) }))
        }
        li.appendChild(row)
      } else {
        li.appendChild(renderSectionTitle(item, 'db-nav-link', 'db-nav-link'))
      }
      ul.appendChild(li)
    })
    return ul
  }

  // ---- переименование раздела/страницы (title в .navigation.yml / frontmatter)

  var titleEditState = { kind: null, entry: null, path: null, route: null }

  function openTitlePrompt (kind, currentTitle) {
    titleEditState.kind = kind
    qs('#db-folder-title-heading').textContent = kind === 'page' ? 'Название страницы' : 'Название раздела'
    qs('#db-folder-title-hint').textContent = kind === 'page'
      ? 'Если оставить пустым — будет использован текст первого заголовка в файле, а если и его нет — имя файла.'
      : 'Если оставить пустым — будет использовано имя папки на диске.'
    var input = qs('#db-folder-title-input')
    input.value = currentTitle || ''
    qs('#db-folder-title-overlay').hidden = false
    input.focus()
    input.select()
  }

  function openFolderTitlePrompt (section) {
    titleEditState.entry = section.entry
    titleEditState.path = section.path
    openTitlePrompt('folder', section.title)
  }

  function openPageTitlePrompt (item) {
    titleEditState.route = item.route
    openTitlePrompt('page', item.title)
  }

  function closeFolderTitlePrompt () { qs('#db-folder-title-overlay').hidden = true }

  qs('#db-folder-title-cancel-btn').addEventListener('click', closeFolderTitlePrompt)
  qs('#db-folder-title-overlay').addEventListener('click', function (e) {
    if (e.target.id === 'db-folder-title-overlay') closeFolderTitlePrompt()
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !qs('#db-folder-title-overlay').hidden) closeFolderTitlePrompt()
  })

  qs('#db-folder-title-form').addEventListener('submit', function (e) {
    e.preventDefault()
    var isPage = titleEditState.kind === 'page'
    var url = isPage ? '/__dockbook_api/page-title' : '/__dockbook_api/folder-title'
    var payload = isPage
      ? { route: titleEditState.route, title: qs('#db-folder-title-input').value.trim() }
      : { entry: titleEditState.entry, path: titleEditState.path, title: qs('#db-folder-title-input').value.trim() }
    fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error('save_failed')
      closeFolderTitlePrompt()
    }).catch(function () { alert('Не удалось сохранить название') })
  })

  function highlightSidebar () {
    var links = document.querySelectorAll('.db-nav-link')
    links.forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('href') === location.pathname)
    })
  }

  // ---- роутинг -------------------------------------------------------------

  function normalizeRoute (p) {
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
    return p || '/'
  }

  function renderRoute (pathname, push) {
    var route = normalizeRoute(pathname)
    var page = state.pages[route]
    if (!page && route === '/') {
      renderEmptyDocsNotice()
      qs('#db-toc').innerHTML = ''
      qs('#db-pager').innerHTML = ''
      qs('#db-edit-link').hidden = true
    } else if (!page) {
      qs('#db-content').innerHTML = '<h1>Страница не найдена</h1><p>Раздел <code>' + escapeHtml(route) + '</code> отсутствует в документации.</p>'
      qs('#db-toc').innerHTML = ''
      qs('#db-pager').innerHTML = ''
      qs('#db-edit-link').hidden = true
    } else {
      if (push) history.pushState({}, '', route)
      document.title = page.title + ' · ' + state.meta.title
      qs('#db-content').innerHTML = page.html
      renderToc(page.toc)
      renderPager(route)
      renderEditLink(route)
      enhanceContent()
    }
    state.current = route
    highlightSidebar()
    closeSidebar()
    window.scrollTo(0, 0)
  }

  function renderEmptyDocsNotice () {
    var box = qs('#db-content')
    box.innerHTML = ''
    box.appendChild(el('h1', { text: 'Документация ещё не начата' }))
    var notice = el('div', { class: 'db-content__notice' }, [
      el('p', { text: 'В этой папке нет файла index.md — создайте его, чтобы добавить описание проекта. Без него у раздела нет главной страницы.' })
    ])
    if (state.editEnabled) {
      var btn = el('button', { type: 'button', class: 'db-edit-box__btn', text: 'Создать index.md' })
      btn.addEventListener('click', function () {
        openPrompt('page', { path: 'index', title: state.meta && state.meta.title })
      })
      notice.appendChild(btn)
    }
    box.appendChild(notice)
  }

  function renderToc (toc) {
    var box = qs('#db-toc')
    var items = (toc || []).filter(function (t) { return t.level >= 2 })
    if (!items.length) { box.innerHTML = ''; return }
    var ul = el('ul')
    items.forEach(function (t) {
      var li = el('li', { class: 'level-' + t.level })
      li.appendChild(el('a', { href: '#' + t.id, text: t.text, 'data-toc-id': t.id }))
      ul.appendChild(li)
    })
    box.innerHTML = ''
    box.appendChild(el('div', { class: 'db-toc__title', text: 'На странице' }))
    box.appendChild(ul)
    setupTocObserver(items)
  }

  var tocObserver = null
  var tocIntersecting = {}
  function setupTocObserver (items) {
    if (tocObserver) tocObserver.disconnect()
    tocIntersecting = {}
    var headings = items.map(function (t) { return document.getElementById(t.id) }).filter(Boolean)
    if (!headings.length) return
    tocObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        tocIntersecting[entry.target.id] = entry.isIntersecting
      })
      var activeId = null
      items.forEach(function (t) { if (tocIntersecting[t.id]) activeId = t.id })
      document.querySelectorAll('.db-toc a').forEach(function (a) {
        a.classList.toggle('is-active', a.getAttribute('data-toc-id') === activeId)
      })
    }, { rootMargin: '-96px 0px -70% 0px' })
    headings.forEach(function (h) { tocObserver.observe(h) })
  }

  function renderPager (route) {
    var box = qs('#db-pager')
    box.innerHTML = ''
    var idx = state.pager.findIndex(function (p) { return p.route === route })
    if (idx === -1) return
    var prev = state.pager[idx - 1]
    var next = state.pager[idx + 1]
    if (prev) {
      box.appendChild(el('a', { class: 'db-pager__link db-pager__link--prev', href: prev.route }, [
        el('span', { class: 'db-pager__label', text: '← Назад' }),
        el('span', { text: prev.title })
      ]))
    } else box.appendChild(el('span'))
    if (next) {
      box.appendChild(el('a', { class: 'db-pager__link db-pager__link--next', href: next.route }, [
        el('span', { class: 'db-pager__label', text: 'Далее →' }),
        el('span', { text: next.title })
      ]))
    }
  }

  function renderEditLink (route) {
    var link = qs('#db-edit-link')
    if (state.editEnabled) {
      link.href = '#'
      link.textContent = 'Редактировать эту страницу →'
      link.onclick = function (e) { e.preventDefault(); openEditor(route) }
      link.hidden = false
      return
    }
    link.onclick = null
    if (!state.meta.edit || !state.meta.edit.repo) { link.hidden = true; return }
    var repo = state.meta.edit.repo.replace(/\/$/, '')
    var branch = state.meta.edit.branch || 'main'
    var dir = state.meta.edit.dir || ''
    link.href = repo + '/edit/' + branch + '/' + dir + route + '.md'
    link.textContent = 'Редактировать эту страницу →'
    link.hidden = false
  }

  // ---- улучшение контента: копирование кода, табы ------------------------

  function enhanceContent () {
    document.querySelectorAll('.db-pre').forEach(function (pre) {
      if (pre.querySelector('.db-copy-btn')) return
      var btn = el('button', { class: 'db-copy-btn', type: 'button', text: 'Копировать' })
      btn.addEventListener('click', function () {
        var code = pre.querySelector('code')
        navigator.clipboard.writeText(code ? code.textContent : '').then(function () {
          btn.textContent = 'Скопировано'
          setTimeout(function () { btn.textContent = 'Копировать' }, 1200)
        })
      })
      pre.appendChild(btn)
    })

    document.querySelectorAll('[data-tabs]').forEach(function (group) {
      if (group.__wired) return
      group.__wired = true
      group.querySelectorAll('.db-tabs__tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
          var target = tab.getAttribute('data-tab-target')
          group.querySelectorAll('.db-tabs__tab').forEach(function (t) { t.classList.remove('is-active') })
          group.querySelectorAll('.db-tabs__panel').forEach(function (p) { p.classList.remove('is-active') })
          tab.classList.add('is-active')
          var panel = document.getElementById(target)
          if (panel) panel.classList.add('is-active')
        })
      })
    })
  }

  // ---- навигация по кликам / истории --------------------------------------

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a')
    if (!a) return
    var href = a.getAttribute('href')
    if (!href || href.startsWith('#')) return
    if (a.target === '_blank' || a.hasAttribute('download')) return
    var url
    try { url = new URL(href, location.href) } catch (err) { return }
    if (url.origin !== location.origin) return
    e.preventDefault()
    if (url.hash && url.pathname === location.pathname) {
      document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
      history.pushState({}, '', href)
      return
    }
    renderRoute(url.pathname, true)
  })

  window.addEventListener('popstate', function () { renderRoute(location.pathname, false) })

  // ---- мобильный сайдбар ------------------------------------------------

  function closeSidebar () { document.body.classList.remove('db-sidebar-open') }
  qs('#db-menu-btn').addEventListener('click', function () {
    document.body.classList.toggle('db-sidebar-open')
  })
  qs('#db-sidebar-backdrop').addEventListener('click', closeSidebar)

  // ---- тема ---------------------------------------------------------------

  var SUN = '<circle cx="10" cy="10" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2M4 4l1.4 1.4M14.6 14.6L16 16M16 4l-1.4 1.4M5.4 14.6L4 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
  var MOON = '<path d="M17 11.5A7 7 0 018.5 3 7 7 0 1017 11.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'

  function applyThemeIcon () {
    var theme = document.documentElement.getAttribute('data-theme')
    qs('#db-theme-icon').innerHTML = theme === 'dark' ? MOON : SUN
  }
  applyThemeIcon()
  qs('#db-theme-toggle').addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme')
    var next = current === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('db-theme', next)
    applyThemeIcon()
  })

  // ---- поиск --------------------------------------------------------------

  var kbdNode = qs('#db-search-kbd')
  if (kbdNode) kbdNode.textContent = isMac ? '⌘K' : 'Ctrl K'

  function escapeHtml (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function openSearch () {
    qs('#db-search-overlay').hidden = false
    var input = qs('#db-search-input')
    input.value = ''
    input.focus()
    renderSearchResults([])
    if (!state.search) {
      fetchJSON('/data/search.json').then(function (data) {
        state.search = data
        // индекс мог подгрузиться уже после того, как пользователь начал
        // печатать — досчитываем результаты для того, что уже введено
        runSearch(qs('#db-search-input').value.trim())
      })
    }
  }
  function closeSearch () { qs('#db-search-overlay').hidden = true }

  qs('#db-search-btn').addEventListener('click', openSearch)
  qs('#db-search-overlay').addEventListener('click', function (e) {
    if (e.target.id === 'db-search-overlay') closeSearch()
  })
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK' && qs('#db-edit-overlay').hidden) {
      e.preventDefault()
      qs('#db-search-overlay').hidden ? openSearch() : closeSearch()
    }
    if (e.key === 'Escape') closeSearch()
  })

  function scoreEntry (entry, terms) {
    var title = entry.title.toLowerCase()
    var text = (entry.description + ' ' + entry.text).toLowerCase()
    var score = 0
    terms.forEach(function (t) {
      if (title.includes(t)) score += 10
      if (title.startsWith(t)) score += 5
      var count = text.split(t).length - 1
      score += count
    })
    return score
  }

  function excerptFor (entry, terms) {
    var text = entry.description || entry.text || ''
    var lower = text.toLowerCase()
    var idx = -1
    for (var i = 0; i < terms.length; i++) {
      idx = lower.indexOf(terms[i])
      if (idx !== -1) break
    }
    var start = Math.max(0, idx === -1 ? 0 : idx - 40)
    var snippet = text.slice(start, start + 140)
    return (start > 0 ? '…' : '') + snippet + (start + 140 < text.length ? '…' : '')
  }

  function highlightTerms (text, terms) {
    var out = escapeHtml(text)
    terms.forEach(function (t) {
      if (!t) return
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig')
      out = out.replace(re, '<mark>$1</mark>')
    })
    return out
  }

  var activeIndex = -1
  function renderSearchResults (results, terms) {
    var box = qs('#db-search-results')
    box.innerHTML = ''
    activeIndex = -1
    if (!results.length) {
      box.appendChild(el('div', { class: 'db-search-empty', text: qs('#db-search-input').value ? 'Ничего не найдено' : 'Начните вводить запрос' }))
      return
    }
    results.forEach(function (r, i) {
      var a = el('a', { class: 'db-search-result', href: r.route })
      a.appendChild(el('div', { class: 'db-search-result__title', html: highlightTerms(r.title, terms) }))
      a.appendChild(el('div', { class: 'db-search-result__excerpt', html: highlightTerms(excerptFor(r, terms), terms) }))
      a.addEventListener('mouseenter', function () { setActive(i) })
      a.addEventListener('click', function () { closeSearch() })
      box.appendChild(a)
    })
  }

  function setActive (i) {
    var items = qs('#db-search-results').querySelectorAll('.db-search-result')
    items.forEach(function (n) { n.classList.remove('is-active') })
    if (items[i]) { items[i].classList.add('is-active'); items[i].scrollIntoView({ block: 'nearest' }) }
    activeIndex = i
  }

  function runSearch (query) {
    if (!query) { renderSearchResults([]); return }
    // индекс ещё не подгружен — как только он придёт, openSearch()
    // сама пересчитает результаты для текущего запроса
    if (!state.search) return
    var terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    var scored = state.search
      .map(function (e) { return { entry: e, score: scoreEntry(e, terms) } })
      .filter(function (s) { return s.score > 0 })
      .sort(function (a, b) { return b.score - a.score })
      .slice(0, 20)
      .map(function (s) { return s.entry })
    renderSearchResults(scored, terms)
  }

  var searchDebounce = null
  qs('#db-search-input').addEventListener('input', function () {
    clearTimeout(searchDebounce)
    var query = this.value.trim()
    searchDebounce = setTimeout(function () { runSearch(query) }, 80)
  })

  qs('#db-search-input').addEventListener('keydown', function (e) {
    var items = qs('#db-search-results').querySelectorAll('.db-search-result')
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIndex + 1, items.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIndex - 1, 0)) }
    if (e.key === 'Enter' && activeIndex >= 0 && items[activeIndex]) {
      e.preventDefault()
      items[activeIndex].click()
    }
  })

  // ---- «Другая документация»: открыть другую папку без перезапуска dev ---

  var DOCS_FOLDER_ICON = '<svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M2.5 5.5a1 1 0 011-1h3.6l1.6 1.8h7.3a1 1 0 011 1v7.2a1 1 0 01-1 1H3.5a1 1 0 01-1-1v-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>'
  var switchBrowseState = { path: null, home: null }

  function loadSwitchDir (targetPath) {
    var url = '/__dockbook_api/browse' + (targetPath ? '?path=' + encodeURIComponent(targetPath) : '')
    fetch(url, { cache: 'no-store' }).then(function (r) { return r.json() }).then(renderSwitchDir)
  }

  function renderSwitchDir (data) {
    switchBrowseState.path = data.path
    switchBrowseState.home = data.home
    qs('#db-switch-path-input').value = data.path
    qs('#db-switch-up-btn').disabled = !data.parent
    qs('#db-switch-up-btn').onclick = data.parent ? function () { loadSwitchDir(data.parent) } : null

    var list = qs('#db-switch-list')
    list.innerHTML = ''
    if (!data.entries.length) {
      list.appendChild(el('div', { class: 'db-browse-empty', text: 'В этой папке нет вложенных папок' }))
    }
    data.entries.forEach(function (entry) {
      var btn = el('button', { type: 'button', class: 'db-browse-item' }, [
        el('span', { html: DOCS_FOLDER_ICON }),
        el('span', { text: entry.name })
      ])
      btn.addEventListener('click', function () { loadSwitchDir(entry.path) })
      list.appendChild(btn)
    })

    var hint = qs('#db-switch-hint')
    if (data.error) {
      hint.textContent = 'Папка не найдена, показана домашняя папка'
    } else if (data.mdCount > 0) {
      hint.textContent = 'В этой папке ' + data.mdCount + ' markdown-файл(ов)'
    } else {
      hint.textContent = 'В этой папке нет markdown-файлов — можно выбрать вложенную или всё равно открыть эту'
    }
  }

  function openSwitchDocs () {
    qs('#db-switch-overlay').hidden = false
    loadSwitchDir(null)
  }
  function closeSwitchDocs () { qs('#db-switch-overlay').hidden = true }

  qs('#db-switch-docs-btn').addEventListener('click', openSwitchDocs)
  qs('#db-switch-close-btn').addEventListener('click', closeSwitchDocs)
  qs('#db-switch-cancel-btn').addEventListener('click', closeSwitchDocs)
  qs('#db-switch-overlay').addEventListener('click', function (e) {
    if (e.target.id === 'db-switch-overlay') closeSwitchDocs()
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !qs('#db-switch-overlay').hidden) closeSwitchDocs()
  })
  qs('#db-switch-home-btn').addEventListener('click', function () { loadSwitchDir(switchBrowseState.home) })

  qs('#db-switch-path-form').addEventListener('submit', function (e) {
    e.preventDefault()
    var value = qs('#db-switch-path-input').value.trim()
    if (value) loadSwitchDir(value)
  })

  qs('#db-switch-choose-btn').addEventListener('click', function () {
    var chosen = qs('#db-switch-path-input').value.trim()
    if (!chosen) return
    var btn = this
    btn.disabled = true
    fetch('/__dockbook_api/switch-docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: chosen })
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, data: data } })
    }).then(function (res) {
      btn.disabled = false
      if (!res.ok) {
        var messages = { not_a_directory: 'Это не папка или она не существует' }
        qs('#db-switch-hint').textContent = messages[res.data.error] || 'Не удалось открыть эту папку'
        return
      }
      closeSwitchDocs()
      location.href = '/'
    }).catch(function () {
      btn.disabled = false
      qs('#db-switch-hint').textContent = 'Не удалось открыть эту папку'
    })
  })

  boot()
})()
