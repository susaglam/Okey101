import { tilesEqual, arrange, openingValue, findLayablePairs } from '@cs-okey/engine'
import type { Tile, TileColor } from '@cs-okey/engine'
import type { VariantConfig } from '@cs-okey/engine'

/**
 * A fixed-length array representing a 2-row rack grid.
 * Indices 0..cols-1  = back row (top).
 * Indices cols..2*cols-1 = front row (bottom).
 * null entries are empty/gap slots.
 */
export type SlotLayout = (Tile | null)[]

/**
 * Create a new layout of length 2*cols, placing `tiles` left-to-right
 * (back row first, then front row), with remaining slots set to null.
 */
export function initLayout(tiles: Tile[], cols: number): SlotLayout {
  const layout: SlotLayout = new Array<Tile | null>(2 * cols).fill(null)
  for (let i = 0; i < tiles.length && i < 2 * cols; i++) {
    layout[i] = tiles[i]!
  }
  return layout
}

/**
 * Reconcile a previous layout against a new set of tiles.
 *
 * Algorithm:
 * 1. Build a remaining-count map from `tiles` (handles duplicates by multiplicity).
 * 2. Scan prev slot by slot; for each non-null slot, attempt to "claim" one count
 *    of that tile from the map. If claim succeeds, keep the tile. If not (tile was
 *    removed), set slot to null.
 * 3. Any tiles in `tiles` that were not yet claimed (newly drawn) are placed into
 *    the first empty slots left-to-right.
 *
 * Length is preserved (= prev.length).
 *
 * `preferredSlotForNew`: when a tile was just drawn and the player dropped it on
 * a specific (empty) slot, the first newly-added tile is placed there instead of
 * the first empty slot — so drag-to-draw lands where the player aimed.
 */
export function reconcile(prev: SlotLayout, tiles: Tile[], preferredSlotForNew?: number | null): SlotLayout {
  // A POOL of the new tiles as DISTINCT object references (duplicates kept
  // distinct). We consume one matching instance per kept prev tile. The old
  // count-map collapsed value-equal duplicates onto ONE object, so two slots
  // could end up holding the SAME Tile object → the same flip-id → GSAP Flip
  // animating both copies as one. Keeping distinct objects fixes that.
  const pool = tiles.slice()

  const next: SlotLayout = new Array<Tile | null>(prev.length).fill(null)

  // Pass 1: keep existing tiles still present (claim one matching instance from
  // the pool; keep the PREV object so its flip-id stays stable across renders).
  for (let i = 0; i < prev.length; i++) {
    const t = prev[i]
    if (t == null) continue
    const idx = pool.findIndex((p) => tilesEqual(p, t))
    if (idx >= 0) {
      next[i] = t          // keep the prev object (stable identity)
      pool.splice(idx, 1)  // consume one matching instance
    } else {
      next[i] = null       // tile was removed
    }
  }

  // Pass 2: place the remaining (newly-added) tiles — genuine DISTINCT objects.
  const unclaimed: Tile[] = pool

  let ui = 0
  // Place the first newly-added tile at the player's chosen drop slot. If that
  // slot is occupied, INSERT there and shift neighbours (so a drawn tile lands
  // where the player dropped it, not in the first empty slot).
  if (
    preferredSlotForNew != null &&
    preferredSlotForNew >= 0 &&
    preferredSlotForNew < next.length &&
    ui < unclaimed.length
  ) {
    shiftInsert(next, preferredSlotForNew, unclaimed[ui]!)
    ui++
  }
  for (let i = 0; i < next.length && ui < unclaimed.length; i++) {
    if (next[i] === null) {
      next[i] = unclaimed[ui]!
      ui++
    }
  }

  return next
}

/** Insert `tile` at slot `to`, shifting the run of tiles at `to` toward the
 *  NEAREST empty slot to make room (never overwrites, never swaps). Mutates and
 *  returns `next`. `to` is assumed occupied; if empty, the caller places directly. */
