'use strict'

// Заголовок/порядок папки в сайдбаре хранится централизованно в
// dockbook.config.json рядом с dockbook.config.js — вместо .navigation.yml
// внутри самих content-папок (что раньше засоряло их служебными файлами).
// Ключ записи — base content-раздела + путь папки внутри него на диске,
// пустой путь означает корень раздела.

const fs = require('fs')
const path = require('path')

const FILE_NAME = 'dockbook.config.json'

function navConfigPath (root) {
  return path.join(root, FILE_NAME)
}

function folderKey (base, relPath) {
  const rel = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  const b = base || '/'
  return rel ? `${b === '/' ? '' : b}/${rel}`.replace(/\/+/g, '/') : b
}

function loadNavConfig (root) {
  const file = navConfigPath(root)
  if (!fs.existsSync(file)) return { folders: {} }
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return { folders: (data && typeof data.folders === 'object' && data.folders) || {} }
  } catch (err) {
    return { folders: {} }
  }
}

function saveNavConfig (root, navConfig) {
  const file = navConfigPath(root)
  const folders = navConfig.folders || {}
  if (Object.keys(folders).length === 0) {
    if (fs.existsSync(file)) fs.unlinkSync(file)
    return
  }
  fs.writeFileSync(file, JSON.stringify({ folders }, null, 2) + '\n', 'utf8')
}

function getFolderMeta (navConfig, base, relPath) {
  return (navConfig.folders && navConfig.folders[folderKey(base, relPath)]) || {}
}

function setFolderTitle (root, base, relPath, title) {
  const navConfig = loadNavConfig(root)
  const key = folderKey(base, relPath)
  const current = { ...(navConfig.folders[key] || {}) }
  if (title) current.title = title
  else delete current.title

  if (Object.keys(current).length === 0) delete navConfig.folders[key]
  else navConfig.folders[key] = current

  saveNavConfig(root, navConfig)
}

module.exports = { FILE_NAME, navConfigPath, loadNavConfig, saveNavConfig, folderKey, getFolderMeta, setFolderTitle }
