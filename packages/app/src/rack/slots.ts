import { tilesEqual, arrange } from '@cs-okey/engine'
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
 * Melds are laid out contiguously with ONE empty slot between consecutive melds,
 * then leftovers follow (with a gap if any melds preceded them).
 * Flows left-to-right, wrapping from back row to front row.
 * Returns a layout of length 2*cols.
 */
export function autoArrange(tiles: Tile[], okey: Tile, config: VariantConfig, cols: number): SlotLayout {
  const result = arrange(tiles, okey, config)
  const layout: SlotLayout = new Array<Tile | null>(2 * cols).fill(null)

  let pos = 0

  for (let mi = 0; mi < result.melds.length; mi++) {
    const meld = result.melds[mi]!
    // Add gap before this meld if not first and we're not at position 0
    if (mi > 0 && pos < 2 * cols) {
      pos++ // ONE empty slot between consecutive melds
    }
    for (const tile of orderMeldForDisplay(meld, okey)) {
      if (pos < 2 * cols) {
        layout[pos++] = tile
      }
    }
  }

  // Add leftovers: with a gap if there were any melds
  if (result.melds.length > 0 && result.leftovers.length > 0 && pos < 2 * cols) {
    pos++ // gap between last meld and leftovers
  }

  for (const tile of result.leftovers) {
    if (pos < 2 * cols) {
      layout[pos++] = tile
    }
  }

  return layout
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
      // Gap-filling wild: slot number derived from run position
      return firstRealNumber - firstRealIndex + j
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
    // RUN: place reals at their number, wilds fill the gaps ascending
    const sorted = [...realPairs].sort((a, b) => (a.resolved.number ?? 0) - (b.resolved.number ?? 0))
    const byNum = new Map<number, Tile>()
    for (const p of sorted) if (p.resolved.number != null) byNum.set(p.resolved.number, p.orig)
    const min = sorted[0]!.resolved.number ?? 1
    const max = sorted[sorted.length - 1]!.resolved.number ?? min
    const out: Tile[] = []
    let wi = 0
    for (let n = min; n <= max; n++) {
      const real = byNum.get(n)
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