function shiftInsert(next: SlotLayout, to: number, tile: Tile): void {
  if (next[to] === null) { next[to] = tile; return }
  // Find the nearest empty slot to `to`.
  let gap = -1
  let best = Infinity
  for (let i = 0; i < next.length; i++) {
    if (next[i] === null) {
      const d = Math.abs(i - to)
      if (d < best) { best = d; gap = i }
    }
  }
  if (gap === -1) { next[to] = tile; return } // no room (shouldn't happen)
  if (gap > to) {
    for (let i = gap; i > to; i--) next[i] = next[i - 1]! // shift the block right
  } else {
    for (let i = gap; i < to; i++) next[i] = next[i + 1]! // shift the block left
  }
  next[to] = tile
}

/**
 * Return a new layout with the tile at `from` moved to `to`.
 * - If from === to or from slot is empty, returns a copy unchanged.
 * - If `to` is empty, the tile moves there and `from` becomes null.
 * - If `to` is occupied: INSERT at `to` and push the occupant (and any contiguous
 *   tiles) one step AWAY from the drag origin — drag right ⇒ push right, drag left
 *   ⇒ push left — into the first gap in that direction. The origin slot stays a
 *   gap, so tiles never SWAP (dropping 7 onto 8 gives 7,8 — not 8,7). If the push
 *   direction is full to the edge, fall back to the freed origin gap so a tile is
 *   never lost (no out-of-space bug).
 */
export function moveTile(layout: SlotLayout, from: number, to: number): SlotLayout {
  const next = [...layout]
  if (from === to || next[from] === null) {
    return next
  }
  const tile = next[from]!
  next[from] = null // origin becomes a gap (preserved unless needed as fallback room)
  if (next[to] === null) {
    next[to] = tile // target empty → just place it
    return next
  }

  const dir = to > from ? 1 : -1 // push the occupant away from the drag origin
  // First gap strictly beyond `to` in the push direction (never `from`, which is
  // on the opposite side).
  let gap = -1
  for (let i = to + dir; i >= 0 && i < next.length; i += dir) {
    if (next[i] === null) { gap = i; break }
  }
  if (gap !== -1) {
    // Slide the block [to..gap-dir] one step toward `gap`, opening up `to`.
    for (let i = gap; i !== to; i -= dir) next[i] = next[i - dir] ?? null
  } else {
    // No room in the push direction → slide the block between `from` and `to`
    // toward the freed origin gap instead (only happens when the far edge is full).
    for (let i = from; i !== to; i += dir) next[i] = next[i + dir] ?? null
  }
  next[to] = tile
  return next
}

/**
 * Auto-arrange tiles using the engine's `arrange()`.
 * Melds are packed ROW BY ROW so a meld is never split across the top/bottom
 * boundary: as many whole melds as fit go on the top row (one empty slot between
 * them); a meld that doesn't fit the row's remaining space wraps WHOLE to the
 * bottom row. Leftovers follow after a gap (individual tiles may flow freely).
 * Returns a layout of length 2*cols.
 */
/**
 * Pack a list of melds (each kept whole within a row) + leftovers into a 2*cols
 * layout. A meld that doesn't fit the current row's remaining space wraps WHOLE
 * to the next row (never split across the top/bottom boundary); leftovers follow
 * after a gap and may flow freely across the boundary.
 */
function packIntoLayout(melds: Tile[][], leftovers: Tile[], cols: number): SlotLayout {
  const layout: SlotLayout = new Array<Tile | null>(2 * cols).fill(null)
  let row = 0
  let col = 0
  const place = (t: Tile) => {
    const idx = row * cols + col
    if (idx < 2 * cols) layout[idx] = t
    col++
  }

  for (const meld of melds) {
    const gap = col > 0 ? 1 : 0
    if (col + gap + meld.length > cols) {
      row++
      col = 0
      if (row > 1) break // only two rows; drop overflow (does not happen in practice)
    } else {
      col += gap
    }
    if (row > 1) break
    for (const t of meld) place(t)
  }

  if (melds.length > 0 && leftovers.length > 0 && col > 0 && col < cols) {
    col++ // gap before leftovers within the current row
  }
  for (const t of leftovers) {
    if (col >= cols) { row++; col = 0 }
    if (row > 1) break
    place(t)
  }

  return layout
}

