## 1. Проверка спецификаций

- [x] 1.1 Свериться со специалистом/владельцем проекта, что перечень капабилити (cli, dev-setup-wizard, config, nav-config, build, markdown-rendering, diagrams, syntax-highlight, openapi-reference, export-md, dev-server, content-editing-api) ничего не упускает и не дублирует
- [x] 1.2 Прогнать `dockbook dev`, `dockbook build`, `dockbook preview`, `dockbook export-md` вручную и сверить фактическое поведение с описанными сценариями (проверено на `example/`: build, preview со SPA-фоллбеком, dev с live-reload, export-md с трансформацией блоков)
- [x] 1.3 Проверить сценарии content-editing-api (создание страницы/папки, переименование, переключение документации) в браузере при `dockbook dev` (проверено через HTTP: /status, /resolve, создание страницы, 409 на дубликат, точечное переименование title, bad_path на traversal, SSE reload)
- [x] 1.4 Проверить рендер diagrams (flowchart, sequence) и openapi-reference на примере из `example/` (inline SVG подтверждён в showcase.md; openapi-reference подтверждён добавлением openapi-раздела в конфиг — 3 языка примеров, required-маркер `*`)

## 2. Валидация и синхронизация

- [x] 2.1 Прогнать `openspec validate baseline-project-specs --strict` и исправить найденные проблемы формата
- [x] 2.2 Синхронизировать delta-specs из `openspec/changes/baseline-project-specs/specs/` в `openspec/specs/` (`openspec-sync-specs` или архивация)
- [ ] 2.3 Заархивировать изменение `baseline-project-specs` после подтверждения корректности specs
