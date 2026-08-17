# cli Specification

## Purpose

Даёт пользователю единую точку входа в терминале для запуска dev-режима, статической сборки, предпросмотра и экспорта документации через команду `dockbook`.

## Requirements

### Requirement: Разбор команды из аргументов
CLI SHALL читать первый позиционный аргумент (`process.argv[2]`) как имя команды и выполнять соответствующее действие: `dev`, `build`, `preview` или `export-md`.

#### Scenario: Известная команда
- **WHEN** пользователь запускает `dockbook build`
- **THEN** CLI выполняет сборку сайта и печатает `Собрано в <outDir>`

#### Scenario: Неизвестная команда
- **WHEN** пользователь запускает `dockbook foo`
- **THEN** CLI печатает `Использование: dockbook <dev|build|preview|export-md>` и завершается с кодом выхода 1

#### Scenario: Команда не указана
- **WHEN** пользователь запускает `dockbook` без аргументов
- **THEN** CLI печатает подсказку по использованию и завершается с кодом выхода 0

### Requirement: Поиск конфигурационного файла
CLI SHALL искать `dockbook.config.js`, а затем `dockbook.config.cjs` строго в текущей рабочей директории (без обхода родительских папок).

#### Scenario: Конфиг найден
- **WHEN** в текущей папке существует `dockbook.config.js`
- **THEN** команды `build`/`preview`/`export-md`/`dev` используют этот файл как конфигурацию проекта

#### Scenario: Конфиг отсутствует для build/preview/export-md
- **WHEN** команда `build`, `preview` или `export-md` запущена в папке без `dockbook.config.js`/`.cjs`
- **THEN** CLI выбрасывает ошибку `Не найден dockbook.config.js в текущей папке`

#### Scenario: Конфиг отсутствует для dev
- **WHEN** команда `dev` запущена в папке без `dockbook.config.js`/`.cjs`
- **THEN** CLI запускает мастер первого запуска (см. капабилити dev-setup-wizard) вместо ошибки

### Requirement: Команда build выполняет разовую сборку
`dockbook build` SHALL загрузить конфиг, собрать сайт и записать результат в `outDir`, не запуская сервер.

#### Scenario: Успешная сборка
- **WHEN** выполнена команда `dockbook build` с валидным конфигом
- **THEN** содержимое `outDir` полностью пересоздаётся и в консоль выводится `Собрано в <outDir>`

### Requirement: Команда preview обслуживает уже собранный сайт
`dockbook preview` SHALL поднять HTTP-сервер над `outDir` без file-watch и без live-reload, автоматически выполняя сборку, если `outDir` ещё не существует.

#### Scenario: outDir отсутствует
- **WHEN** выполнена команда `dockbook preview`, а папка `outDir` не существует
- **THEN** CLI сначала выполняет полную сборку, затем запускает сервер

#### Scenario: outDir уже собран
- **WHEN** выполнена команда `dockbook preview`, а `outDir` уже существует
- **THEN** CLI запускает сервер над существующим содержимым без повторной сборки

### Requirement: Команда export-md экспортирует контент в обычный markdown
`dockbook export-md [outDir]` SHALL преобразовать контент во всех content-разделах конфигурации в markdown без кастомных блоков dockbook и записать его в указанную или дефолтную папку.

#### Scenario: Путь экспорта не указан
- **WHEN** выполнена команда `dockbook export-md` без аргумента
- **THEN** результат экспорта записывается в `<config.root>/confluence`

#### Scenario: Путь экспорта указан
- **WHEN** выполнена команда `dockbook export-md ./out`
- **THEN** результат экспорта записывается в `./out`, разрешённый относительно текущей рабочей директории
