import { describe, it, expect } from 'vitest'
import { tileFromString, tilesEqual, KLASIK, isValidMeldSet } from '@cs-okey/engine'
import type { Tile } from '@cs-okey/engine'
import {
  initLayout,
  reconcile,
  moveTile,
  autoArrange,
  layoutToTiles,
  parseMeldSegments,
} from '../src/rack/slots'

// Helper: build an array of tiles from shorthand strings
function h(...s: string[]): Tile[] {
  return s.map(tileFromString)
}

const okey = tileFromString('7M')
const cols = 14

// Multiset equality: same tiles regardless of order
function multisetEqual(a: Tile[], b: Tile[]): boolean {
  if (a.length !== b.length) return false
  const used = new Array<boolean>(b.length).fill(false)
  for (const ta of a) {
    const idx = b.findIndex((tb, i) => !used[i] && tilesEqual(ta, tb))
    if (idx === -1) return false
    used[idx] = true
  }
  return true
}

describe('initLayout', () => {
  it('places N tiles in first N slots and leaves rest null', () => {
    const tiles = h('1R', '2R', '3R', '4R', '5R')
    const layout = initLayout(tiles, cols)
    expect(layout.length).toBe(2 * cols)
    // First 5 slots are the tiles
    for (let i = 0; i < 5; i++) {
      expect(layout[i]).not.toBeNull()
      expect(tilesEqual(layout[i]!, tiles[i]!)).toBe(true)
    }
    // Slot 5 is null
    expect(layout[5]).toBeNull()
    // All remaining slots null
    for (let i = 5; i < 2 * cols; i++) {
      expect(layout[i]).toBeNull()
    }
  })

  it('handles zero tiles', () => {
    const layout = initLayout([], cols)
    expect(layout.length).toBe(2 * cols)
    expect(layout.every((s) => s === null)).toBe(true)
  })

  it('fills back row then front row', () => {
    // 15 tiles should wrap into second row
    const tiles = h('1R','2R','3R','4R','5R','6R','7R','8R','9R','10R','11R','12R','13R','1K','2K')
    const layout = initLayout(tiles, cols)
    expect(layout.length).toBe(2 * cols)
    // Slots 0..13 (back row) are the first 14 tiles
    for (let i = 0; i < 14; i++) {
      expect(layout[i]).not.toBeNull()
      expect(tilesEqual(layout[i]!, tiles[i]!)).toBe(true)
    }
    // Slot 14 (first of front row) is the 15th tile
    expect(layout[14]).not.toBeNull()
    expect(tilesEqual(layout[14]!, tiles[14]!)).toBe(true)
  })
})

