# Faz 1c — Save / Resume (kaydet & devam et) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** Persist the in-progress game (both Klasik and 101) so a tab refresh / reopen doesn't lose a multi-hand match. A "Devam Et" menu entry resumes the exact saved position.

**Architecture:** `GameState` is plain serializable data (Tiles are plain objects) and the full state (including the exact remaining `stock` order) is in the snapshot — so resuming is a direct state-restore, NOT a replay. `LocalAdapter` gains `snapshot()` and a `resumeFrom` constructor option, and auto-saves to `localStorage` after every change. Menu shows "Devam Et" when a save exists.

**Tech Stack:** Same (TS strict, Vite/React 19, Vitest + jsdom docblock for app tests, npm workspaces). Storage = `localStorage` (synchronous, jsdom-testable; a single small JSON snapshot — IndexedDB is unnecessary for one match).

## Global Constraints
- npm (NOT pnpm). App .tsx tests start with `// @vitest-environment jsdom`; pure-logic `.ts` tests that touch localStorage ALSO need the jsdom docblock (localStorage is a DOM API).
- Snapshot is internal app state — `LocalAdapter.snapshot()` may serialize its private `GameState`; the UI never reads raw state.
- Save key `cs-okey-savegame`. Saving is best-effort (guard `typeof localStorage`, try/catch quota).
- A finished match (matchOver) clears the save. Starting a NEW game overwrites/clears any save.
- TDD; commits; no placeholders. Keep Klasik + 101 + all 203 tests green.

## File Structure (new/changed)
```
packages\app\src\persistence.ts            # SaveData type + save/load/clear (localStorage)
packages\app\src\adapter\LocalAdapter.ts   # snapshot(); resumeFrom option; auto-save hook
packages\app\src\adapter\Adapter.ts        # LocalOptions + resumeFrom?: SaveData
packages\app\src\screens\Menu.tsx          # "Devam Et" button when a save exists
packages\app\src\App.tsx                   # resume vs new wiring
```

---

### Task 1: `persistence.ts` + LocalAdapter snapshot/resume/auto-save

**Files:** Create `persistence.ts`; Modify `LocalAdapter.ts`, `Adapter.ts`; Test `persistence.test.ts`, extend `localAdapter.test.ts`.
**Interfaces:**
- `persistence.ts`:
  - `export interface SaveData { version: number; variantId: 'klasik'|'yuzbir'; state: unknown; standings: number[]; scoredHandNo: number; savedAt: number }` (state is the serialized GameState; `savedAt` is passed in by the caller — do NOT call Date.now in the engine/bot, but the app layer MAY; here pass it from the adapter using a monotonic counter or `0` if unavailable — keep deterministic-friendly: store the adapter `version` and accept `savedAt` as optional metadata only).
  - `export function saveGame(data: SaveData): void` (JSON.stringify to `localStorage['cs-okey-savegame']`, try/catch).
  - `export function loadGame(): SaveData | null` (parse; null if absent/corrupt).
  - `export function clearGame(): void`.
  - `export function hasSavedGame(): boolean`.
- `Adapter.ts` `LocalOptions`: add `resumeFrom?: SaveData`.
- `LocalAdapter.ts`:
  - `snapshot(): SaveData` — returns `{ version: this.version, variantId: <'yuzbir' if scoringModel yuzbir-penalty else 'klasik'>, state: structuredClone-or-JSON of this.state, standings: [...], scoredHandNo: this.scoredHandNo, savedAt: 0 }`.
  - Constructor: if `opts.resumeFrom` provided, restore `this.state` (from `resumeFrom.state`), `this.version`, `this.standings`, `this.scoredHandNo`, and set `this.variant` from `resumeFrom.variantId` (KLASIK_101 vs KLASIK) — do NOT re-CreateGame/StartHand in that case.
  - Auto-save: after every successful `dispatch` (post bot-loop) and after `nextHand`, call `saveGame(this.snapshot())`. When `getMatch().over`, call `clearGame()` instead.

- [ ] Step 1: Tests — `persistence.test.ts` (jsdom docblock): saveGame→loadGame round-trips; loadGame null when empty/corrupt; clearGame removes. `localAdapter.test.ts`: build adapter A (101), dispatch a discard, take `A.snapshot()`, build adapter B `new LocalAdapter({ seed:0, humanSeat:0, resumeFrom: snapshot })` → `B.getHumanView()` equals A's current view (same rack, same turn, same handNo, same standings); a NEW adapter (no resume) auto-saved after a dispatch (hasSavedGame true); when a match is over, the save is cleared.
- [ ] Steps 2-5: Implement, run, PASS, full suite (was 203) green, lint, commit `feat(app): save/resume via localStorage snapshot in LocalAdapter`.

---

### Task 2: Menu "Devam Et" + App resume wiring

**Files:** Modify `Menu.tsx`, `App.tsx`; Test extend `menu.test.tsx`.
**Interfaces:**
- `Menu`: add a "Devam Et" button shown only when `hasSavedGame()` returns true; new prop `onResume: () => void`.
- `App`: on `onResume`, build a `LocalAdapter({ seed:0, humanSeat:0, resumeFrom: loadGame()! })` (the saved variant is inside the snapshot) and switch to 'game'. On `onStart(variant)` (new game), `clearGame()` first, then start fresh (existing gameKey path). Pass the resume adapter to GameScreen (the `useMemo` must produce the resume adapter when resuming — use a `resumeNonce`/mode flag so the memo builds the right adapter).

- [ ] Step 1: Test (jsdom docblock) — with a saved game present (saveGame a fixture first), Menu shows "Devam Et"; clicking calls `onResume`. Without a save, no "Devam Et" button. App-level: after saving a 101 snapshot, resuming yields a GameScreen with a 101 (22-or-fewer-tile) rack matching the save.
- [ ] Steps 2-5: Implement, run, PASS, full suite green, lint, no act() warnings, commit `feat(app): Devam Et menu entry + resume wiring (clear save on new game)`.

---

### Task 3: Browser verification (controller)
- [ ] Build OK. Dev server: start a 101 game, make a move or two, **reload the page** → menu shows "Devam Et" → click → the exact position is restored (same rack/turn/standings). Start a NEW game → the save is cleared. Screenshot. Commit `docs(app): Faz 1c save/resume verified`.

## Self-Review (plan author)
- Resume is a direct state-restore (full GameState incl. exact stock order is in the snapshot) — no replay, no nondeterminism. Works for both Klasik and 101 (variant stored in the snapshot).
- localStorage chosen over IndexedDB: one small snapshot, synchronous, jsdom-testable; sufficient for a single match. (If multi-slot saves are ever wanted, migrate to IndexedDB then.)
- Save cleared on match-over and on new-game so stale saves don't resurrect finished matches.
- Hidden-info unaffected (snapshot is internal; UI still renders from PlayerView).
- Deferred (later): drag-drop, sound, multi-slot saves, autosave throttling (one tiny write per move is fine).

## Execution Handoff
Subagent-driven; controller reviews; browser verify at Task 3.
