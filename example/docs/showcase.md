---
title: Витрина блоков
description: Все MDC-компоненты dockbook на одной странице
---

# Витрина блоков

## Hint

::hint{type="info"}
Информационная подсказка.
::

::hint{type="warning"}
Предупреждение.
::

::hint{type="danger"}
Опасность.
::

::hint{type="success"}
Успех.
::

## Tabs

::tabs
::tab{label="npm"}
```bash
npm install dockbook
```
::
::tab{label="pnpm"}
```bash
pnpm add dockbook
```
::
::

## Steps

::steps
### Первый шаг
Описание первого шага.

### Второй шаг
Описание второго шага.
::

## Accordion

::accordion
::accordion-item{label="Что такое dockbook?"}
Самостоятельный аналог GitBook на Nuxt Content.
::
::accordion-item{label="Нужен ли Tailwind?"}
Нет, используется собственный CSS на custom properties.
::
::

## Code group

::code-group
```bash [npm]
npm install dockbook
```
```bash [pnpm]
pnpm add dockbook
```
::

## Cards

::cards
::card{title="Быстрый старт" to="/guide/setup"}
Установка и первый запуск.
::
::card{title="API" to="/api"}
Автоматически сгенерированный reference.
::
::

## Table

| Колонка A | Колонка B | Колонка C |
| --- | --- | --- |
| 1 | 2 | 3 |

## Mermaid

::mermaid
```
graph TD
  A[Markdown] --> B[dockbook]
  B --> C[Статический сайт]
```
::
