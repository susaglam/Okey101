# Faz 1a — Playable Klasik vs Bots (React UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the Faz 0 engine into a **playable** offline Klasik Okey game: a human at seat 0 plays a full hand against 3 heuristic bots in a React web app, with the approved Klasik-Yeşil visual look.

**Architecture:** `@cs-okey/bot` (pure `decide(view, legalMoves)` reusing the engine evaluator). `@cs-okey/app` (Vite + React): a `LocalAdapter` implements the spec's `Adapter` interface, owns the authoritative `GameState`, runs the engine `reduce()`, drives bot seats automatically, and publishes per-seat `PlayerView` to the UI. The UI renders ONLY from `PlayerView` (never the raw state) — same hidden-info discipline as the engine, and the exact seam the future LAN/online adapter will replace.

**Tech Stack:** TypeScript strict, Vite, React 19, Vitest + @testing-library/react + jsdom. Interaction for 1a = tap-to-select + action buttons (drag-drop is Faz 1b). One theme (Klasik Yeşil); second theme + polish in 1b.

## Global Constraints

- Packages: `@cs-okey/bot`, `@cs-okey/app` (siblings of `@cs-okey/engine`). npm workspaces (NOT pnpm) — `npm install`, `npx vitest run <path>`, `npm test`, `npm run dev` (in app). 
- `@cs-okey/bot` purity: pure/platform-neutral TS — no DOM/window, no `Date.now()`, no `Math.random()` (same ESLint boundary as engine; bot randomness via a seeded stream passed in). It depends ONLY on `@cs-okey/engine`.
- The UI renders strictly from `PlayerView` (from `redactFor`). The app must NEVER read opponents' racks or the stock array. The `LocalAdapter` holds the full `GameState` privately; the React tree only ever receives `PlayerView`.
- Colors RED/BLACK/BLUE/YELLOW → CSS: red `#d12d2d`, black `#1c1c1c`, blue `#1769d6`, yellow `#d99a12`. Tile = ivory `#f7f2e4` + grey "hole" dot. False joker symbol = ♣ (yonca). Theme Klasik-Yeşil: felt `radial-gradient(ellipse at 50% 42%, #2f8f57, #15622f 68%, #0f4a24)`, wood rack `linear-gradient(180deg,#c08a44,#9a6228 55%,#7a4a1c)`.
- Adapter interface (from spec §3) — exact shape:
  ```ts
  type RejectionCode = 'not-your-turn'|'wrong-phase'|'illegal-move'|'stale-version'|'not-winning'|'unknown'
  type Status = 'connected'|'reconnecting'|'desync'
  interface Adapter {
    dispatch(intent: GameEvent & { expectedVersion: number }): Promise<{ accepted: boolean; reason?: RejectionCode }>
    subscribe(onView: (v: PlayerView) => void, onStatus: (s: Status) => void): () => void
  }
  ```
- Engine is consumed via its public exports (`@cs-okey/engine`): `reduce`, `RuleError`, `legalMoves`, `redactFor`, `evaluateHand`, `scoreHand`, `makeRng`, `deriveSeed`, `KLASIK`, and the types `GameState`, `GameEvent`, `PlayerView`, `Tile`, `tilesEqual`, `tileToString`.
- TDD; frequent commits; no placeholders.

---

## File Structure

```
packages\bot\
  package.json                 # @cs-okey/bot
  tsconfig.json
  src\index.ts                 # decide(view, legalMoves, rng) -> GameEvent
  test\bot.test.ts
packages\app\
  package.json                 # @cs-okey/app (private)
  tsconfig.json
  vite.config.ts
  index.html
  src\
    main.tsx                   # React root
    adapter\Adapter.ts         # interface + types (RejectionCode, Status)
    adapter\LocalAdapter.ts    # engine+bots authority -> PlayerView stream
    theme\klasik.css           # Klasik-Yeşil tokens
    components\Tile.tsx        # one tile (number/color/hole/♣)
    components\Rack.tsx        # your 2-tier rack, tap-select
    components\Seat.tsx        # opponent seat (avatar, count, turn ring)
    components\Table.tsx       # felt + 4 seats + stock + gösterge + discards
    screens\GameScreen.tsx     # subscribe to adapter, actions, hand-end overlay
    screens\Menu.tsx           # "Oyna" -> start
    App.tsx                    # shell: menu <-> game
  test\
    localAdapter.test.ts
    tile.test.tsx
    rack.test.tsx
    gameScreen.test.tsx
```

eslint.config.js (root) must add `packages/bot/src/**` to the purity block (engine already there). 

---

### Task 1: `@cs-okey/bot` package + heuristic `decide()`

**Files:**
- Create: `packages\bot\package.json`, `tsconfig.json`, `src\index.ts`
- Test: `packages\bot\test\bot.test.ts`
- Modify: root `eslint.config.js` (add `packages/bot/src/**` to purity files glob — it may already be included; ensure it is)

