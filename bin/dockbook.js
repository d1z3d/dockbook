#!/usr/bin/env node
'use strict'

const path = require('path')
const fs = require('fs')
const { loadConfig } = require('../src/config')
const { build, writeOutput } = require('../src/build')
const { createServer } = require('../src/server')

const ASSETS_DIR = path.join(__dirname, '..', 'assets')

function findConfigPath (cwd) {
  const candidates = ['dockbook.config.js', 'dockbook.config.cjs']
  for (const name of candidates) {
    const p = path.join(cwd, name)
    if (fs.existsSync(p)) return p
  }
  throw new Error('Не найден dockbook.config.js в текущей папке')
}

function runBuild (cwd) {
  const config = loadConfig(findConfigPath(cwd))
  const data = build(config)
  writeOutput(data, config, ASSETS_DIR)
  return config
}

function cmdBuild (cwd) {
  const config = runBuild(cwd)
  console.log(`Собрано в ${config.outDir}`)
}

function cmdPreview (cwd) {
  const configPath = findConfigPath(cwd)
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
  let config = loadConfig(configPath)
  let data = build(config)
  writeOutput(data, config, ASSETS_DIR)

  const server = createServer(config.outDir, { liveReload: true })
  server.listen(config.port, '127.0.0.1', () => {
    console.log(`dockbook dev: http://localhost:${config.port}`)
  })

  let timer = null
  const rebuild = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        config = loadConfig(configPath)
        data = build(config)
        writeOutput(data, config, ASSETS_DIR)
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

  fs.watch(configPath, rebuild)
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
    default:
      console.log('Использование: dockbook <dev|build|preview>')
      process.exit(cmd ? 1 : 0)
  }
}

main()
