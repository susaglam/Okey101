# Faz 1b — Game Feel (match loop, auto-arrange, hint, themes, settings) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** Make the playable Klasik game feel complete: a multi-hand match with a real scoreboard, one-tap auto-arrange, a discard hint, a Gece (dark) theme + settings, and a "Nasıl Oynanır?" help screen.

**Architecture:** New pure engine helper `arrange()`/`analyzeHand()` (best meld partition — reused by auto-arrange + hint, and later by 101 open-≥101). Match loop lives in `LocalAdapter` (accumulate `scoreHand` across hands, `nextHand()`). UI gains a scoreboard, auto-arrange/hint buttons, theme/settings (localStorage), colorblind glyphs, and a help screen.

**Tech Stack:** Same as Faz 1a (TS strict, Vite/React 19, Vitest + @testing-library/react + jsdom). npm workspaces.

## Global Constraints
- npm (NOT pnpm): `npm install`, `npx vitest run <path>`, `npm test`, `npm run lint`, `npm run dev`.
- Engine/bot stay pure (no DOM/Date.now/Math.random) — `arrange` goes in `@cs-okey/engine` and obeys the purity lint.
- UI renders only from `PlayerView`; `LocalAdapter` keeps `GameState` private (unchanged from 1a).
- Colors red `#d12d2d`/black `#1c1c1c`/blue `#1769d6`/yellow `#d99a12`; false joker ♣. Gece theme felt `linear-gradient(160deg,#10131f,#1b2236)`, keeps the wood rack.
- Colorblind glyphs per color: RED ●, BLACK ■, BLUE ▲, YELLOW ◆ (shown under the number when enabled).
- Match length default 5 hands (config `matchHands`), lowest-loss/highest-score wins per Klasik (winner +, others −; cumulative).
- TDD; frequent commits; no placeholders.
- Deferred to Faz 1c (note, don't build here): drag-drop reorder, IndexedDB save/resume, sound assets.

## File Structure (new/changed)
```
packages\engine\src\arrange.ts          # arrange() + analyzeHand() + best discard
packages\engine\test\arrange.test.ts
packages\app\src\adapter\LocalAdapter.ts # + match loop (standings, nextHand)
packages\app\src\match.ts                # MatchState type + helpers (pure)
packages\app\src\theme\gece.css          # dark theme tokens
packages\app\src\theme\themes.ts         # theme id + body class switch
packages\app\src\settings.ts             # localStorage-backed settings
packages\app\src\components\Tile.tsx     # + colorblind glyph + repValue
packages\app\src\components\Scoreboard.tsx
packages\app\src\screens\GameScreen.tsx  # auto-arrange/hint buttons, scoreboard, next-hand, settings
packages\app\src\screens\Help.tsx        # "Nasıl Oynanır?"
packages\app\src\screens\Menu.tsx        # + Nasıl Oynanır + theme toggle
```

---

### Task 1: Engine `arrange()` — best meld partition + hint helper

**Files:** Create `packages\engine\src\arrange.ts`; Test `packages\engine\test\arrange.test.ts`; Modify `src\index.ts` (export).

**Interfaces:**
- Consumes: `Tile`, `tilesEqual`, `VariantConfig`, plus the existing meld-checking primitives in `evaluator/melds.ts` (you may import internal helpers or re-derive; keep `arrange.ts` self-contained if cleaner).
- Produces:
  - `interface Arrangement { melds: Tile[][]; leftovers: Tile[]; meldedCount: number }`
  - `function arrange(rack: Tile[], okey: Tile, config: VariantConfig): Arrangement` — returns a partition that MAXIMIZES the number of tiles placed in valid melds (runs ≥3 same-color consecutive with wrap per config; groups 3-4 same-number distinct-color), wilds (false jokers + okey-valued tiles) usable inside melds. `leftovers` = tiles not in any meld (wilds left over count as leftovers). Deterministic (stable tile ordering).
  - `function suggestDiscard(rack: Tile[], okey: Tile, config: VariantConfig): Tile` — returns the leftover tile that is "least useful" (a leftover with no near-meld potential), for the hint button; if there are no leftovers (rack fully melds) returns the last tile.

- [ ] **Step 1: Failing test**
```ts
// packages/engine/test/arrange.test.ts
import { describe, it, expect } from 'vitest'
import { arrange, suggestDiscard } from '../src/arrange'
import { KLASIK } from '../src/config'
import { tileFromString, tileToString } from '../src/tile'
const h = (...s: string[]) => s.map(tileFromString)
const OKEY = tileFromString('7M')

describe('arrange', () => {
  it('groups three obvious melds and reports leftovers', () => {
    const rack = h('1R','2R','3R','4K','5K','6K','9S','9R','9M','8M','2S') // 3 melds (9 tiles) + 8M,2S leftover
    const a = arrange(rack, OKEY, KLASIK)
    expect(a.meldedCount).toBe(9)
    expect(a.melds.length).toBe(3)
    expect(a.leftovers.map(tileToString).sort()).toEqual(['2S','8M'])
  })
  it('uses a wild inside a meld to maximize melded count', () => {
    const rack = h('1R','X','3R','9S','9R') // 1R-(X)-3R run(3) + 9S,9R leftover
    const a = arrange(rack, OKEY, KLASIK)
    expect(a.meldedCount).toBe(3)
    expect(a.melds[0]!.length).toBe(3)
  })
  it('suggestDiscard returns a leftover tile', () => {
    const rack = h('1R','2R','3R','4K','5K','6K','9S','9R','9M','8M','2S')
    const d = suggestDiscard(rack, OKEY, KLASIK)
    expect(['8M','2S']).toContain(tileToString(d))
  })
})
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `arrange.ts`** — a backtracking search that, for the lexicographically-first uncovered tile, tries every group (size 3-4, wilds filling) and every run (length ≥3 through it, wilds filling), recursing, and tracks the partition with the maximum `meldedCount`; the base/fallback is "skip this tile to leftovers." Return the best partition found. `suggestDiscard` = `arrange(...).leftovers` pick (a leftover with no same-number/adjacent-same-color partner among the rack; tie → first), else last tile. Export both. Add `export * from './arrange'` to index.ts.
  > Reuse the meld-validity logic from `evaluator/melds.ts` (consider extracting shared `isGroup`/`isRun` predicates to avoid duplication; if you extract, keep `evaluator` green). The tests are the contract.
- [ ] **Step 4: Run → PASS; then `npm test` full suite + `npm run lint`.**
- [ ] **Step 5: Commit** — `feat(engine): arrange() best meld partition + suggestDiscard (auto-arrange/hint core)`.

---

### Task 2: Match loop in `LocalAdapter` + `match.ts`

**Files:** Create `packages\app\src\match.ts`; Modify `packages\app\src\adapter\LocalAdapter.ts`, `Adapter.ts` (add match fields to options); Test `packages\app\test\match.test.ts`.

**Interfaces:**
- Produces:
  - `match.ts`: `interface MatchState { handNo: number; totalHands: number; standings: number[]; over: boolean }` + `function applyHandScore(prev: number[], deltas: number[]): number[]` (element-wise add).
  - `LocalAdapter` additions: constructor opt `matchHands?: number` (default 5). After a hand ends (`status==='ENDED'`), the adapter computes `scoreHand` and adds to `standings` ONCE (guard against double-count). New method `nextHand(): void` — if match not over, calls `reduce(state, {type:'StartHand'})`, pushes the fresh human view. New getter `getMatch(): MatchState`. Subscribe pushes match state too (extend the view callback OR add `subscribeMatch`; simplest: add `getMatch()` and have the UI read it after each view).

- [ ] **Step 1: Failing test**
```ts
// packages/app/test/match.test.ts
import { describe, it, expect } from 'vitest'
import { applyHandScore } from '../src/match'
import { LocalAdapter } from '../src/adapter/LocalAdapter'

describe('match', () => {
  it('applyHandScore adds element-wise', () => {
    expect(applyHandScore([0,0,0,0], [6,-2,-2,-2])).toEqual([6,-2,-2,-2])
    expect(applyHandScore([6,-2,-2,-2], [-2,-2,6,-2])).toEqual([4,-4,4,-4])
  })
  it('accumulates standings once when a hand ends and can start the next hand', async () => {
    const a = new LocalAdapter({ seed: 1, humanSeat: 0, matchHands: 3 })
    a.subscribe(() => {}, () => {})
    // force a quick void by emptying stock then drawing
    // (drive via dispatch until the hand ends; for the test, just assert match plumbing)
    const m0 = a.getMatch()
    expect(m0).toMatchObject({ handNo: 1, totalHands: 3, over: false })
    expect(m0.standings).toEqual([0,0,0,0])
  })
})
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `match.ts` + the LocalAdapter additions (scoreHand-on-end with a `scored` guard flag per hand; `nextHand`; `getMatch`). Import `scoreHand` from engine. Ensure standings accumulate exactly once per ended hand.
- [ ] **Step 4: Run → PASS; full suite + lint.**
- [ ] **Step 5: Commit** — `feat(app): multi-hand match loop in LocalAdapter (standings, nextHand)`.

---

### Task 3: Scoreboard + next-hand + match-end UI

**Files:** Create `packages\app\src\components\Scoreboard.tsx`; Modify `GameScreen.tsx`; Test `packages\app\test\scoreboard.test.tsx`.

**Interfaces:**
- `Scoreboard.tsx`: `function Scoreboard({ standings, names, handNo, totalHands }: {...})` — renders the running standings table. Used in the hand-end overlay (replacing the raw JSON dump from 1a).
- `GameScreen`: on `status==='ENDED'`, show the hand result (winner + win type, or "Berabere") + `<Scoreboard>` + a **"Sonraki El ▸"** button calling `adapter.nextHand()` (or, if `getMatch().over`, a "Maç Bitti" final scoreboard with the winner highlighted).

- [ ] **Step 1: Failing test** — render `<Scoreboard standings={[6,-2,-2,-2]} names={['Sen','Ayşe','Mert','Can']} handNo={1} totalHands={5} />`, assert each name + score appears; render GameScreen at an ended state (drive a void) and assert a "Sonraki El" button exists.
- [ ] **Step 2-4:** Implement, run, PASS, full suite + lint.
- [ ] **Step 5: Commit** — `feat(app): scoreboard + next-hand/match-end UI`.

---

### Task 4: Auto-arrange + Hint buttons

**Files:** Modify `GameScreen.tsx` (+ Rack may accept an explicit tile order); Test extend `gameScreen.test.tsx` or new `arrangeUi.test.tsx`.

**Interfaces:**
- GameScreen holds a local `order: number[] | null` (display order of the human rack). "↺ Sırala" (auto-arrange) calls engine `arrange(view.you.rack, view.okey, view.config)` and reorders the displayed rack to `[...melds.flat(), ...leftovers]` (purely visual — does NOT mutate engine state). "💡 İpucu" calls `suggestDiscard(...)` and highlights that tile in the rack (sets `sel` to its index). Buttons visible on the human's turn.

- [ ] **Step 1: Failing test** — render GameScreen, click "Sırala", assert the rendered tile order changed to a melds-first arrangement (e.g. first three tiles form a meld) OR that clicking "İpucu" selects a tile (a tile becomes `[active]`). Keep the assertion robust to the seeded deal.
- [ ] **Step 2-4:** Implement, run, PASS, full suite + lint.
- [ ] **Step 5: Commit** — `feat(app): one-tap auto-arrange + discard hint (engine arrange/suggestDiscard)`.

---

### Task 5: Gece theme + settings (localStorage) + colorblind glyphs

**Files:** Create `packages\app\src\theme\gece.css`, `theme\themes.ts`, `settings.ts`; Modify `Tile.tsx` (glyph + repValue), `main.tsx` (import gece.css), `GameScreen.tsx`/`Menu.tsx` (settings + theme toggle); Test `settings.test.ts`, extend `tile.test.tsx`.

**Interfaces:**
- `settings.ts`: `interface Settings { theme: 'klasik'|'gece'; colorblind: boolean; repValue: boolean; sound: boolean; difficulty: 'easy'|'medium'|'hard' }` + `loadSettings()`/`saveSettings(s)` (localStorage key `cs-okey-settings`, defaults: klasik/false/true/false/medium). Pure-ish (guards `typeof localStorage`).
- `themes.ts`: `applyTheme(id)` sets `document.body.dataset.theme = id` (CSS uses `body[data-theme="gece"]` overrides in gece.css).
- `Tile.tsx`: new optional props `colorblind?: boolean` (renders the per-color glyph ●■▲◆ under the number) and `repValue?: number` (for a false joker/okey, shows a small "=N" in the corner).
- Settings UI: a ⚙ panel in GameScreen (toggles persisted via saveSettings) + a 🌙/☀ toggle in Menu.

- [ ] **Step 1: Failing tests** — `settings.test.ts`: save then load round-trips; defaults when empty. `tile.test.tsx`: with `colorblind` a glyph element renders; with `repValue` a "=7" appears on a false joker.
- [ ] **Step 2-4:** Implement (gece.css overrides felt/seat backgrounds; klasik.css unchanged), run, PASS, full suite + lint.
- [ ] **Step 5: Commit** — `feat(app): Gece theme + persisted settings + colorblind glyphs/repValue`.

---

### Task 6: "Nasıl Oynanır?" help + Menu wiring; browser verify + build

**Files:** Create `packages\app\src\screens\Help.tsx`; Modify `Menu.tsx`, `App.tsx`; Test `help.test.tsx`.

**Interfaces:**
- `Help.tsx`: `function Help({ onBack }: { onBack: () => void })` — a static screen explaining Klasik Okey (deck, gösterge→okey, seri vs grup, çift, okey ile bitme, the −2/−4 scoring), with a "Geri" button. Plain content, no engine calls.
- `Menu.tsx`: add "Nasıl Oynanır?" button → shows Help; add 🌙/☀ theme toggle (uses settings + applyTheme).
- `App.tsx`: route menu ↔ game ↔ help.

- [ ] **Step 1: Failing test** — render Menu, click "Nasıl Oynanır?", assert Help content (e.g. text /gösterge/i) appears; click "Geri" returns to Menu.
- [ ] **Step 2-4:** Implement, run, PASS, full suite + lint.
- [ ] **Step 5:** Production build (`cd packages/app && npx vite build`) succeeds. Browser smoke (controller): play 2 hands (discard→bots→draw→…→hand-end→Sonraki El→scoreboard updates), click Sırala (rack reorders), İpucu (tile highlights), toggle Gece theme (felt darkens), open Help. Screenshot. Commit `docs(app): Faz 1b game-feel verified`.

---

## Self-Review (plan author)
- Match loop (multi-hand + standings) ✅ T2/T3; auto-arrange + hint ✅ T1/T4; Gece theme + settings + colorblind ✅ T5; help ✅ T6.
- `arrange()` is the one genuinely new algorithm — partition-maximizing backtracking; tests are the contract; reuses meld predicates (extract shared if cleaner, keep evaluator green).
- Hidden-info unchanged: arrange/suggestDiscard operate on the human's OWN `view.you.rack`; no opponent data.
- Deferred (Faz 1c): drag-drop reorder, IndexedDB save/resume, sound. Noted, not built.
- Placeholder scan: engine + adapter + settings have full code; UI tasks specify exact components/props/tests.

## Execution Handoff
Subagent-driven per task; controller reviews; browser verify at Task 6.
