'use strict'

module.exports = {
  title: 'Example Docs',
  description: 'Демонстрация dockbook',
  port: 4000,
  outDir: 'dist',

  // Папки, которые должны отображаться в документации.
  // base — путь, по которому раздел монтируется на сайте.
  content: [
    { dir: './docs', base: '/' }
  ],

  openapi: [
    { spec: './openapi.yaml', path: '/api' }
  ],

  edit: {
    repo: 'https://github.com/example/example',
    branch: 'main',
    dir: 'docs'
  }
}
