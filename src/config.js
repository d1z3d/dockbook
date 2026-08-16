'use strict'

const fs = require('fs')
const path = require('path')

const DEFAULTS = {
  title: 'Documentation',
  description: '',
  outDir: 'dist',
  port: 4000,
  content: [],
  openapi: [],
  edit: null,
  localEdit: true,
  theme: {}
}

function loadConfig (configPath) {
  const abs = path.resolve(configPath)
  if (!fs.existsSync(abs)) {
    throw new Error(`Конфиг не найден: ${abs}`)
  }
  delete require.cache[require.resolve(abs)]
  const raw = require(abs)
  const user = raw && raw.__esModule ? raw.default : raw
  const config = { ...DEFAULTS, ...user }
  const root = path.dirname(abs)

  config.root = root
  config.outDir = path.resolve(root, config.outDir)

  if (!Array.isArray(config.content) || config.content.length === 0) {
    throw new Error('В конфиге должен быть указан хотя бы один раздел content: [{ dir, base }]')
  }

  config.content = config.content.map(entry => {
    const item = typeof entry === 'string' ? { dir: entry, base: '/' } : entry
    const dir = path.resolve(root, item.dir)
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new Error(`Папка документации не найдена: ${dir}`)
    }
    let base = item.base || '/'
    if (!base.startsWith('/')) base = '/' + base
    if (base !== '/' && base.endsWith('/')) base = base.slice(0, -1)
    return { dir, base, label: item.label || null }
  })

  config.openapi = (config.openapi || []).map(entry => ({
    spec: path.resolve(root, entry.spec),
    path: entry.path && entry.path.startsWith('/') ? entry.path : `/${entry.path || 'api'}`
  }))

  return config
}

module.exports = { loadConfig, DEFAULTS }
