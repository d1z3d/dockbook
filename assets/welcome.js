;(function () {
  'use strict'

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

  var FOLDER_ICON = '<svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M2.5 5.5a1 1 0 011-1h3.6l1.6 1.8h7.3a1 1 0 011 1v7.2a1 1 0 01-1 1H3.5a1 1 0 01-1-1v-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>'

  var state = { path: null, home: null }

  // ---- обзор файловой системы ---------------------------------------------

  function loadDir (targetPath) {
    var url = '/__dockbook_api/browse' + (targetPath ? '?path=' + encodeURIComponent(targetPath) : '')
    return fetch(url, { cache: 'no-store' }).then(function (r) { return r.json() }).then(renderDir)
  }

  function renderDir (data) {
    state.path = data.path
    state.home = data.home
    qs('#db-browse-path-input').value = data.path
    qs('#db-browse-up-btn').disabled = !data.parent
    qs('#db-browse-up-btn').onclick = data.parent ? function () { loadDir(data.parent) } : null

    var list = qs('#db-browse-list')
    list.innerHTML = ''
    if (!data.entries.length) {
      list.appendChild(el('div', { class: 'db-browse-empty', text: 'В этой папке нет вложенных папок' }))
    }
    data.entries.forEach(function (entry) {
      var btn = el('button', { type: 'button', class: 'db-browse-item' }, [
        el('span', { html: FOLDER_ICON }),
        el('span', { text: entry.name })
      ])
      btn.addEventListener('click', function () { loadDir(entry.path) })
      list.appendChild(btn)
    })

    var hint = qs('#db-browse-hint')
    if (data.error) {
      hint.textContent = 'Папка не найдена, показана домашняя папка'
    } else if (data.mdCount > 0) {
      hint.textContent = 'В этой папке ' + data.mdCount + ' markdown-файл(ов)'
    } else {
      hint.textContent = 'В этой папке нет markdown-файлов — можно выбрать вложенную или всё равно открыть эту'
    }
  }

  // ---- модальное окно выбора папки ----------------------------------------

  function openBrowser () {
    qs('#db-browse-overlay').hidden = false
    loadDir(null)
  }
  function closeBrowser () { qs('#db-browse-overlay').hidden = true }

  qs('#db-welcome-pick-btn').addEventListener('click', openBrowser)
  qs('#db-browse-close-btn').addEventListener('click', closeBrowser)
  qs('#db-browse-cancel-btn').addEventListener('click', closeBrowser)
  qs('#db-browse-overlay').addEventListener('click', function (e) {
    if (e.target.id === 'db-browse-overlay') closeBrowser()
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !qs('#db-browse-overlay').hidden) closeBrowser()
  })
  qs('#db-browse-home-btn').addEventListener('click', function () { loadDir(state.home) })

  qs('#db-browse-path-form').addEventListener('submit', function (e) {
    e.preventDefault()
    var value = qs('#db-browse-path-input').value.trim()
    if (value) loadDir(value)
  })

  // ---- подтверждение выбора и инициализация конфига -----------------------

  function setStatus (text, isError) {
    var box = qs('#db-welcome-status')
    box.textContent = text
    box.classList.toggle('db-welcome__status--error', !!isError)
  }

  function waitForDocsAndReload (attemptsLeft) {
    fetch('/', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('not_ready')
      return r.text()
    }).then(function (html) {
      // пока сервер не переключился в обычный режим, / всё ещё отдаёт
      // приветственный экран — ждём появления doc-приложения (db-sidebar)
      if (html.indexOf('db-sidebar') === -1) throw new Error('not_ready')
      location.href = '/'
    }).catch(function () {
      if (attemptsLeft <= 0) {
        setStatus('Сборка занимает больше времени, чем обычно — перезапустите dockbook dev вручную.', true)
        return
      }
      setTimeout(function () { waitForDocsAndReload(attemptsLeft - 1) }, 300)
    })
  }

  qs('#db-browse-choose-btn').addEventListener('click', function () {
    var chosen = qs('#db-browse-path-input').value.trim()
    if (!chosen) return
    var btn = this
    btn.disabled = true
    fetch('/__dockbook_api/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: chosen })
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, data: data } })
    }).then(function (res) {
      if (!res.ok) {
        var messages = {
          not_a_directory: 'Это не папка или она не существует',
          config_exists: 'Конфигурация уже создана — перезапустите dockbook dev'
        }
        qs('#db-browse-hint').textContent = messages[res.data.error] || 'Не удалось выбрать эту папку'
        btn.disabled = false
        return
      }
      closeBrowser()
      setStatus('Готово! Собираем документацию и открываем сайт…')
      waitForDocsAndReload(40)
    }).catch(function () {
      qs('#db-browse-hint').textContent = 'Не удалось выбрать эту папку'
      btn.disabled = false
    })
  })
})()