describe('reconcile', () => {
  it('keeps tiles in their existing slots after a draw (new tile goes to first empty slot)', () => {
    const initial = h('1R', '2R', '3R', '4R')
    let layout = initLayout(initial, cols)
    // Move tile at slot 0 to slot 20
    layout = moveTile(layout, 0, 20)
    // Now reconcile with same 4 tiles + 1 new tile
    const newTiles = [...initial, tileFromString('5R')]
    const next = reconcile(layout, newTiles)
    expect(next.length).toBe(2 * cols)
    // The tile that was moved to slot 20 should still be at slot 20
    expect(next[20]).not.toBeNull()
    expect(tilesEqual(next[20]!, tileFromString('1R'))).toBe(true)
    // Tiles at slots 1,2,3 should still be there
    expect(next[1]).not.toBeNull()
    expect(tilesEqual(next[1]!, tileFromString('2R'))).toBe(true)
    expect(next[2]).not.toBeNull()
    expect(tilesEqual(next[2]!, tileFromString('3R'))).toBe(true)
    expect(next[3]).not.toBeNull()
    expect(tilesEqual(next[3]!, tileFromString('4R'))).toBe(true)
    // The new tile '5R' should be in the first empty slot (slot 0 is now empty from the move)
    expect(next[0]).not.toBeNull()
    expect(tilesEqual(next[0]!, tileFromString('5R'))).toBe(true)
    // All 5 tiles present
    const presentTiles = next.filter((s) => s !== null) as Tile[]
    expect(multisetEqual(presentTiles, newTiles)).toBe(true)
  })

  it('frees the slot of a removed tile (discard)', () => {
    const initial = h('1R', '2R', '3R', '4R')
    const layout = initLayout(initial, cols)
    // Discard tile at slot 1 (2R)
    const afterDiscard = reconcile(layout, h('1R', '3R', '4R'))
    expect(afterDiscard.length).toBe(2 * cols)
    // Slot 1 should be null
    expect(afterDiscard[1]).toBeNull()
    // Others unchanged
    expect(afterDiscard[0]).not.toBeNull()
    expect(tilesEqual(afterDiscard[0]!, tileFromString('1R'))).toBe(true)
    expect(afterDiscard[2]).not.toBeNull()
    expect(tilesEqual(afterDiscard[2]!, tileFromString('3R'))).toBe(true)
    expect(afterDiscard[3]).not.toBeNull()
    expect(tilesEqual(afterDiscard[3]!, tileFromString('4R'))).toBe(true)
  })

  it('handles duplicate tiles by multiplicity', () => {
    // Two identical tiles: 1R x2
    const tiles = h('1R', '1R', '2R')
    const layout = initLayout(tiles, cols)
    // Remove one '1R' — the second slot '1R' should become null
    const after = reconcile(layout, h('1R', '2R'))
    expect(after.length).toBe(2 * cols)
    const nonNull = after.filter((s) => s !== null) as Tile[]
    expect(nonNull.length).toBe(2)
    // Check '1R' appears exactly once and '2R' exactly once
    expect(multisetEqual(nonNull, h('1R', '2R'))).toBe(true)
  })

  it('preserves layout length', () => {
    const initial = h('1R', '2R', '3R')
    const layout = initLayout(initial, cols)
    const next = reconcile(layout, h('1R', '2R', '3R', '4R'))
    expect(next.length).toBe(layout.length)
  })

  it('places a newly-drawn tile at the preferred slot (drag-to-draw lands where aimed)', () => {
    const initial = h('1R', '2R', '3R')
    const layout = initLayout(initial, cols) // slots 0,1,2 filled
    // Draw a 5R and drop it on slot 9 specifically
    const next = reconcile(layout, h('1R', '2R', '3R', '5R'), 9)
    expect(next[9]).not.toBeNull()
    expect(tilesEqual(next[9]!, tileFromString('5R'))).toBe(true)
    // The first empty slot (3) must stay empty — the tile went to the chosen slot
    expect(next[3]).toBeNull()
  })

  it('falls back to first empty slot when the preferred slot is occupied', () => {
    const initial = h('1R', '2R', '3R')
    const layout = initLayout(initial, cols)
    // Prefer slot 1 (occupied by 2R) → must fall back to first empty (slot 3)
    const next = reconcile(layout, h('1R', '2R', '3R', '5R'), 1)
    expect(tilesEqual(next[1]!, tileFromString('2R'))).toBe(true)
    expect(tilesEqual(next[3]!, tileFromString('5R'))).toBe(true)
  })

  it('exact-discard: emptying the dragged duplicate slot keeps the OTHER copy in its meld slot', () => {
    // Two red-8s: one inside a meld (slot 0), one loose (slot 5). The player drags
    // the LOOSE one to discard. We optimistically null slot 5, THEN reconcile with
    // the rack that has one 8R removed. The meld 8R at slot 0 must stay put.
    const layout = initLayout([], cols)
    layout[0] = tileFromString('8R') // meld copy
    layout[1] = tileFromString('9R')
    layout[2] = tileFromString('10R')
    layout[5] = tileFromString('8R') // loose copy (the one being discarded)
    // Optimistic: player dragged slot 5 → null it
    const optimistic = layout.map((t, i) => (i === 5 ? null : t))
    // Engine rack after discarding one 8R
    const after = reconcile(optimistic, h('8R', '9R', '10R'))
    // The meld copy at slot 0 stays; slot 5 stays empty; meld intact
    expect(tilesEqual(after[0]!, tileFromString('8R'))).toBe(true)
    expect(tilesEqual(after[1]!, tileFromString('9R'))).toBe(true)
    expect(tilesEqual(after[2]!, tileFromString('10R'))).toBe(true)
    expect(after[5]).toBeNull()
  })
})

describe('moveTile', () => {
  it('moves a tile to an empty slot', () => {
    const tiles = h('1R', '2R', '3R')
    const layout = initLayout(tiles, cols)
    const moved = moveTile(layout, 0, 10)
    expect(moved[0]).toBeNull()
    expect(moved[10]).not.toBeNull()
    expect(tilesEqual(moved[10]!, tileFromString('1R'))).toBe(true)
    // Others unchanged
    expect(tilesEqual(moved[1]!, tileFromString('2R'))).toBe(true)
    expect(tilesEqual(moved[2]!, tileFromString('3R'))).toBe(true)
  })

  it('swaps when target is occupied', () => {
    const tiles = h('1R', '2R', '3R')
    const layout = initLayout(tiles, cols)
    const swapped = moveTile(layout, 0, 2)
    // slot 0 should now have '3R', slot 2 should have '1R'
    expect(tilesEqual(swapped[0]!, tileFromString('3R'))).toBe(true)
    expect(tilesEqual(swapped[2]!, tileFromString('1R'))).toBe(true)
    // slot 1 unchanged
    expect(tilesEqual(swapped[1]!, tileFromString('2R'))).toBe(true)
  })

  it('returns a copy unchanged when from===to', () => {
    const tiles = h('1R', '2R')
    const layout = initLayout(tiles, cols)
    const same = moveTile(layout, 0, 0)
    expect(same).not.toBe(layout)
    expect(same[0]).not.toBeNull()
    expect(tilesEqual(same[0]!, tileFromString('1R'))).toBe(true)
  })

  it('returns a copy unchanged when from slot is empty', () => {
    const tiles = h('1R', '2R')
    const layout = initLayout(tiles, cols)
    // slot 5 is empty
    const same = moveTile(layout, 5, 10)
    expect(same).not.toBe(layout)
    expect(same[5]).toBeNull()
    expect(same[10]).toBeNull()
  })

  it('does not mutate original layout', () => {
    const tiles = h('1R', '2R', '3R')
    const layout = initLayout(tiles, cols)
    const orig0 = layout[0]
    moveTile(layout, 0, 10)
    expect(layout[0]).toBe(orig0)
  })
})

