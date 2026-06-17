# Faz 1d — Professional Table + Drag-Drop Rack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps. NOTE: drag-drop + layout are VISUAL — the controller verifies in the browser (screenshots) between/after tasks; unit tests cover structure/logic only.

**Goal:** Make the board feel like a real 4-player Okey table and make the rack actually playable: a **slot-based drag-drop rack** with persistent manual arrangement (NOT reset on draw) and **visible gaps between melds**, proper **4-seat seating** with **directional per-seat discard piles** (each player discards in front of the neighbour to their right), and a clearly **highlighted takeable tile** (the left neighbour's last discard).

**Architecture:** Add `@dnd-kit/core` for drag-drop. The rack becomes a **slot grid** (2 rows × N slots, some empty = gaps): tiles live in slots; dragging a tile to an empty slot moves it, onto an occupied slot swaps. Slot layout is component state keyed by tile identity, **reconciled** across engine-rack changes (draw → place new tile in first empty slot; discard → free that slot) so the player's arrangement persists. The `Table` is re-laid-out so seat 0 = bottom, seat 1 = right, seat 2 = top, seat 3 = left (turn advances right per engine `nextSeat`), with each seat's **discard pile placed between that seat and the seat to its right**; the human's takeable pile (left neighbour seat 3's discards) is highlighted on the human's DRAW turn.

**Tech Stack:** Same + `@dnd-kit/core` (+ `@dnd-kit/utilities`). React 19. Vitest + jsdom. Browser verification by controller.

