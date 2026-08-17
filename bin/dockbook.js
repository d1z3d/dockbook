#!/usr/bin/env node
'use strict'

const http = require('http')
const path = require('path')
const fs = require('fs')
const { loadConfig, DEFAULTS } = require('../src/config')
const { FILE_NAME: NAV_CONFIG_FILE } = require('../src/navConfig')
const { build, writeOutput } = require('../src/build')
const { exportContent } = require('../src/mdExport')
const { createServer, MIME } = require('../src/server')
const { listDir, isDirectory } = require('../src/setupApi')
const { readJsonBody, sendJson } = require('../src/httpJson')

const ASSETS_DIR = path.join(__dirname, '..', 'assets')

function findConfigPath (cwd) {
  const candidates = ['dockbook.config.js', 'dockbook.config.cjs']
  for (const name of candidates) {
    const p = path.join(cwd, name)
    if (fs.existsSync(p)) return p
  }
  return null
}

function requireConfigPath (cwd) {
  const configPath = findConfigPath(cwd)
  if (!configPath) throw new Error('Не найден dockbook.config.js в текущей папке')
  return configPath
}

function buildConfigSource (cwd, docsDir) {
  let realCwd = cwd
  let realDocsDir = docsDir
  try { realCwd = fs.realpathSync(cwd) } catch (err) {}
  try { realDocsDir = fs.realpathSync(docsDir) } catch (err) {}
  const rel = path.relative(realCwd, realDocsDir)
  const dirLiteral = rel && !rel.startsWith('..') ? `./${rel}` : docsDir
  return `'use strict'

module.exports = {
  title: 'Dockbook',
  description: '',
  port: ${DEFAULTS.port},
  outDir: 'dist',

  content: [
    { dir: ${JSON.stringify(dirLiteral)}, base: '/' }
  ]
}
`
}

// Показываем приветственный экран с выбором папки документации прямо в
// браузере, пока dockbook.config.js ещё не создан. После выбора папки
// пишем конфиг, закрываем этот временный сервер и запускаем обычный dev.
function cmdDevSetup (cwd) {
  const port = DEFAULTS.port

  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, 'http://localhost')

    if (req.method === 'GET' && parsed.pathname === '/__dockbook_api/browse') {
      sendJson(res, 200, listDir(parsed.searchParams.get('path')))
      return
    }

    if (req.method === 'POST' && parsed.pathname === '/__dockbook_api/init') {
      readJsonBody(req).then(body => {
        const target = String(body.path || '').trim()
        if (!target || !isDirectory(target)) {
          sendJson(res, 400, { error: 'not_a_directory' })
          return
        }
        if (findConfigPath(cwd)) {
          sendJson(res, 409, { error: 'config_exists' })
          return
        }
        const configPath = path.join(cwd, 'dockbook.config.js')
        fs.writeFileSync(configPath, buildConfigSource(cwd, path.resolve(target)), 'utf8')
        sendJson(res, 200, { ok: true })
        server.close(() => cmdDev(cwd))
      }).catch(() => sendJson(res, 400, { error: 'bad_request' }))
      return
    }

    let filePath = path.join(ASSETS_DIR, parsed.pathname === '/' ? '/welcome.html' : parsed.pathname)
    if (!filePath.startsWith(ASSETS_DIR)) { res.writeHead(403); res.end('Forbidden'); return }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        fs.readFile(path.join(ASSETS_DIR, 'welcome.html'), (err2, indexData) => {
          if (err2) { res.writeHead(404); res.end('Not found'); return }
          res.writeHead(200, { 'Content-Type': MIME['.html'] })
          res.end(indexData)
        })
        return
      }
      const ext = path.extname(filePath)
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
      res.end(data)
    })
  })

  server.listen(port, '127.0.0.1', () => {
    console.log(`dockbook: выберите папку с документацией → http://localhost:${port}`)
  })
}

function runBuild (cwd) {
  const config = loadConfig(requireConfigPath(cwd))
  const data = build(config)
  writeOutput(data, config, ASSETS_DIR)
  return config
}

function cmdBuild (cwd) {
  const config = runBuild(cwd)
  console.log(`Собрано в ${config.outDir}`)
}

