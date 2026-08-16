;(function () {
  'use strict'

  var state = { nav: null, meta: null, pages: null, pager: [], search: null, current: null }

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
      qs('#db-site-title').textContent = state.meta.title
      renderSidebar()
      renderRoute(location.pathname, false)
    }).catch(function (err) {
      qs('#db-content').innerHTML = '<p>Не удалось загрузить документацию: ' + escapeHtml(err.message) + '</p>'
    })
  }

  // ---- сайдбар -----------------------------------------------------------

  function renderSidebar () {
    var root = qs('#db-sidebar')
    root.innerHTML = ''
    state.nav.forEach(function (section) {
      var wrap = el('div', { class: 'db-nav-section' })
      var titleNode
      if (section.route) {
        titleNode = el('a', { class: 'db-nav-link db-nav-section__title', href: section.route, text: section.title })
      } else {
        titleNode = el('div', { class: 'db-nav-section__title', text: section.title })
      }
      wrap.appendChild(titleNode)
      wrap.appendChild(renderNavList(section.children))
      root.appendChild(wrap)
    })
    highlightSidebar()
  }

  function renderNavList (items) {
    var ul = el('ul', { class: 'db-nav-list' })
    items.forEach(function (item) {
      var li = el('li')
      if (item.kind === 'page') {
        li.appendChild(el('a', { class: 'db-nav-link', href: item.route, text: item.title }))
      } else {
        if (item.route) {
          li.appendChild(el('a', { class: 'db-nav-link', href: item.route, text: item.title }))
        } else {
          li.appendChild(el('div', { class: 'db-nav-link', text: item.title }))
        }
        li.appendChild(renderNavList(item.children))
      }
      ul.appendChild(li)
    })
    return ul
  }

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
    if (!page) {
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

  var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '')
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
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
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

  boot()
})()
