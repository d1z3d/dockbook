## Why

Проект dockbook уже реализован и работает (CLI, сборщик, dev-сервер, markdown-рендерер, редактор контента и т.д.), но у него нет OpenSpec-спецификаций — `openspec/specs/` пуст. Без baseline-спецификаций нельзя надёжно вести последующие изменения через OpenSpec: не с чем сверять delta-спеки, нет зафиксированного контракта текущего поведения. Эта задача документирует уже существующее поведение системы как исходный набор specs, ничего не меняя в коде.

## What Changes

- Документируется (не изменяется) поведение всех основных возможностей dockbook: CLI-команды, мастер первого запуска, конфигурация, навигация, сборка сайта, рендеринг markdown, диаграммы, подсветка кода, OpenAPI-справочник, экспорт в markdown, dev/preview-сервер, API редактирования контента.
- Создаются spec-файлы для каждой капабилити на основе фактического поведения кода (файл за файлом сверено в src/, bin/, assets/).
- Реализация (код) не меняется — это чисто документирующий baseline.

## Capabilities

### New Capabilities
- `cli`: команды `dev`/`build`/`preview`/`export-md`, разбор аргументов, коды выхода.
- `dev-setup-wizard`: браузерный мастер первого запуска, когда `dockbook.config.js` ещё не создан.
- `config`: загрузка и валидация `dockbook.config.js`, значения по умолчанию, нормализация content/openapi разделов.
- `nav-config`: хранение заголовка/порядка папок в `dockbook.config.json`.
- `build`: сканирование content-папок, построение навигации, поисковго индекса, генерация `outDir` (data/*.json, статика, ассеты).
- `markdown-rendering`: собственный markdown-парсер, кастомные блоки (`hint`, `tabs`, `code-group`, `steps`, `accordion`, `cards`, `mermaid`, `plantuml`), frontmatter.
- `diagrams`: рендер Mermaid/PlantUML в inline SVG на этапе сборки (ограниченное подмножество синтаксиса).
- `syntax-highlight`: подсветка кода в фрагментах на этапе сборки.
- `openapi-reference`: генерация страниц справочника из OpenAPI YAML-спецификации.
- `export-md`: экспорт контента в обычный markdown без кастомных блоков (для Confluence и подобных систем).
- `dev-server`: HTTP-сервер (dev с live-reload и preview без него), статика, SPA-фоллбек, SSE reload.
- `content-editing-api`: HTTP API `/__dockbook_api/*` для редактирования исходников markdown прямо во время `dockbook dev`.

### Modified Capabilities
(нет — это первый набор спецификаций, изменяемых капабилити не существует)

## Impact

- Затрагиваемый код: весь `src/`, `bin/dockbook.js`, частично `assets/app.js` (как наблюдаемое поведение фронтенда для `content-editing-api`/`build`).
- Новые файлы: `openspec/specs/<capability>/spec.md` для каждой капабилити выше.
- Код проекта не меняется, API/поведение не меняется.