function cmdExportMd (cwd, outArg) {
  const config = loadConfig(requireConfigPath(cwd))
  const outDir = outArg ? path.resolve(cwd, outArg) : path.join(config.root, 'confluence')
  exportContent(config, outDir)
  console.log(`Экспортировано в ${outDir}`)
}

function cmdPreview (cwd) {
  const configPath = requireConfigPath(cwd)
  const config = loadConfig(configPath)
  if (!fs.existsSync(config.outDir)) {
    console.log('Папка сборки не найдена, собираю...')
    runBuild(cwd)
  }
  const server = createServer(config.outDir, { liveReload: false })
  server.listen(config.port, '127.0.0.1', () => {
    console.log(`dockbook preview: http://localhost:${config.port}`)
  })
}

function cmdDev (cwd) {
  const configPath = findConfigPath(cwd)
  if (!configPath) {
    cmdDevSetup(cwd)
    return
  }
  let config
  try {
    config = loadConfig(configPath)
  } catch (err) {
    console.error(`dockbook: ошибка конфига — ${err.message}`)
    process.exit(1)
  }
  let data

  // «Другая документация»: временная (только в памяти этого процесса,
  // без правки dockbook.config.js) подмена content на выбранную папку —
  // как будто открыли другой проект, не перезапуская dockbook dev.
  let override = null

  const effectiveConfig = () => (override ? { ...config, content: override.content, openapi: [] } : config)

  const rebuildNow = () => {
    const cfg = effectiveConfig()
    data = build(cfg)
    writeOutput(data, cfg, ASSETS_DIR)
  }

  rebuildNow()

  const server = createServer(config.outDir, {
    liveReload: true,
    edit: {
      enabled: () => config.localEdit !== false,
      entries: () => effectiveConfig().content,
      configRoot: () => config.root,
      onFolderTitleChange: () => rebuild(),
      switchDocs: dir => {
        override = { content: [{ dir, base: '/', label: null }] }
        watchDir(dir)
        rebuildNow()
        server.broadcastReload()
        return { empty: !data.pages['/'] }
      }
    }
  })
  server.listen(config.port, '127.0.0.1', () => {
    console.log(`dockbook dev: http://localhost:${config.port}`)
  })

  let timer = null
  const rebuild = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        config = loadConfig(configPath)
        rebuildNow()
        server.broadcastReload()
        console.log('Пересобрано')
      } catch (err) {
        console.error('Ошибка сборки:', err.message)
      }
    }, 100)
  }

  const watched = new Set()
  const watchDir = dir => {
    if (watched.has(dir)) return
    watched.add(dir)
    fs.watch(dir, { recursive: true }, (event, filename) => {
      if (filename && filename.split(path.sep)[0] === path.basename(config.outDir)) return
      rebuild()
    })
  }

  // fs.watch на macOS иногда шлёт фантомное событие 'change' без реального
  // изменения файла (FSEvents отдаёт событие, но mtime не сдвигается) — из-за
  // этого редактор мог сам перезагрузить страницу через несколько секунд
  // после открытия. Игнорируем событие, если mtime конфига не изменился.
  let configMtime = fs.statSync(configPath).mtimeMs
  fs.watch(configPath, () => {
    let mtime
    try { mtime = fs.statSync(configPath).mtimeMs } catch (err) { return }
    if (mtime === configMtime) return
    configMtime = mtime
    rebuild()
  })
  // dockbook.config.json (заголовки/порядок папок) может лежать вне
  // watch-ируемых content-папок, и его ещё может не существовать при
  // старте — следим за самой папкой конфига, а не за файлом.
  fs.watch(config.root, (event, filename) => {
    if (filename === NAV_CONFIG_FILE) rebuild()
  })

  for (const entry of config.content) watchDir(entry.dir)
  for (const entry of config.openapi) fs.watch(entry.spec, rebuild)
}

function main () {
  const [, , cmd] = process.argv
  const cwd = process.cwd()

  switch (cmd) {
    case 'dev':
      cmdDev(cwd)
      break
    case 'build':
      cmdBuild(cwd)
      break
    case 'preview':
      cmdPreview(cwd)
      break
    case 'export-md':
      cmdExportMd(cwd, process.argv[3])
      break
    default:
      console.log('Использование: dockbook <dev|build|preview|export-md>')
      process.exit(cmd ? 1 : 0)
  }
}

main()