**Interfaces:**
- Consumes (from `@cs-okey/engine`): `PlayerView`, `GameEvent`, `evaluateHand`, `tilesEqual`, `KLASIK`, `Tile`.
- Produces: `function decide(view: PlayerView, legal: GameEvent['type'][], rng: () => number): GameEvent` — given a redacted view + the legal move types + a seeded rng, returns ONE concrete `GameEvent` (with `seat = view.seat`). Policy: in DRAW phase, take the left discard if it's already in your rack's near-completion (simple heuristic: if taking it creates a duplicate or a sequence neighbor you hold), else draw from stock. In DISCARD phase, if dropping some tile makes `evaluateHand(rest)` winning, return `DeclareWin` with that tile; else discard the "least useful" tile (a tile with no same-number and no same-color-neighbor in your rack; ties broken by rng). Never returns an illegal move type (only chooses among `legal`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/bot/test/bot.test.ts
import { describe, it, expect } from 'vitest'
import { decide } from '../src/index'
import { makeRng, KLASIK, redactFor, type GameState } from '@cs-okey/engine'
import { tileFromString } from '@cs-okey/engine'

function viewWith(rack: string[], phase: 'DRAW'|'DISCARD', leftDiscard: string[] = []) {
  const state: GameState = {
    gameId: 'g', config: KLASIK, rngSeed: 1, handNo: 1,
    stock: [tileFromString('1R'), tileFromString('2R')],
    indicator: tileFromString('6M'), okey: tileFromString('7M'),
    turn: { seat: 0, phase },
    players: [
      { seat: 0, rack: rack.map(tileFromString), discard: [], hasOpened: false, isOut: false },
      { seat: 1, rack: [], discard: [], hasOpened: false, isOut: false },
      { seat: 2, rack: [], discard: [], hasOpened: false, isOut: false },
      { seat: 3, rack: leftDiscard.map(tileFromString), discard: leftDiscard.map(tileFromString), hasOpened: false, isOut: false },
    ],
    scores: [0,0,0,0], status: 'PLAYING',
  }
  // seat 0's left neighbour is seat 3 (leftSeat(0,4)=3)
  return redactFor(state, 0, 1)
}

describe('bot.decide', () => {
  it('declares win in DISCARD phase when a winning discard exists', () => {
    // 15 tiles: a full-cover 14 + one extra discardable
    const rack = ['9R','9K','9M','9S','5R','5K','5M','5S','1R','2R','3R','11K','12K','13K','8S']
    const ev = decide(viewWith(rack, 'DISCARD'), ['Discard','DeclareWin'], makeRng(1))
    expect(ev.type).toBe('DeclareWin')
    if (ev.type === 'DeclareWin') expect(ev.seat).toBe(0)
  })
  it('discards a useless tile in DISCARD phase when not winning', () => {
    const rack = ['1R','2R','3R','9S','9R','5K','11M','13S','4K','6K','8M','10S','12R','2K','7S']
    const ev = decide(viewWith(rack, 'DISCARD'), ['Discard','DeclareWin'], makeRng(2))
    expect(ev.type).toBe('Discard')
    if (ev.type === 'Discard') expect(rack.map(tileFromString)).toContainEqual(ev.tile)
  })
  it('chooses a legal draw in DRAW phase', () => {
    const ev = decide(viewWith(['1R','2R'], 'DRAW', ['3R']), ['DrawFromStock','DrawFromDiscard'], makeRng(3))
    expect(['DrawFromStock','DrawFromDiscard']).toContain(ev.type)
    expect(ev.seat).toBe(0)
  })
  it('only draws from stock when discard not legal', () => {
    const ev = decide(viewWith(['1R','2R'], 'DRAW', []), ['DrawFromStock'], makeRng(4))
    expect(ev.type).toBe('DrawFromStock')
  })
})
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `npx vitest run packages/bot/test/bot.test.ts`
Expected: FAIL — `@cs-okey/bot` / `../src/index` missing.

- [ ] **Step 3: Create package files + implement**

```json
// packages/bot/package.json
{ "name": "@cs-okey/bot", "version": "0.0.0", "type": "module", "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" }, "dependencies": { "@cs-okey/engine": "*" } }
```
```json
// packages/bot/tsconfig.json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```
```ts
// packages/bot/src/index.ts
import { evaluateHand, tilesEqual, type PlayerView, type GameEvent, type Tile } from '@cs-okey/engine'

export function decide(view: PlayerView, legal: GameEvent['type'][], rng: () => number): GameEvent {
  const seat = view.seat
  const rack = view.you.rack

  if (view.turn.phase === 'DRAW') {
    // Prefer the left discard only if it pairs with or sequences a tile we already hold.
    if (legal.includes('DrawFromDiscard')) {
      const left = view.opponents.find((o) => o.seat === leftSeatOf(seat, view))
      const top = left?.discardTop
      if (top && top.kind === 'NUMBER' && isUseful(top, rack)) {
        return { type: 'DrawFromDiscard', seat }
      }
    }
    return { type: 'DrawFromStock', seat }
  }

  // DISCARD phase: try to win by dropping each tile.
  if (legal.includes('DeclareWin')) {
    for (let i = 0; i < rack.length; i++) {
      const rest = rack.filter((_, j) => j !== i)
      if (evaluateHand(rest, view.okey!, view.config).isWinning) {
        return { type: 'DeclareWin', seat, discardTile: rack[i]! }
      }
    }
  }
  // Otherwise discard the least useful tile.
  const idx = leastUsefulIndex(rack, rng)
  return { type: 'Discard', seat, tile: rack[idx]! }
}

function leftSeatOf(seat: number, view: PlayerView): number {
  return (seat - 1 + view.config.players) % view.config.players
}

function isUseful(t: Tile, rack: Tile[]): boolean {
  return rack.some((r) =>
    r.kind === 'NUMBER' && t.kind === 'NUMBER' && (
      (r.number === t.number && r.color !== t.color) ||           // group potential
      (r.color === t.color && Math.abs((r.number ?? 0) - (t.number ?? 0)) <= 2) // run potential
    ))
}

function leastUsefulIndex(rack: Tile[], rng: () => number): number {
  let bestIdx = 0; let bestScore = Infinity
  for (let i = 0; i < rack.length; i++) {
    const t = rack[i]!
    const rest = rack.filter((_, j) => j !== i)
    const score = isUseful(t, rest) ? 1 : 0
    const jittered = score + rng() * 0.5
    if (jittered < bestScore) { bestScore = jittered; bestIdx = i }
  }
  return bestIdx
}
```
Ensure root `eslint.config.js` `files` glob includes `packages/bot/src/**/*.ts` (add if missing).

- [ ] **Step 4: Run test, verify PASS**

Run: `npx vitest run packages/bot/test/bot.test.ts`
Expected: PASS (4 tests). Then `npm install` (to link the new workspace) if the `@cs-okey/bot` import doesn't resolve, then re-run.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(bot): heuristic decide() for Klasik (keep/discard/win), pure + seeded

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `@cs-okey/app` scaffold (Vite + React + testing-library)

**Files:**
- Create: `packages\app\package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src\main.tsx`, `src\App.tsx`
- Test: `packages\app\test\smoke.test.tsx`
- Modify: root `package.json` devDeps (add React/Vite/testing-library), `vitest.config.ts` (add jsdom environment for app tests)

**Interfaces:**
- Produces: a Vite React app that builds and renders `<App/>`; `npm run dev` (from packages/app) serves it. `App` shows the Menu by default.

- [ ] **Step 1: Failing smoke test**

```tsx
// packages/app/test/smoke.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../src/App'

describe('app smoke', () => {
  it('renders the menu with an Oyna button', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /oyna/i })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run packages/app/test/smoke.test.tsx` → FAIL (App missing / jsdom not configured).

- [ ] **Step 3: Scaffold the app**

```json
// packages/app/package.json
{ "name": "@cs-okey/app", "private": true, "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "@cs-okey/engine": "*", "@cs-okey/bot": "*", "react": "^19.0.0", "react-dom": "^19.0.0" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.0", "vite": "^5.4.0",
    "@testing-library/react": "^16.0.0", "@testing-library/jest-dom": "^6.4.0", "jsdom": "^25.0.0",
    "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0" } }
```
```json
// packages/app/tsconfig.json
{ "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022","DOM","DOM.Iterable"] },
  "include": ["src","test"] }
```
```ts
// packages/app/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()], base: './' })
```
```html
<!-- packages/app/index.html -->
<!doctype html><html lang="tr"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>CS Okey</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
```
```tsx
// packages/app/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
```
```tsx
// packages/app/src/App.tsx
import { useState } from 'react'
import Menu from './screens/Menu'

export default function App() {
  const [started, setStarted] = useState(false)
  if (!started) return <Menu onStart={() => setStarted(true)} />
  return <div>game placeholder</div> // replaced in Task 6
}
```
```tsx
// packages/app/src/screens/Menu.tsx
export default function Menu({ onStart }: { onStart: () => void }) {
  return (
    <div className="menu">
      <h1>♣ CS OKEY</h1>
      <button onClick={onStart}>OYNA ▸</button>
    </div>
  )
}
```
Update root `vitest.config.ts` to use jsdom + jest-dom setup for app tests:
```ts
// vitest.config.ts (root) — replace
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.{ts,tsx}'],
    environment: 'node',
    environmentMatchGlobs: [['packages/app/**', 'jsdom']],
    setupFiles: ['./vitest.setup.ts'],
  },
})
```
```ts
// vitest.setup.ts (root) — new
import '@testing-library/jest-dom/vitest'
```
Add React/Vite/testing-library devDeps to root or rely on the app package; run `npm install`.

- [ ] **Step 4: Run, verify PASS** — `npm install` then `npx vitest run packages/app/test/smoke.test.tsx` → PASS.

- [ ] **Step 5: Commit** — `feat(app): Vite+React scaffold + Menu + jsdom test setup`.

---

### Task 3: `LocalAdapter` — engine+bots authority → PlayerView stream

**Files:**
- Create: `packages\app\src\adapter\Adapter.ts`, `packages\app\src\adapter\LocalAdapter.ts`
- Test: `packages\app\test\localAdapter.test.ts`

**Interfaces:**
- Consumes: engine (`reduce`, `RuleError`, `redactFor`, `legalMoves`, `makeRng`, `deriveSeed`, `KLASIK`, types), bot (`decide`).
- Produces:
  - `Adapter.ts`: the `RejectionCode`, `Status`, `Adapter` types (exact shape from Global Constraints), plus `interface LocalOptions { seed: number; humanSeat: number; difficulty?: 'easy' }`.
  - `LocalAdapter.ts`: `class LocalAdapter implements Adapter` that on construction creates a game (CreateGame+StartHand via reduce), holds the full `GameState` PRIVATELY + a monotonic `version`, and: (a) `subscribe(onView,onStatus)` immediately pushes the human's current `redactFor` view + `'connected'`, returns an unsubscribe fn; (b) `dispatch(intent)` validates `expectedVersion` (reject `'stale-version'` if mismatched), applies via `reduce` (mapping `RuleError` → `{accepted:false, reason}`), bumps version, then **drives bot seats**: while the game is PLAYING and it's a bot seat's turn, compute that bot's redacted view + `legalMoves`, call `decide`, apply, bump version (small synchronous loop). After settling, push the human's new view. Bots use a per-seat seeded rng via `makeRng(deriveSeed(seed, 'bot:'+seat))`. Expose `currentVersion()` and `getHumanView()` for the UI to read the latest version when building an intent.

- [ ] **Step 1: Failing test**

```ts
// packages/app/test/localAdapter.test.ts
import { describe, it, expect } from 'vitest'
import { LocalAdapter } from '../src/adapter/LocalAdapter'
import type { PlayerView } from '@cs-okey/engine'

describe('LocalAdapter', () => {
  it('starts a hand and pushes the human view at seat 0 on subscribe', () => {
    const a = new LocalAdapter({ seed: 123, humanSeat: 0 })
    let v: PlayerView | null = null
    a.subscribe((view) => { v = view }, () => {})
    expect(v).not.toBeNull()
    expect(v!.seat).toBe(0)
    expect(v!.you.rack.length).toBe(15) // starter holds 15
    expect(v!.turn).toEqual({ seat: 0, phase: 'DISCARD' })
  })
  it('rejects an intent with a stale version', async () => {
    const a = new LocalAdapter({ seed: 123, humanSeat: 0 })
    a.subscribe(() => {}, () => {})
    const tile = a.getHumanView().you.rack[0]!
    const res = await a.dispatch({ type: 'Discard', seat: 0, tile, expectedVersion: -99 })
    expect(res).toEqual({ accepted: false, reason: 'stale-version' })
  })
  it('after the human discards, bots play around and turn returns to the human (or hand ends)', async () => {
    const a = new LocalAdapter({ seed: 123, humanSeat: 0 })
    let last: PlayerView | null = null
    a.subscribe((view) => { last = view }, () => {})
    const tile = a.getHumanView().you.rack[0]!
    const res = await a.dispatch({ type: 'Discard', seat: 0, tile, expectedVersion: a.currentVersion() })
    expect(res.accepted).toBe(true)
    // bots 1,2,3 have moved; it is the human's DRAW turn again, OR the hand ended
    expect(last!.status === 'ENDED' || (last!.turn.seat === 0 && last!.turn.phase === 'DRAW')).toBe(true)
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement `Adapter.ts` + `LocalAdapter.ts`**

```ts
// packages/app/src/adapter/Adapter.ts
import type { GameEvent, PlayerView } from '@cs-okey/engine'
export type RejectionCode = 'not-your-turn'|'wrong-phase'|'illegal-move'|'stale-version'|'not-winning'|'unknown'
export type Status = 'connected'|'reconnecting'|'desync'
export interface Adapter {
  dispatch(intent: GameEvent & { expectedVersion: number }): Promise<{ accepted: boolean; reason?: RejectionCode }>
  subscribe(onView: (v: PlayerView) => void, onStatus: (s: Status) => void): () => void
}
export interface LocalOptions { seed: number; humanSeat: number; difficulty?: 'easy' }
```
```ts
// packages/app/src/adapter/LocalAdapter.ts
import {
  reduce, RuleError, redactFor, legalMoves, makeRng, deriveSeed, KLASIK,
  type GameState, type GameEvent, type PlayerView,
} from '@cs-okey/engine'
import { decide } from '@cs-okey/bot'
import type { Adapter, LocalOptions, RejectionCode, Status } from './Adapter'

export class LocalAdapter implements Adapter {
  private state: GameState
  private version = 0
  private viewCb: ((v: PlayerView) => void) | null = null
  private statusCb: ((s: Status) => void) | null = null
  private readonly humanSeat: number
  private readonly seed: number

  constructor(opts: LocalOptions) {
    this.humanSeat = opts.humanSeat
    this.seed = opts.seed
    let s = reduce(null, { type: 'CreateGame', gameId: 'local', seed: opts.seed, config: KLASIK })
    s = reduce(s, { type: 'StartHand' })
    this.state = s
  }

  currentVersion(): number { return this.version }
  getHumanView(): PlayerView { return redactFor(this.state, this.humanSeat, this.version) }

  subscribe(onView: (v: PlayerView) => void, onStatus: (s: Status) => void): () => void {
    this.viewCb = onView; this.statusCb = onStatus
    onStatus('connected')
    onView(this.getHumanView())
    return () => { this.viewCb = null; this.statusCb = null }
  }

  async dispatch(intent: GameEvent & { expectedVersion: number }): Promise<{ accepted: boolean; reason?: RejectionCode }> {
    if (intent.expectedVersion !== this.version) return { accepted: false, reason: 'stale-version' }
    const { expectedVersion, ...event } = intent
    try {
      this.state = reduce(this.state, event as GameEvent)
      this.version++
    } catch (e) {
      if (e instanceof RuleError) return { accepted: false, reason: this.classify(e.message) }
      throw e
    }
    this.runBots()
    this.viewCb?.(this.getHumanView())
    return { accepted: true }
  }

  private runBots(): void {
    let guard = 0
    while (this.state.status === 'PLAYING' && this.state.turn.seat !== this.humanSeat && guard++ < 500) {
      const seat = this.state.turn.seat
      const view = redactFor(this.state, seat, this.version)
      const legal = legalMoves(this.state, seat)
      if (legal.length === 0) break
      const rng = makeRng(deriveSeed(this.seed, `bot:${seat}:${this.state.handNo}:${this.version}`))
      const ev = decide(view, legal, rng)
      try { this.state = reduce(this.state, ev); this.version++ }
      catch { break } // defensive: a bad bot move ends its turn rather than crashing
    }
  }

  private classify(msg: string): RejectionCode {
    if (msg.includes('turn')) return 'not-your-turn'
    if (msg.includes('phase')) return 'wrong-phase'
    if (msg.includes('winning')) return 'not-winning'
    if (msg.includes('rack') || msg.includes('empty')) return 'illegal-move'
    return 'unknown'
  }
}
```

- [ ] **Step 4: Run, verify PASS (3 tests). Then full suite `npm test` → no regressions.**

- [ ] **Step 5: Commit** — `feat(app): LocalAdapter wiring engine+bots to a PlayerView stream`.

---

### Task 4: Theme + `Tile` + `Rack` components

**Files:**
- Create: `packages\app\src\theme\klasik.css`, `src\components\Tile.tsx`, `src\components\Rack.tsx`
- Test: `packages\app\test\tile.test.tsx`, `packages\app\test\rack.test.tsx`

**Interfaces:**
- Consumes: engine `Tile`, `tileToString`.
- Produces:
  - `Tile.tsx`: `function TileView({ tile, selected, onClick }: { tile: Tile; selected?: boolean; onClick?: () => void })` — renders an ivory tile with the number in its color + a grey hole; false joker shows ♣. Adds `data-testid="tile"` and `aria-label` = `tileToString(tile)` (or "sahte okey").
  - `Rack.tsx`: `function Rack({ tiles, selectedIndex, onSelect }: { tiles: Tile[]; selectedIndex: number | null; onSelect: (i: number) => void })` — renders the tiles split into two tiers (first `ceil(n/2)` on the back row, rest on front), each a `TileView`, calling `onSelect(i)` on click.

- [ ] **Step 1: Failing tests**

```tsx
// packages/app/test/tile.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TileView } from '../src/components/Tile'
import { tileFromString } from '@cs-okey/engine'

describe('TileView', () => {
  it('renders number and color label', () => {
    render(<TileView tile={tileFromString('7M')} />)
    expect(screen.getByLabelText('7M')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })
  it('renders ♣ for a false joker', () => {
    render(<TileView tile={tileFromString('X')} />)
    expect(screen.getByText('♣')).toBeInTheDocument()
  })
})
```
```tsx
// packages/app/test/rack.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Rack } from '../src/components/Rack'
import { tileFromString } from '@cs-okey/engine'

describe('Rack', () => {
  it('renders all tiles and fires onSelect with the clicked index', () => {
    const tiles = ['1R','2R','3R','4K'].map(tileFromString)
    const onSelect = vi.fn()
    render(<Rack tiles={tiles} selectedIndex={null} onSelect={onSelect} />)
    expect(screen.getAllByTestId('tile')).toHaveLength(4)
    fireEvent.click(screen.getAllByTestId('tile')[2]!)
    expect(onSelect).toHaveBeenCalledWith(2)
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement theme + components**

```css
/* packages/app/src/theme/klasik.css */
:root {
  --felt: radial-gradient(ellipse at 50% 42%, #2f8f57, #15622f 68%, #0f4a24);
  --wood: linear-gradient(180deg,#c08a44,#9a6228 55%,#7a4a1c);
  --tile-bg: linear-gradient(180deg,#f7f2e4,#e9e0c8);
  --c-red:#d12d2d; --c-black:#1c1c1c; --c-blue:#1769d6; --c-yellow:#d99a12;
}
.okey-tile{ width:40px;height:56px;border-radius:6px;background:var(--tile-bg);
  box-shadow:0 2px 3px rgba(0,0,0,.35), inset 0 1px 0 #fffdf7; position:relative;
  display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:6px;
  font-weight:800;font-size:22px;cursor:pointer;border:none; }
.okey-tile.sel{ outline:3px solid #5ad1c4; transform:translateY(-6px); }
.okey-tile .hole{ width:9px;height:9px;border-radius:50%;
  background:radial-gradient(circle at 40% 35%, #cfcabb, #9a9484); position:absolute;bottom:7px; }
.okey-rack{ background:var(--wood); border-top:3px solid #d9a45e; border-radius:10px; padding:10px; width:max-content;margin:0 auto; }
.okey-tier{ display:flex; gap:4px; } .okey-tier + .okey-tier{ margin-top:6px; }
.felt{ background:var(--felt); min-height:100vh; }
.menu{ background:var(--felt); min-height:100vh; color:#fff; display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:24px;font-family:system-ui; }
.menu h1{ font-size:40px; letter-spacing:3px; }
.menu button, .act button{ background:linear-gradient(180deg,#f0b53e,#d2811a); color:#3a2400;
  font-weight:900;font-size:18px;padding:12px 32px;border:none;border-radius:12px;cursor:pointer; }
```
```tsx
// packages/app/src/components/Tile.tsx
import type { Tile } from '@cs-okey/engine'
import { tileToString } from '@cs-okey/engine'
const COLOR_CLASS: Record<string,string> = { RED:'var(--c-red)', BLACK:'var(--c-black)', BLUE:'var(--c-blue)', YELLOW:'var(--c-yellow)' }
export function TileView({ tile, selected, onClick }: { tile: Tile; selected?: boolean; onClick?: () => void }) {
  const isJoker = tile.kind === 'FALSE_JOKER'
  const label = isJoker ? 'sahte okey' : tileToString(tile)
  const color = tile.color ? COLOR_CLASS[tile.color] : '#7a4a1c'
  return (
    <button type="button" className={`okey-tile${selected ? ' sel' : ''}`} data-testid="tile"
      aria-label={isJoker ? 'sahte okey' : label} onClick={onClick} style={{ color }}>
      <span>{isJoker ? '♣' : tile.number}</span>
      <span className="hole" />
    </button>
  )
}
```
```tsx
// packages/app/src/components/Rack.tsx
import type { Tile } from '@cs-okey/engine'
import { TileView } from './Tile'
export function Rack({ tiles, selectedIndex, onSelect }:
  { tiles: Tile[]; selectedIndex: number | null; onSelect: (i: number) => void }) {
  const split = Math.ceil(tiles.length / 2)
  const back = tiles.slice(0, split); const front = tiles.slice(split)
  return (
    <div className="okey-rack">
      <div className="okey-tier">{back.map((t, i) =>
        <TileView key={i} tile={t} selected={selectedIndex === i} onClick={() => onSelect(i)} />)}</div>
      <div className="okey-tier">{front.map((t, i) =>
        <TileView key={split + i} tile={t} selected={selectedIndex === split + i} onClick={() => onSelect(split + i)} />)}</div>
    </div>
  )
}
```

- [ ] **Step 4: Run, verify PASS (3 tests).**

- [ ] **Step 5: Commit** — `feat(app): Klasik theme + Tile + 2-tier Rack components`.

---

### Task 5: `Seat` + `Table` components

**Files:**
- Create: `packages\app\src\components\Seat.tsx`, `src\components\Table.tsx`
- Test: `packages\app\test\table.test.tsx`

**Interfaces:**
- Consumes: engine `PlayerView`, `Tile`; `TileView`.
- Produces:
  - `Seat.tsx`: `function Seat({ name, count, isTurn }: { name: string; count: number; isTurn: boolean })` — opponent nameplate (avatar initial, tile count, turn highlight class `turn`).
  - `Table.tsx`: `function Table({ view, children }: { view: PlayerView; children?: React.ReactNode })` — felt background; renders the 3 opponents (from `view.opponents`) as Seats (top/left/right by index order), the center stock count + gösterge tile + okey label, the discard top tiles, and the `children` (the human rack + actions) at the bottom.

- [ ] **Step 1: Failing test**

```tsx
// packages/app/test/table.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Table } from '../src/components/Table'
import { LocalAdapter } from '../src/adapter/LocalAdapter'

describe('Table', () => {
  it('renders 3 opponent seats, stock count, and the gösterge', () => {
    const a = new LocalAdapter({ seed: 5, humanSeat: 0 })
    const view = a.getHumanView()
    render(<Table view={view}><div data-testid="bottom">rack</div></Table>)
    expect(screen.getAllByTestId('seat')).toHaveLength(3)
    expect(screen.getByTestId('stock-count').textContent).toContain(String(view.stockCount))
    expect(screen.getByTestId('gosterge')).toBeInTheDocument()
    expect(screen.getByTestId('bottom')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement**

```tsx
// packages/app/src/components/Seat.tsx
export function Seat({ name, count, isTurn }: { name: string; count: number; isTurn: boolean }) {
  return (
    <div className={`seat${isTurn ? ' turn' : ''}`} data-testid="seat"
      style={{ display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:10,
        background:'linear-gradient(180deg,#c08a44,#7a4a1c)',color:'#fff',
        boxShadow: isTurn ? '0 0 12px #5ad1c4' : '0 2px 4px rgba(0,0,0,.4)' }}>
      <div style={{ width:30,height:30,borderRadius:'50%',background:'#3a4570',
        display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800 }}>{name[0]}</div>
      <span style={{ fontWeight:700 }}>{name}</span>
      <span style={{ background:'rgba(0,0,0,.3)',borderRadius:8,padding:'2px 7px',fontSize:12 }}>{count}</span>
    </div>
  )
}
```
```tsx
// packages/app/src/components/Table.tsx
import type { ReactNode } from 'react'
import type { PlayerView } from '@cs-okey/engine'
import { tileToString } from '@cs-okey/engine'
import { Seat } from './Seat'
import { TileView } from './Tile'

const BOT_NAMES = ['Ayşe','Mert','Can','Arda','Elif']
export function Table({ view, children }: { view: PlayerView; children?: ReactNode }) {
  return (
    <div className="felt" style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'space-between',padding:16,color:'#fff',fontFamily:'system-ui' }}>
      <div style={{ display:'flex',gap:40,width:'100%',justifyContent:'space-between' }}>
        {view.opponents.map((o, i) => (
          <Seat key={o.seat} name={BOT_NAMES[i % BOT_NAMES.length]!} count={o.rackCount} isTurn={view.turn.seat === o.seat} />
        ))}
      </div>
      <div style={{ display:'flex',gap:18,alignItems:'center',margin:'18px 0' }}>
        <div data-testid="stock-count" style={{ background:'rgba(0,0,0,.35)',borderRadius:8,padding:'14px 18px',fontWeight:800 }}>
          STOK {view.stockCount}
        </div>
        {view.indicator && (
          <div data-testid="gosterge" style={{ textAlign:'center' }}>
            <TileView tile={view.indicator} />
            <div style={{ fontSize:11,opacity:.8 }}>okey: {view.okey ? tileToString(view.okey) : '-'}</div>
          </div>
        )}
        {view.opponents.map((o) => o.discardTop ? (
          <div key={`d${o.seat}`} style={{ opacity:.85 }}><TileView tile={o.discardTop} /></div>
        ) : null)}
      </div>
      <div>{children}</div>
    </div>
  )
}
```

- [ ] **Step 4: Run, verify PASS.**

- [ ] **Step 5: Commit** — `feat(app): Seat + Table components rendering from PlayerView`.

---

### Task 6: `GameScreen` — wire adapter + actions + hand-end; mount in App

**Files:**
- Create: `packages\app\src\screens\GameScreen.tsx`
- Modify: `packages\app\src\App.tsx` (render GameScreen when started; import theme css in main.tsx)
- Test: `packages\app\test\gameScreen.test.tsx`

**Interfaces:**
- Consumes: `LocalAdapter`, `Table`, `Rack`, engine types, `scoreHand`.
- Produces: `function GameScreen({ adapter }: { adapter: LocalAdapter })` — subscribes on mount; holds `view` + `selectedIndex` state; in DRAW phase shows "Stoktan Çek" + ("Yerden Çek" if legal); in DISCARD phase, tapping a rack tile selects it, "Taş At" discards the selected tile, "Elimi Aç / Bitir" is enabled and attempts a DeclareWin with the selected tile; on `view.status==='ENDED'` shows a hand-end overlay (winner + win type or "Berabere/Void"). All actions build the intent with `expectedVersion: adapter.currentVersion()`.

- [ ] **Step 1: Failing test**

```tsx
// packages/app/test/gameScreen.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GameScreen from '../src/screens/GameScreen'
import { LocalAdapter } from '../src/adapter/LocalAdapter'

describe('GameScreen', () => {
  it('lets the human discard a selected tile and bots respond', async () => {
    const adapter = new LocalAdapter({ seed: 9, humanSeat: 0 })
    render(<GameScreen adapter={adapter} />)
    // starter is in DISCARD phase with 15 tiles
    const tiles = screen.getAllByTestId('tile')
    expect(tiles.length).toBeGreaterThanOrEqual(15)
    fireEvent.click(tiles[0]!) // select first rack tile
    fireEvent.click(screen.getByRole('button', { name: /taş at/i }))
    // after dispatch, either it's the human's draw turn again or the hand ended
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /stoktan çek/i }) ||
        screen.queryByText(/bitti|berabere/i)
      ).toBeTruthy()
    })
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement GameScreen + wire App**

```tsx
// packages/app/src/screens/GameScreen.tsx
import { useEffect, useState } from 'react'
import type { PlayerView, GameEvent } from '@cs-okey/engine'
import { scoreHand } from '@cs-okey/engine'
import type { LocalAdapter } from '../adapter/LocalAdapter'
import { Table } from '../components/Table'
import { Rack } from '../components/Rack'

export default function GameScreen({ adapter }: { adapter: LocalAdapter }) {
  const [view, setView] = useState<PlayerView | null>(null)
  const [sel, setSel] = useState<number | null>(null)

  useEffect(() => adapter.subscribe((v) => { setView(v); setSel(null) }, () => {}), [adapter])
  if (!view) return null

  const isMyTurn = view.turn.seat === view.seat && view.status === 'PLAYING'
  const send = (intent: GameEvent) => { void adapter.dispatch({ ...intent, expectedVersion: adapter.currentVersion() } as GameEvent & { expectedVersion: number }) }

  return (
    <Table view={view}>
      <Rack tiles={view.you.rack} selectedIndex={sel} onSelect={setSel} />
      <div className="act" style={{ display:'flex',gap:10,justifyContent:'center',marginTop:12 }}>
        {isMyTurn && view.turn.phase === 'DRAW' && (
          <>
            <button onClick={() => send({ type: 'DrawFromStock', seat: view.seat })}>Stoktan Çek</button>
            {view.opponents.some((o) => o.seat === (view.seat - 1 + view.config.players) % view.config.players && o.discardCount > 0) && (
              <button onClick={() => send({ type: 'DrawFromDiscard', seat: view.seat })}>Yerden Çek</button>
            )}
          </>
        )}
        {isMyTurn && view.turn.phase === 'DISCARD' && (
          <>
            <button disabled={sel === null} onClick={() => sel !== null && send({ type: 'Discard', seat: view.seat, tile: view.you.rack[sel]! })}>Taş At</button>
            <button disabled={sel === null} onClick={() => sel !== null && send({ type: 'DeclareWin', seat: view.seat, discardTile: view.you.rack[sel]! })}>Elimi Aç / Bitir</button>
          </>
        )}
      </div>
      {view.status === 'ENDED' && (
        <div className="overlay" style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.7)',color:'#fff',
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,fontFamily:'system-ui' }}>
          {view.terminal?.reason === 'win'
            ? <h2>{view.terminal.winnerSeat === view.seat ? '🏆 Kazandın!' : 'El bitti'} — {view.terminal.winType === 'pairs' ? 'Çift' : 'Per'}</h2>
            : <h2>Berabere (stok bitti)</h2>}
          <pre style={{ fontSize:14 }}>{JSON.stringify(scoreHand({ ...stateShim(view) }), null, 0)}</pre>
        </div>
      )}
    </Table>
  )
}

// scoreHand needs a GameState-like terminal; build a minimal shim from the view for display only.
function stateShim(view: PlayerView) {
  return {
    gameId: 'x', config: view.config, rngSeed: 0, handNo: view.handNo, stock: [],
    indicator: view.indicator, okey: view.okey, turn: view.turn,
    players: [view.you, ...view.opponents.map((o) => ({ seat:o.seat, rack:[], discard:[], hasOpened:o.hasOpened, isOut:false }))],
    scores: view.scores, status: view.status, terminal: view.terminal,
  } as any
}
```
```tsx
// packages/app/src/App.tsx — replace
import { useState, useMemo } from 'react'
import Menu from './screens/Menu'
import GameScreen from './screens/GameScreen'
import { LocalAdapter } from './adapter/LocalAdapter'

export default function App() {
  const [started, setStarted] = useState(false)
  const adapter = useMemo(() => new LocalAdapter({ seed: 12345, humanSeat: 0 }), [started])
  if (!started) return <Menu onStart={() => setStarted(true)} />
  return <GameScreen adapter={adapter} />
}
```
```tsx
// packages/app/src/main.tsx — add the theme import at top
import './theme/klasik.css'
```

- [ ] **Step 4: Run, verify PASS. Then full suite `npm test` + `npm run lint` → green/clean.**

- [ ] **Step 5: Commit** — `feat(app): GameScreen (play loop + hand-end) wired to LocalAdapter`.

---

### Task 7: Browser smoke verification + production build

**Files:** none (verification only) — may add `packages\app\README.md`.

- [ ] **Step 1: Production build**

Run: `cd packages/app && npx vite build`
Expected: build succeeds, emits `dist/`.

- [ ] **Step 2: Dev server smoke**

Run `npm run dev` (background) and load the URL; confirm: menu shows → click OYNA → table renders with felt, 3 seats, stock+gösterge, a 15-tile 2-tier rack, action buttons; selecting a tile + "Taş At" advances the turn (bots move; turn returns to you or hand-end overlay appears). Capture a screenshot for the record. (The controller performs this via the run/browser tooling.)

- [ ] **Step 3: Commit** — `docs(app): note dev/build commands; Faz 1a playable`.

---

## Self-Review (plan author)
- **Playable loop:** create→deal→render→human discard→bots auto-play→draw/discard→win/void overlay. ✅ (Tasks 3,6,7)
- **Hidden info preserved:** UI consumes only `PlayerView`; `LocalAdapter` keeps `GameState` private. ✅ (Task 3)
- **Adapter seam == future LAN/online:** same `Adapter` interface, version/status/reject contract exercised by the MVP. ✅
- **Bot reuses engine evaluator** for win + discard heuristic; pure + seeded. ✅ (Task 1)
- **Out of 1a scope (→ 1b):** drag-drop, auto-arrange, hint, 2nd theme, colorblind, settings, save/resume, "Nasıl Oynanır?", sound, multi-hand match loop (1a plays a single hand to terminal; the match/next-hand loop and cumulative scoring UI come in 1b).
- **Placeholder scan:** none — full component/adapter/bot code given. The `stateShim` in GameScreen is a display-only helper for scoreHand and is fully written.
- **Type consistency:** `Adapter` shape identical in Adapter.ts and Global Constraints; `decide(view, legal, rng)` signature consistent across bot.ts/LocalAdapter; `LocalAdapter` exposes `currentVersion()`/`getHumanView()` used by GameScreen.

## Execution Handoff
Subagent-driven per task; controller reviews each; browser verification at Task 7.