describe('autoArrange', () => {
  it('places all tiles in layout', () => {
    // A rack with a clear run meld + leftover
    const tiles = h('1R', '2R', '3R', '5M', '7M') // 1R-2R-3R is a run; 5M, 7M are leftovers
    const layout = autoArrange(tiles, okey, KLASIK, cols)
    expect(layout.length).toBe(2 * cols)
    const present = layout.filter((s) => s !== null) as Tile[]
    expect(multisetEqual(present, tiles)).toBe(true)
  })

  it('produces at least one null gap between two distinct melds', () => {
    // Two clear melds: run 1R-2R-3R and group 5R-5M-5K
    const tiles = h('1R', '2R', '3R', '5R', '5M', '5K')
    const layout = autoArrange(tiles, okey, KLASIK, cols)
    const present = layout.filter((s) => s !== null) as Tile[]
    expect(multisetEqual(present, tiles)).toBe(true)

    // Find first meld block (contiguous non-null) and check null follows
    // Since autoArrange inserts ONE empty slot between melds, the 4th position
    // (index 3) must be null when two 3-tile melds are laid out.
    // Look for at least one null that separates two groups of non-null slots
    let foundGap = false
    let i = 0
    while (i < layout.length) {
      // skip nulls
      while (i < layout.length && layout[i] === null) i++
      if (i >= layout.length) break
      // consume a non-null run
      while (i < layout.length && layout[i] !== null) i++
      if (i >= layout.length) break
      // check if there's another non-null block later
      let j = i
      while (j < layout.length && layout[j] === null) j++
      if (j < layout.length && layout[j] !== null) {
        // There's a gap between two non-null blocks
        foundGap = true
        break
      }
    }
    expect(foundGap).toBe(true)
  })

  it('preserves all tiles as multiset', () => {
    const tiles = h('4K', '5K', '6K', '4R', '4M', '4S', '1R', '13M')
    const layout = autoArrange(tiles, okey, KLASIK, cols)
    const present = layout.filter((s) => s !== null) as Tile[]
    expect(multisetEqual(present, tiles)).toBe(true)
  })

  it('packs each meld wholly within a row — no meld split across the row boundary', () => {
    // Two 3-runs can't both fit a 4-wide row → the second must wrap WHOLE to the
    // bottom row. A split would leave an invalid 1- or 2-tile fragment.
    const tiles = h('1R', '2R', '3R', '1K', '2K', '3K')
    const layout = autoArrange(tiles, okey, KLASIK, 4)
    const segs = parseMeldSegments(layout)
    expect(segs.length).toBe(2)
    expect(segs.every((s) => isValidMeldSet([s], okey, KLASIK))).toBe(true)
  })
})

describe('layoutToTiles', () => {
  it('returns non-null tiles in slot order', () => {
    const tiles = h('1R', '2R', '3R')
    const layout = initLayout(tiles, cols)
    const result = layoutToTiles(layout)
    expect(result.length).toBe(3)
    expect(tilesEqual(result[0]!, tileFromString('1R'))).toBe(true)
    expect(tilesEqual(result[1]!, tileFromString('2R'))).toBe(true)
    expect(tilesEqual(result[2]!, tileFromString('3R'))).toBe(true)
  })

  it('round-trips through initLayout then layoutToTiles', () => {
    const tiles = h('1R', '2R', '3R', '4R', '5R')
    const layout = initLayout(tiles, cols)
    const result = layoutToTiles(layout)
    expect(result.length).toBe(tiles.length)
    for (let i = 0; i < tiles.length; i++) {
      expect(tilesEqual(result[i]!, tiles[i]!)).toBe(true)
    }
  })

  it('returns empty array for empty layout', () => {
    const layout = initLayout([], cols)
    expect(layoutToTiles(layout)).toEqual([])
  })

  it('preserves order after moveTile', () => {
    const tiles = h('1R', '2R', '3R', '4R', '5R')
    const layout = initLayout(tiles, cols)
    const moved = moveTile(layout, 1, 10) // move 2R to slot 10
    const result = layoutToTiles(moved)
    // Result should be: 1R, 3R, 4R, 5R, ..., 2R (slot 10 is after slots 2,3,4)
    expect(result.length).toBe(5)
    expect(tilesEqual(result[0]!, tileFromString('1R'))).toBe(true)
    expect(tilesEqual(result[result.length - 1]!, tileFromString('2R'))).toBe(true)
  })
})
