# dockbook

Локальный инструмент документации: markdown → статический сайт (сайдбар,
поиск, тёмная тема, OpenAPI-справочник). Никаких БД и UI/SSR-фреймворков —
сборщик и сервер написаны на чистом Node.js (только встроенные модули),
фронтенд — на чистых HTML/CSS/JS. Во время работы сайт не обращается в
интернет: все стили, скрипты и данные лежат локально и раздаются локальным
сервером.

```
dockbook/
  bin/dockbook.js      # CLI: dev / build / preview
  src/                 # сборщик: markdown, yaml, openapi, генерация сайта
  assets/              # фронтенд, который раздаётся пользователю (html/css/js)
  docs/                # пользовательская документация (сама на dockbook)
  example/             # демо-проект: docs/ + openapi.yaml + dockbook.config.js
```

## Быстрый старт

```bash
npm run dev       # example/ — демо со всеми блоками, http://localhost:4000
npm run docs:dev  # полная документация dockbook, http://localhost:4100
```

## Документация

Подробное руководство — установка, `dockbook.config.js`, структура
контента, все markdown-блоки, OpenAPI-справочник, поиск, тема — написано
как обычные markdown-файлы в `docs/` и открывается самим dockbook:

```bash
npm run docs:dev      # или: node bin/dockbook.js dev — из корня репозитория
```

Дальше — `http://localhost:4100`.

## Команды

| Команда | Действие |
| --- | --- |
| `dockbook dev` | Сборка + локальный сервер с live-reload при правке контента/конфига. |
| `dockbook build` | Разовая статическая сборка в `outDir`. |
| `dockbook preview` | Сервер над уже собранным `outDir`, без watch. |

Каждая запускается из папки с `dockbook.config.js`:

```bash
node bin/dockbook.js dev        # если конфиг в текущей папке
cd example && node ../bin/dockbook.js dev   # если конфиг в подпапке
```

## Использование для другого проекта

dockbook не публикуется в npm и не ставится через `npx` — это просто
`bin/` + `src/` + `assets/`, которые копируются в целевой проект (или
рядом с ним) вместе со своим `dockbook.config.js`.

1. Рядом с целевым проектом создать папку (например `<проект>-docs/`) и
   скопировать в неё из этого репозитория `bin/`, `src/`, `assets/`.
2. Добавить в неё `dockbook.config.js`:

   ```js
   'use strict'
   module.exports = {
     title: 'Название проекта',
     description: 'Краткое описание',
     port: 4100,
     outDir: 'site',
     content: [
       { dir: './docs', base: '/' }
     ]
   }
   ```

3. Создать `docs/` с markdown-файлами (по образцу `example/docs`):
   `docs/index.md` — стартовая страница, дальше — произвольные разделы;
   опционально `docs/.navigation.yml` для заголовка/порядка раздела в
   сайдбаре (без него сайдбар строится по структуре папок автоматически).
4. Запустить из папки с конфигом:

   ```bash
   node bin/dockbook.js dev
   ```

   Откроется `http://127.0.0.1:<port>` с live-reload при правке markdown.

5. Для сборки статики — `node bin/dockbook.js build` (результат в
   `outDir`), для предпросмотра собранного — `node bin/dockbook.js preview`.