## Global Constraints
- npm (NOT pnpm). App .tsx tests start with `// @vitest-environment jsdom`.
- UI renders only from `PlayerView`. Engine/adapter unchanged (this is a pure UI/UX phase — no rule changes).
- **Seat geometry (must match the engine):** human = seat 0 bottom. `leftSeat(0)=3` (you TAKE from seat 3's discard) → seat 3 on the LEFT. `nextSeat(0)=1` (seat 1 plays after you and takes YOUR discard) → seat 1 on the RIGHT. seat 2 = TOP. Discard flow: you→(pile at bottom-right, in front of seat 1); seat1→(right, in front of seat 2/top); etc. Your takeable pile = seat 3's discards, shown at your LEFT, highlighted when it's your DRAW turn and the pile is non-empty.
- **Meld gaps:** the rack shows empty slots as visual gaps; "↺ Sırala" arranges tiles into melds-first with ONE empty slot between melds (using engine `arrange`).
- **Persistent order:** drawing a tile must NOT reset the player's manual slot arrangement (the prior `setOrder(null)`-on-every-view behaviour is removed); only reconcile the delta.
- Keep all 223 tests green; keep Klasik + 101 working.
- TDD for logic/structure; commits; no placeholders.

## File Structure (new/changed)
```
packages\app\package.json                  # + @dnd-kit/core, @dnd-kit/utilities
packages\app\src\rack\slots.ts             # pure slot-layout model + reconcile + autoArrange (TDD'able)
packages\app\src\components\SlotRack.tsx   # dnd-kit slot grid (replaces Rack usage in GameScreen)
packages\app\src\components\Table.tsx      # 4-seat geometry + directional discard piles + takeable highlight
packages\app\src\components\Seat.tsx       # seat nameplate (position-aware)
packages\app\src\components\DiscardPile.tsx# a seat's discard pile (top tile + count; takeable highlight)
packages\app\src\screens\GameScreen.tsx    # use SlotRack; persistent layout; takeable-pile click = DrawFromDiscard
```

---

### Task 1: Pure slot-layout model (`rack/slots.ts`) — TDD

**Files:** Create `packages\app\src\rack\slots.ts`; Test `packages\app\test\slots.test.ts`.
**Interfaces (pure, no React):**
- `type SlotLayout = (Tile | null)[]` — fixed length (e.g. `2 * cols`, cols = `Math.max(14, ceil(tiles/2)+2)` or a constant like 28 slots / 2 rows of 14). Each entry a Tile or null (gap).
- `function initLayout(tiles: Tile[], cols: number): SlotLayout` — place tiles left-to-right across 2 rows, rest null.
- `function reconcile(prev: SlotLayout, tiles: Tile[]): SlotLayout` — keep existing tiles in their slots; remove tiles no longer present (→ null); add tiles not yet placed into the first empty slots; preserve arrangement. (Compares by `tilesEqual` with multiplicity — handle duplicate tiles by count.)
- `function moveTile(layout: SlotLayout, from: number, to: number): SlotLayout` — move tile from slot `from` to slot `to`; if `to` occupied, swap.
- `function autoArrange(tiles: Tile[], okey: Tile, config, cols: number): SlotLayout` — use engine `arrange()`; lay `melds` first each contiguous, ONE empty slot between melds, then leftovers; wrap across the 2 rows; return layout.
- `function layoutToTiles(layout: SlotLayout): Tile[]` — non-null tiles in slot order (for any order-dependent needs).

- [ ] Step 1: Tests — initLayout places N tiles in first N slots; reconcile after a draw keeps prior positions and puts the new tile in the first empty slot; reconcile after a discard frees the removed tile's slot and keeps others; moveTile swaps; autoArrange groups melds with a gap between them (assert there is ≥1 null between two melds and all tiles present). Use concrete `h(...)` tiles + okey.
- [ ] Steps 2-5: Implement, run, PASS, full suite (was 223) green, lint, commit `feat(app): pure slot-layout model (reconcile/move/autoArrange) for the rack`.

---

### Task 2: `SlotRack` drag-drop component (dnd-kit)

**Files:** add deps to `packages\app\package.json`; Create `SlotRack.tsx`; Test `slotRack.test.tsx`.
**Interfaces:**
- `SlotRack({ layout, okey, colorblind, repValue, selectedSlot, onSelectSlot, onMove }: { layout: SlotLayout; okey?: Tile; colorblind?: boolean; repValue?: boolean; selectedSlot: number|null; onSelectSlot:(slot:number|null)=>void; onMove:(from:number,to:number)=>void })`.
- Renders a wooden 2-row rack (BIGGER than now — taller tiles, more padding), each slot a droppable; each tile a draggable `TileView`. Empty slots render as visible gaps (subtle recessed slot). Dragging a tile and dropping on a slot calls `onMove(from,to)`. Tapping a tile selects its slot (`onSelectSlot`). Uses `@dnd-kit/core` `DndContext` + `useDraggable`/`useDroppable`.
- Visual: clearer meld separation comes from the empty slots in the layout (Task 1 autoArrange + manual gaps).

- [ ] Step 1: Test (jsdom docblock) — render `SlotRack` with a layout containing tiles + a gap; assert the tiles render (count) and an empty slot exists (a slot element with no tile / data-empty). Assert tapping a tile fires `onSelectSlot` with its slot index. (Drag itself is verified in the browser — dnd-kit pointer drag isn't reliably simulable in jsdom; keep the unit test to render + tap.)
- [ ] Steps 2-4: Implement, run, PASS, full suite green, lint. **Controller browser check after this task:** the rack is bigger, tiles draggable, gaps visible.
- [ ] Step 5: Commit `feat(app): SlotRack drag-drop rack (dnd-kit) with visible gaps`.

---

### Task 3: GameScreen — use SlotRack, persistent layout, hint/sırala via slots

**Files:** Modify `GameScreen.tsx`; Test extend.
**Interfaces:**
- Replace `<Rack tiles=... order=...>` with `<SlotRack layout=... onMove=...>`. Keep a `layout` state (SlotLayout). On each new `view`: `setLayout(prev => prev ? reconcile(prev, view.you.rack) : initLayout(view.you.rack, COLS))` — **do NOT reset to null** (this fixes "sorting resets on every draw").
- "↺ Sırala" → `setLayout(autoArrange(view.you.rack, view.okey, view.config, COLS))`.
- "💡 İpucu" → compute `suggestDiscard`, find its slot in `layout`, set `selectedSlot`.
- Discard/DeclareWin use the tile in the `selectedSlot` (by value).
- Drawing: handled by reconcile (new tile appears in first empty slot; manual arrangement preserved).

- [ ] Step 1: Test (jsdom) — render GameScreen; after a simulated draw (drive a discard so a draw happens, or assert via state) the previously-arranged layout is preserved (a placed tile stays in its slot; the new tile is in a new slot). At minimum: assert SlotRack receives a layout and that clicking İpucu selects a slot. Keep robust.
- [ ] Steps 2-4: Implement, run, PASS, full suite green, lint, no act() warnings. **Controller browser check:** draw a tile → arrangement persists; İpucu highlights; Sırala groups with gaps.
- [ ] Step 5: Commit `feat(app): GameScreen uses SlotRack with persistent layout (no reset on draw)`.

---

### Task 4: `Table` 4-seat geometry + directional discard piles + takeable highlight

**Files:** Create `DiscardPile.tsx`; rewrite `Table.tsx`; modify `Seat.tsx`; Test `table.test.tsx` (update), `discardPile.test.tsx`.
**Interfaces:**
- `Table({ view, children })` — CSS-grid/absolute layout placing: seat 0 (you) bottom (children = SlotRack + actions), seat 1 right, seat 2 top, seat 3 left. Center = stok count + gösterge tile + okey label + a small **draw-direction arrow**. Each opponent rendered with `<Seat position="right|top|left" .../>`.
- `DiscardPile({ tiles? , topTile?, count, takeable, onTake }: ...)` — shows the pile's top tile (face up) + count; when `takeable` (it's the human's left-neighbour pile and it's the human's DRAW turn and non-empty), add a glow + make it clickable → `onTake()` (dispatch DrawFromDiscard). PlayerView exposes each opponent's `discardTop`/`discardCount`; the human's own discard via `view.you.discard`.
- **Placement:** each seat's discard pile sits between that seat and the seat to its RIGHT (the next player), reflecting "discard in front of your right neighbour". The human's takeable pile = seat 3 (left) pile, placed at the human's left, highlighted.
- `Seat({ name, count, isTurn, position })` — nameplate oriented to its side (vertical text for left/right like the reference is optional; keep legible).

- [ ] Step 1: Tests — `discardPile.test.tsx` (jsdom): renders top tile + count; `takeable` adds a clickable affordance that fires `onTake`. `table.test.tsx`: 3 opponent seats render in the 3 non-bottom positions; the takeable pile is marked when `takeable` (drive via a view where it's the human DRAW turn and the left pile has a tile); stok + gösterge present; children render at bottom.
- [ ] Steps 2-4: Implement, run, PASS, full suite green, lint. **Controller browser check:** seats around the table; discards flow directionally; takeable tile glows on your draw turn; clicking it draws from the floor.
- [ ] Step 5: Commit `feat(app): 4-seat table geometry + directional discard piles + takeable highlight`.

---

### Task 5: Controller browser verification + polish pass
- [ ] Build OK. Dev server: play both Klasik and 101. Verify: (1) rack is bigger, tiles drag-drop between slots, gaps visible; (2) drawing a tile keeps the manual arrangement; (3) Sırala groups melds with gaps; (4) the takeable floor tile is clearly highlighted and clickable; (5) 4 seats sit around the table (you bottom, right/top/left) and discards appear in front of the right neighbour (directional), not piled in the centre. Screenshot Klasik + 101. Iterate on spacing/sizing if needed. Commit `docs(app): Faz 1d table+dnd verified` + a short note of any deferred polish.

## Self-Review (plan author)
- Addresses all 6 user points: meld gaps (slot gaps + Sırala), drag-drop (SlotRack/dnd-kit), persistent order (reconcile, no reset), clear takeable tile (DiscardPile glow+click), 4-seat seating (Table geometry), directional discards (pile in front of right neighbour).
- Pure slot model (Task 1) is unit-tested; visual DnD/layout verified in browser by controller (the right split given jsdom can't drag).
- No engine/rule changes — pure UI/UX. Seat geometry matches engine `nextSeat`/`leftSeat`.
- Risk: `@dnd-kit/core` + React 19 compat — if incompatible, fall back to a pointer-event slot-swap (no dep). Controller checks in browser at Task 2.
- Deferred: animations/juice on drag (snap/ghost can be added later via Framer Motion); vertical nameplate text styling is optional.

## Execution Handoff
Subagent-driven for Tasks 1-4; controller does browser verification at Tasks 2,3,4 and the final Task 5.
