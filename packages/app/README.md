# @cs-okey/app

CS_Okey web client (React + Vite). Faz 1a: playable Klasik Okey vs 3 bots, offline.

## Commands
- `npm run dev` — dev server (http://localhost:5173)
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the build

From the repo root: `npm test` (all packages), `npm run lint` (purity gate).

## Architecture
- UI renders strictly from `PlayerView` (hidden-info safe).
- `LocalAdapter` (src/adapter) holds the authoritative `GameState`, runs `@cs-okey/engine` `reduce()`, drives bot seats via `@cs-okey/bot`, and publishes per-seat views. It implements the same `Adapter` interface the future LAN/online transport will provide — so swapping to networked play does not touch the UI.

Faz 1b (next): drag-drop, auto-arrange, hint, 2nd theme, settings, save/resume, multi-hand match loop.
