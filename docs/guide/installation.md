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
```bash [export-md]
node bin/dockbook.js export-md
```
::

| Команда | Что делает |
| --- | --- |
| `dev` | Собирает сайт, поднимает локальный сервер и следит за папками из `content`, конфигом и OpenAPI-спеками. При изменении файла — пересборка и live-reload страницы (через SSE). |
| `build` | Разовая сборка статического сайта в `outDir` (по умолчанию `dist`). |
| `preview` | Раздаёт уже собранный `outDir` локальным сервером, без слежения за файлами — то, что реально попадёт «в раздачу». |
| `export-md` | Разовый экспорт контента в обычный markdown (без `::hint`/`::tabs`/...) — для Confluence и подобных систем. Подробнее — [«Экспорт в Confluence»](/guide/export-md). |

Сервер во всех трёх случаях слушает только `127.0.0.1` — сайт недоступен по
сети, только с этой машины.

::hint{type="info"}
Если в текущей папке ещё нет `dockbook.config.js`, `dev` не упадёт с
ошибкой — вместо этого откроется приветственный экран с выбором папки
документации прямо в браузере, а конфиг создастся автоматически. Подробнее
— [«Редактирование в браузере»](/guide/editing#первый-запуск-без-конфига).
::

## Через package.json

Если положить `dockbook.config.js` в корень проекта, можно добавить скрипты:

```json
{
  "scripts": {
    "docs:dev": "node bin/dockbook.js dev",
    "docs:build": "node bin/dockbook.js build",
    "docs:preview": "node bin/dockbook.js preview",
    "docs:export-md": "node bin/dockbook.js export-md"
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
