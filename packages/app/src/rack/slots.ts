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
 */
export function reconcile(prev: SlotLayout, tiles: Tile[]): SlotLayout {
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
    if (t === null) continue
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

function isWildTile(t: Tile, okey: Tile): boolean {
  return t.kind === 'FALSE_JOKER' || tilesEqual(t, okey)
}

const COLOR_ORDER: Record<string, number> = { RED: 0, YELLOW: 1, BLUE: 2, BLACK: 3 }

/**
 * Order a meld's tiles for READABLE display:
 * - RUN (real tiles share a colour, differ in number): tiles ascending by number,
 *   with wild tiles placed in their gap positions (so "7 ♣ 9 10" reads as 7-8-9-10);
 *   any extra wilds extend the run at the end.
 * - GROUP (real tiles share a number): real tiles by a fixed colour order, wilds last.
 * The engine's `arrange()` appends wilds at the end of a meld; this fixes that for display.
 * (Wrap-around 12-13-1 runs are left in best-effort order — rare, Klasik-only.)
 */
export function orderMeldForDisplay(meld: Tile[], okey: Tile): Tile[] {
  const wilds = meld.filter((t) => isWildTile(t, okey))
  const reals = meld.filter((t) => !isWildTile(t, okey))
  if (reals.length === 0) return [...meld]

  const firstColor = reals[0]!.color
  const sameColor = reals.every((t) => t.color === firstColor)
  const firstNum = reals[0]!.number
  const sameNumber = reals.every((t) => t.number === firstNum)

  if (sameColor && !sameNumber) {
    // RUN: place reals at their number, wilds fill the gaps ascending
    const sorted = [...reals].sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
    const byNum = new Map<number, Tile>()
    for (const t of sorted) if (t.number != null) byNum.set(t.number, t)
    const min = sorted[0]!.number ?? 1
    const max = sorted[sorted.length - 1]!.number ?? min
    const out: Tile[] = []
    let wi = 0
    for (let n = min; n <= max; n++) {
      const real = byNum.get(n)
      if (real) out.push(real)
      else if (wi < wilds.length) out.push(wilds[wi++]!)
    }
    while (wi < wilds.length) out.push(wilds[wi++]!) // extra wilds extend the run
    return out
  }

  // GROUP (same number) or fallback: reals by colour order, wilds last
  const sorted = [...reals].sort(
    (a, b) => (COLOR_ORDER[a.color ?? ''] ?? 9) - (COLOR_ORDER[b.color ?? ''] ?? 9),
  )
  return [...sorted, ...wilds]
}
