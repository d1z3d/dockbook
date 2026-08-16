'use strict'

// Первый запуск: пока dockbook.config.js ещё не создан, показываем
// приветственный экран с выбором папки документации прямо в браузере
// (без Electron — это обычный локальный http-сервер, см. bin/dockbook.js).

const fs = require('fs')
const os = require('os')
const path = require('path')

function countMarkdown (dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isFile() && /\.(md|mdx)$/i.test(e.name))
      .length
  } catch (err) {
    return 0
  }
}

// Возвращает содержимое папки для навигации в браузере: только вложенные
// папки (без файлов и скрытых/служебных папок), путь до родителя и
// количество markdown-файлов прямо в этой папке — подсказка пользователю.
function listDir (targetPath) {
  let resolved
  let error = null
  try {
    resolved = targetPath ? path.resolve(targetPath) : os.homedir()
    if (!fs.statSync(resolved).isDirectory()) throw new Error('not_a_directory')
  } catch (err) {
    error = 'not_found'
    resolved = os.homedir()
  }

  let entries = []
  try {
    entries = fs.readdirSync(resolved, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name.charAt(0) !== '.' && e.name !== 'node_modules')
      .map(e => ({ name: e.name, path: path.join(resolved, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  } catch (err) {
    entries = []
  }

  const parent = path.dirname(resolved)
  return {
    path: resolved,
    parent: parent !== resolved ? parent : null,
    home: os.homedir(),
    entries,
    mdCount: countMarkdown(resolved),
    error
  }
}

function isDirectory (targetPath) {
  try {
    return fs.statSync(targetPath).isDirectory()
  } catch (err) {
    return false
  }
}

module.exports = { listDir, isDirectory }