// ─── Leftover ordering (per-potential clustering) ───────────────────────────
//
// The engine's arrange() returns leftovers in canonical sort order (colour then
// number). On the rack that scatters near-melds: two 11s of different colours (a
// potential same-number GROUP) end up far apart, while a 4 and an 11 of the same
// colour sit adjacent for no reason. orderLeftovers reorders the un-melded tail
// so tiles that could COMPLETE a meld together sit adjacent, and the most
// promising / highest-value clusters lead (101 favours high tiles). Pure display
// — it never changes WHICH tiles are melded, only the order of the leftovers.
// (Colour tie-break reuses the shared COLOR_ORDER defined further below.)

function effVal(t: Tile, okey: Tile): { n: number; c: TileColor } | null {
  if (t.kind === 'FALSE_JOKER') {
    return okey.number != null && okey.color != null ? { n: okey.number, c: okey.color } : null
  }
  if (t.number != null && t.color != null) return { n: t.number, c: t.color }
  return null
}

/** A real okey wild: a NUMBER tile whose number+colour equal the okey. */
function isOkeyWild(t: Tile, okey: Tile): boolean {
  return t.kind === 'NUMBER' && t.number === okey.number && t.color === okey.color
}

/** Circular run distance (13↔1 are adjacent when wrap is on). */
function numGap(a: number, b: number, wrap: boolean): number {
  const d = Math.abs(a - b)
  return wrap ? Math.min(d, 13 - d) : d
}

/**
 * Affinity = how strongly two leftover tiles hint at the SAME future meld:
 *   3  same number, different colour  → 2/3 of a GROUP (one colour away)
 *   3  same colour, consecutive       → 2/3 of a RUN (one tile away)
 *   1  same colour, one-gap (Δ2)      → a RUN needing the middle tile / a wild
 *   0  otherwise (only an incidental colour or number match — no real potential)
 */
function affinity(a: Tile, b: Tile, okey: Tile, wrap: boolean): number {
  const ea = effVal(a, okey)
  const eb = effVal(b, okey)
  if (!ea || !eb) return 0
  if (ea.n === eb.n && ea.c !== eb.c) return 3
  if (ea.c === eb.c) {
    const g = numGap(ea.n, eb.n, wrap)
    if (g === 1) return 3
    if (g === 2) return 1
  }
  return 0
}

/**
 * Order un-melded leftovers for the rack so potential-meld partners sit adjacent.
 *
 * 1. Real okey wilds lead (the most precious, most flexible tile).
 * 2. The rest are grouped into connected CLUSTERS under affinity>0 (union-find),
 *    so a near-run / near-group reads as one block. Within a cluster, tiles sort
 *    by (number, colour): runs read low→high and same-number partners sit together.
 * 3. Real clusters (size ≥ 2) lead, by descending total value (101 favours high
 *    tiles); lone "dead" tiles trail in descending value so the lowest, most-
 *    disposable tile lands rightmost — the natural discard.
 *
 * Object identity is preserved (tiles are re-ordered, never cloned), so the rack
 * reconcile/animation logic keeps working.
 */
