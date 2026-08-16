---
title: Установка и запуск
description: Три команды CLI — dev, build, preview
order: 1
---

# Установка и запуск

dockbook не публикуется в npm-реестр и не тянет зависимостей — это папка
`bin/` + `src/` внутри вашего репозитория (либо рядом с ним). Единственное
требование — Node.js 18 или новее.

## Требования

::hint{type="info"}
Проверить версию: `node --version`. Никаких `npm install` не требуется —
сборщик написан только на встроенных модулях Node.js.
::

## Команды

CLI — это файл `bin/dockbook.js`. Он ищет `dockbook.config.js` в текущей
рабочей папке.

::code-group
```bash [dev]
node bin/dockbook.js dev
```
```bash [build]
node bin/dockbook.js build
```
```bash [preview]
node bin/dockbook.js preview
```
::

| Команда | Что делает |
| --- | --- |
| `dev` | Собирает сайт, поднимает локальный сервер и следит за папками из `content`, конфигом и OpenAPI-спеками. При изменении файла — пересборка и live-reload страницы (через SSE). |
| `build` | Разовая сборка статического сайта в `outDir` (по умолчанию `dist`). |
| `preview` | Раздаёт уже собранный `outDir` локальным сервером, без слежения за файлами — то, что реально попадёт «в раздачу». |

Сервер во всех трёх случаях слушает только `127.0.0.1` — сайт недоступен по
сети, только с этой машины.

## Через package.json

Если положить `dockbook.config.js` в корень проекта, можно добавить скрипты:

```json
{
  "scripts": {
    "docs:dev": "node bin/dockbook.js dev",
    "docs:build": "node bin/dockbook.js build",
    "docs:preview": "node bin/dockbook.js preview"
  }
}
```

Если конфиг лежит не в корне (как в демо-проекте `example/`), команду нужно
запускать из той папки, где лежит `dockbook.config.js`, либо обернуть в
`cd`:

```bash
cd example && node ../bin/dockbook.js dev
```

## Порт

По умолчанию сервер слушает `4000`. Меняется полем `port` в
[конфиге](/guide/configuration).
