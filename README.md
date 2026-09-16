# Bite&Go

Единый проект: **тёмный React-дизайн** + **Node.js сервер** + **SQLite** + реальное API.

## Структура

```
BiteGo/
├── server.js       ← HTTP + /api/*
├── database.js     ← SQLite (node:sqlite)
├── config.js       ← меню, точки, слоты, коды сотрудников
├── package.json
├── vite.config.ts
├── index.html
├── src/
│   ├── App.tsx     ← UI + fetch к /api
│   ├── main.tsx
│   └── index.css
└── public/         ← сюда попадает сборка (npm run build)
```

## Требования

- **Node.js ≥ 22.5** (нужен встроенный `node:sqlite`)
- npm

## Первый запуск (локально)

```bash
cd BiteGo
npm install
npm run build      # собирает React → public/
node server.js     # http://localhost:3000
```

Открой http://localhost:3000

### Демо-коды сотрудников (config.js)

| Имя    | Код      | Точка |
|--------|----------|-------|
| Алия   | AL7K2XQ9 | Точка А — 1 этаж |
| Данияр | DN4P8WZ1 | Точка А |
| Ерлан  | ER3M6TC5 | Точка Б |
| …      | …        | … |

## Как проверить, что API живое

1. Студент: точка → меню → слот → «Оплатить»
2. Заказ появляется во вкладке «Заказ» со статусом «Оплачен»
3. Ещё → Вход для сотрудников → код `AL7K2XQ9`
4. Заказ в «Новые» → Принять → Загрузить в Locker
5. У студента статус «В Locker» → «Забрать заказ»

Заказы пишутся в файл `bitego.db` рядом с сервером.

## Render / GitHub

1. Залей папку BiteGo в репозиторий (без node_modules, без bitego.db)
2. На Render: Web Service, Build Command: `npm install && npm run build`, Start: `node server.js`
3. Node version: 22.x

## Dev-режим (hot reload)

В одном терминале: `node server.js`  
В другом: `npm run dev` (Vite на :5173, проксирует `/api` на :3000)

## API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | /api/config | locations, menu, slots |
| POST | /api/staff/login | {code} → {name, location} |
| POST | /api/orders | создать заказ |
| GET | /api/orders?location= | список |
| GET | /api/orders/:id | один заказ |
| POST | /api/orders/:id/accept | {minutes, staffName} |
| POST | /api/orders/:id/load | {zone, tray, staffName} |
| POST | /api/orders/:id/deliver | {token, by} |
| POST | /api/orders/:id/force-deliver | {by} |