export function orderLeftovers(leftovers: Tile[], okey: Tile, config: VariantConfig): Tile[] {
  if (leftovers.length <= 1) return [...leftovers]
  const wrap = config.runWrap13to1 === true

  const wilds = leftovers.filter((t) => isOkeyWild(t, okey))
  const rest = leftovers.filter((t) => !isOkeyWild(t, okey))

  // Union-find: link any pair of leftovers with affinity > 0.
  const parent = rest.map((_, i) => i)
  const find = (x: number): number => {
    let r = x
    while (parent[r] !== r) r = parent[r]!
    return r
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  for (let i = 0; i < rest.length; i++) {
    for (let j = i + 1; j < rest.length; j++) {
      if (affinity(rest[i]!, rest[j]!, okey, wrap) > 0) union(i, j)
    }
  }

  const valOf = (t: Tile) => effVal(t, okey)?.n ?? 0
  const sortKey = (t: Tile) => {
    const e = effVal(t, okey)
    return e ? e.n * 10 + (COLOR_ORDER[e.c] ?? 0) : 999
  }

  // Bucket indices into clusters and sort each cluster internally.
  const clusters = new Map<number, number[]>()
  for (let i = 0; i < rest.length; i++) {
    const r = find(i)
    const bucket = clusters.get(r)
    if (bucket) bucket.push(i)
    else clusters.set(r, [i])
  }
  const blocks = [...clusters.values()].map((idxs) => {
    const tiles = idxs.map((i) => rest[i]!).sort((a, b) => sortKey(a) - sortKey(b))
    return { tiles, total: tiles.reduce((s, t) => s + valOf(t), 0), size: tiles.length }
  })

  const multi = blocks.filter((b) => b.size >= 2).sort((a, b) => b.total - a.total || b.size - a.size)
  const singles = blocks.filter((b) => b.size === 1).sort((a, b) => b.total - a.total)

  return [...wilds, ...multi.flatMap((b) => b.tiles), ...singles.flatMap((b) => b.tiles)]
}

/**
 * Auto-arrange tiles into RUN/GROUP melds (the engine's `arrange()`), packed row
 * by row. In 101 the opening VALUE is maximized; in Klasik the melded count.
 */
export function autoArrange(tiles: Tile[], okey: Tile, config: VariantConfig, cols: number): SlotLayout {
  const result = config.requiresOpening
    ? arrange(tiles, okey, config, (melds) => openingValue(melds, okey))
    : arrange(tiles, okey, config)
  const orderedMelds = result.melds.map((m) => orderMeldForDisplay(m, okey))
  return packIntoLayout(orderedMelds, orderLeftovers(result.leftovers, okey, config), cols)
}

/**
 * Auto-arrange tiles by PAIRS (çift): group every identical pair together, then
 * the remaining (unpaired) tiles. For the çift route — "Çift Sırala".
 */
export function autoArrangePairs(tiles: Tile[], okey: Tile, config: VariantConfig, cols: number): SlotLayout {
  const pairs = findLayablePairs(tiles, okey, config) ?? []
  const pairsFlat = pairs.flat()
  const leftovers = tiles.filter((t) => !pairsFlat.includes(t)) // pairs hold original refs
  return packIntoLayout(pairs, orderLeftovers(leftovers, okey, config), cols)
}

/**
 * Return the non-null tiles from the layout in slot order.
 */
export function layoutToTiles(layout: SlotLayout): Tile[] {
  return layout.filter((s): s is Tile => s !== null)
}

/**
 * Parse the rack layout into the player's intended meld segments: maximal runs
 * of contiguous non-empty slots, in slot order. A segment is broken by ANY empty
 * slot AND by the row boundary (a meld never spans the back row into the front
 * row). This is the player's spatial meld declaration — the source of truth for
 * opening value and "can open", NOT the engine's auto-arrangement.
 */
export function parseMeldSegments(layout: SlotLayout): Tile[][] {
  const rowStart = Math.floor(layout.length / 2) // index where the front row begins
  const segments: Tile[][] = []
  let current: Tile[] = []
  const flush = () => {
    if (current.length > 0) { segments.push(current); current = [] }
  }
  for (let i = 0; i < layout.length; i++) {
    if (i === rowStart) flush() // row boundary always breaks a segment
    const t = layout[i]
    if (t == null) flush()
    else current.push(t)
  }
  flush()
  return segments
}

/**
 * For an already-ordered meld (output of orderMeldForDisplay), return the number
 * each tile REPRESENTS:
 * - FALSE_JOKER → always okey.number (its fixed concrete value; never a gap-derived number)
 * - real NUMBER tile matching okey (gap-filling wild) in a RUN → compute slot position
 *   from the first non-wild tile's number + index offset
 * - real NUMBER tile matching okey (gap-filling wild) in a GROUP → the group's shared number
 * - non-wild tile → its own `number`
 * - Returns null if indeterminate (e.g. all-wild meld)
 */
export function meldRepresentedValues(orderedMeld: Tile[], okey: Tile): (number | null)[] {
  // Resolve each tile to its concrete value for shape analysis:
  // - FALSE_JOKER → {kind:'NUMBER', number:okey.number, color:okey.color}
  // - real NUMBER tiles → unchanged
  const resolvedMeld = orderedMeld.map((t) => concreteTile(t, okey))

  // A "display wild" (gap-filler) is ONLY a real NUMBER tile matching okey.
  // FALSE_JOKERs are NOT display wilds — they are fixed concrete tiles.
  const isDisplayWild = orderedMeld.map((t) => isWildTile(t, okey))

  // Non-wild tiles: real tiles (including FALSE_JOKERs with their concrete value)
  const reals = resolvedMeld.filter((_, i) => !isDisplayWild[i])

  if (reals.length === 0) {
    // All gap-filling wilds — cannot determine represented value
    return orderedMeld.map(() => null)
  }

  const firstColor = reals[0]!.color
  const sameColor = reals.every((t) => t.color === firstColor)
  const firstNum = reals[0]!.number
  const sameNumber = reals.every((t) => t.number === firstNum)

  if (sameColor && !sameNumber) {
    // RUN: find first non-wild tile to anchor position
    // Walk the resolved meld; each position j represents firstRealNumber - firstRealIndex + j
    const firstRealIndex = isDisplayWild.findIndex((w) => !w)
    const firstRealNumber = resolvedMeld[firstRealIndex]!.number ?? 1
    return resolvedMeld.map((t, j) => {
      if (!isDisplayWild[j]) {
        // FALSE_JOKER or real tile: return its concrete number
        return t.number ?? null
      }
      // Gap-filling wild: slot number derived from run position, wrapped into 1..13
      // so a wild that fills the 13→1 wrap slot shows its real face value (e.g. =1).
      const raw = firstRealNumber - firstRealIndex + j
      return ((raw - 1) % 13 + 13) % 13 + 1
    })
  }

  // GROUP (same number) or fallback: every tile represents the group's number
  const groupNumber = firstNum ?? null
  return resolvedMeld.map((t, j) => {
    if (!isDisplayWild[j]) return t.number ?? null
    return groupNumber
  })
}

/**
 * Companion to meldRepresentedValues: the COLOUR each gap-filling wild (real okey)
 * stands in for, so a table okey can be shown blank with a coloured "what it is"
 * badge. Non-wild positions return their own colour.
 * - RUN (one colour, many numbers): the run's colour.
 * - PAIR (2 tiles, same number): the partner tile's colour.
 * - GROUP (same number, 3-4 tiles): the single missing colour — or null when more
 *   than one colour is still missing (the okey's colour isn't pinned yet).
 */
export function meldRepresentedColors(orderedMeld: Tile[], okey: Tile): (TileColor | null)[] {
  const resolved = orderedMeld.map((t) => concreteTile(t, okey))
  const isWild = orderedMeld.map((t) => isWildTile(t, okey))
  const reals = resolved.filter((_, i) => !isWild[i])
  if (reals.length === 0) return orderedMeld.map(() => null)

  const colors = new Set(reals.map((r) => r.color))
  const numbers = new Set(reals.map((r) => r.number))
  const ownColor = (i: number): TileColor | null => resolved[i]!.color ?? null

  // RUN: single colour, multiple numbers → every wild is that colour.
  if (colors.size === 1 && numbers.size > 1) {
    const runColor = reals[0]!.color ?? null
    return orderedMeld.map((_, i) => (isWild[i] ? runColor : ownColor(i)))
  }

  // PAIR (2 tiles, same value): the wild matches its partner's colour.
  if (orderedMeld.length === 2) {
    const partner = reals[0]!.color ?? null
    return orderedMeld.map((_, i) => (isWild[i] ? partner : ownColor(i)))
  }

  // GROUP (same number): the wild fills a missing colour; unique → that colour.
  const ALL: TileColor[] = ['RED', 'BLACK', 'BLUE', 'YELLOW']
  const missing = ALL.filter((c) => !colors.has(c))
  const wildColor = missing.length === 1 ? missing[0]! : null
  return orderedMeld.map((_, i) => (isWild[i] ? wildColor : ownColor(i)))
}

/**
 * A tile is wild only if it is a real NUMBER tile whose number+color matches okey.
 * FALSE_JOKER is NOT wild — it is a plain tile fixed to okey's value.
 * Used for display ordering and represented-value computation.
 */
function isWildTile(t: Tile, okey: Tile): boolean {
  return t.kind === 'NUMBER' && tilesEqual(t, okey)
}

/**
 * Resolve a FALSE_JOKER to its concrete tile (okey's number+color as a NUMBER tile).
 * Real NUMBER tiles are returned unchanged.
 */
function concreteTile(t: Tile, okey: Tile): Tile {
  if (t.kind === 'FALSE_JOKER') {
    return { kind: 'NUMBER', number: okey.number, color: okey.color }
  }
  return t
}

const COLOR_ORDER: Record<string, number> = { RED: 0, YELLOW: 1, BLUE: 2, BLACK: 3 }

/**
 * Order a meld's tiles for READABLE display:
 * - RUN (real tiles share a colour, differ in number): tiles ascending by number,
 *   with gap-filling wilds placed in their gap positions (so "7 ♣ 9 10" reads as 7-8-9-10);
 *   any extra gap-filling wilds extend the run at the end.
 * - GROUP (real tiles share a number): real tiles by a fixed colour order, wilds last.
 * The engine's `arrange()` appends wilds at the end of a meld; this fixes that for display.
 * (Wrap-around 12-13-1 runs are left in best-effort order — rare, Klasik-only.)
 *
 * FALSE_JOKER tiles are treated as CONCRETE tiles with a fixed value equal to okey's
 * number+color. They are placed at their fixed value position in the run (like any
 * normal tile of that value). Only real NUMBER tiles matching okey are gap-filling wilds.
 * The original tile objects are always preserved in the output.
 */
export function orderMeldForDisplay(meld: Tile[], okey: Tile): Tile[] {
  // Pair each original tile with its resolved (concrete) tile for ordering logic.
  // FALSE_JOKERs resolve to okey's NUMBER tile but are NOT display wilds —
  // they are fixed concrete tiles placed at their value position.
  // Only real NUMBER tiles matching okey (checked on orig) are gap-filling wilds.
  const pairs = meld.map((t) => ({ orig: t, resolved: concreteTile(t, okey) }))

  // isWildTile checks orig: FALSE_JOKER (kind !== 'NUMBER') → false, real okey tile → true
  const wildPairs = pairs.filter((p) => isWildTile(p.orig, okey))
  const realPairs = pairs.filter((p) => !isWildTile(p.orig, okey))

  if (realPairs.length === 0) return [...meld]

  const firstColor = realPairs[0]!.resolved.color
  const sameColor = realPairs.every((p) => p.resolved.color === firstColor)
  const firstNum = realPairs[0]!.resolved.number
  const sameNumber = realPairs.every((p) => p.resolved.number === firstNum)

  if (sameColor && !sameNumber) {
    // RUN: place reals at their slot, wilds fill the gaps in run order.
    const byNum = new Map<number, Tile>()
    for (const p of realPairs) if (p.resolved.number != null) byNum.set(p.resolved.number, p.orig)
    const nums = [...byNum.keys()]
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    const len = meld.length

    // Determine the run's starting slot. Linear runs anchor at the min real (wilds
    // extend upward). When the reals can't fit a linear window of `len` slots
    // (max-min+1 > len), the run must wrap 13→1: find the start whose `len`
    // consecutive slots (wrapping) cover every real number (e.g. 11,12,13,1).
    let startNum = min
    if (max - min + 1 > len) {
      for (let s = 1; s <= 13; s++) {
        const window = new Set<number>()
        for (let k = 0; k < len; k++) window.add(((s - 1 + k) % 13) + 1)
        if (window.size !== len) continue
        if (nums.every((n) => window.has(n))) { startNum = s; break }
      }
    } else if (startNum + len - 1 > 13) {
      // No wrap needed (reals fit a non-wrapping window), but extending UP from
      // `min` would pass 13 — e.g. [12,13] + wild → 12,13,14. Anchor the window so
      // it ENDS at 13, placing the wild in the low slot (→ 11,12,13) instead of
      // wrapping it to 1 (which is invalid in 101 and undervalues the run).
      startNum = 13 - len + 1
    }

    const out: Tile[] = []
    let wi = 0
    for (let k = 0; k < len; k++) {
      const face = ((startNum - 1 + k) % 13) + 1 // wrap into 1..13
      const real = byNum.get(face)
      if (real) out.push(real)
      else if (wi < wildPairs.length) out.push(wildPairs[wi++]!.orig)
    }
    while (wi < wildPairs.length) out.push(wildPairs[wi++]!.orig) // extra wilds extend the run
    return out
  }

  // GROUP (same number) or fallback: reals by colour order, wilds last
  const sortedReals = [...realPairs].sort(
    (a, b) => (COLOR_ORDER[a.resolved.color ?? ''] ?? 9) - (COLOR_ORDER[b.resolved.color ?? ''] ?? 9),
  )
  return [...sortedReals.map((p) => p.orig), ...wildPairs.map((p) => p.orig)]
}
