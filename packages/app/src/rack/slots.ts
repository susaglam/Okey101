import { tilesEqual, arrange, openingValue, findLayablePairs } from '@cs-okey/engine'
import type { Tile } from '@cs-okey/engine'
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
  // Build a count map keyed by tile identity
  const remaining = new Map<Tile, number>()
  for (const t of tiles) {
    let found = false
    for (const [key] of remaining) {
      if (tilesEqual(key, t)) {
        remaining.set(key, (remaining.get(key) ?? 0) + 1)
        found = true
        break
      }
    }
    if (!found) {
      remaining.set(t, 1)
    }
  }

  const next: SlotLayout = new Array<Tile | null>(prev.length).fill(null)

  // Pass 1: keep existing tiles that are still in the multiset
  for (let i = 0; i < prev.length; i++) {
    const t = prev[i]
    if (t == null) continue
    // Try to claim one from remaining
    let claimed = false
    for (const [key, count] of remaining) {
      if (tilesEqual(key, t)) {
        next[i] = t
        if (count <= 1) {
          remaining.delete(key)
        } else {
          remaining.set(key, count - 1)
        }
        claimed = true
        break
      }
    }
    if (!claimed) {
      next[i] = null // tile was removed
    }
  }

  // Pass 2: place unclaimed tiles (newly added) into first empty slots
  const unclaimed: Tile[] = []
  for (const [key, count] of remaining) {
    for (let c = 0; c < count; c++) {
      unclaimed.push(key)
    }
  }

  let ui = 0
  // Place the first newly-added tile at the player's chosen drop slot, if empty.
  if (
    preferredSlotForNew != null &&
    preferredSlotForNew >= 0 &&
    preferredSlotForNew < next.length &&
    next[preferredSlotForNew] === null &&
    ui < unclaimed.length
  ) {
    next[preferredSlotForNew] = unclaimed[ui]!
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

/**
 * Return a new layout with the tile at `from` moved to `to`.
 * - If from === to or from slot is empty, returns a copy unchanged.
 * - If to slot is occupied, the two tiles are swapped.
 * - If to slot is empty, tile moves and from becomes null.
 */
export function moveTile(layout: SlotLayout, from: number, to: number): SlotLayout {
  const next = [...layout]
  if (from === to || next[from] === null) {
    return next
  }
  const temp = next[to]!
  next[to] = next[from]!
  next[from] = temp !== undefined ? temp : null
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

/**
 * Auto-arrange tiles into RUN/GROUP melds (the engine's `arrange()`), packed row
 * by row. In 101 the opening VALUE is maximized; in Klasik the melded count.
 */
export function autoArrange(tiles: Tile[], okey: Tile, config: VariantConfig, cols: number): SlotLayout {
  const result = config.requiresOpening
    ? arrange(tiles, okey, config, (melds) => openingValue(melds, okey))
    : arrange(tiles, okey, config)
  const orderedMelds = result.melds.map((m) => orderMeldForDisplay(m, okey))
  return packIntoLayout(orderedMelds, result.leftovers, cols)
}

/**
 * Auto-arrange tiles by PAIRS (çift): group every identical pair together, then
 * the remaining (unpaired) tiles. For the çift route — "Çift Sırala".
 */
export function autoArrangePairs(tiles: Tile[], okey: Tile, config: VariantConfig, cols: number): SlotLayout {
  const pairs = findLayablePairs(tiles, okey, config) ?? []
  const pairsFlat = pairs.flat()
  const leftovers = tiles.filter((t) => !pairsFlat.includes(t)) // pairs hold original refs
  return packIntoLayout(pairs, leftovers, cols)
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
