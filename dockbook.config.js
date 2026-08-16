'use strict'

module.exports = {
  title: 'dockbook',
  description: 'Локальный генератор документации без БД и фреймворков',
  port: 4100,
  outDir: 'site',

  content: [
    { dir: './docs', base: '/' }
  ],

  // Живой пример: та же спецификация, что используется в example/,
  // сгенерирована прямо здесь — чтобы показать, как выглядит реальная
  // страница OpenAPI-справочника.
  openapi: [
    { spec: './example/openapi.yaml', path: '/api-example' }
  ]
}
