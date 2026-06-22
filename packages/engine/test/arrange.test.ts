import { describe, it, expect } from 'vitest'
import { arrange, suggestDiscard } from '../src/arrange'
import { isWorkableDiscard } from '../src/reduce'
import { KLASIK, KLASIK_101 } from '../src/config'
import { openingValue } from '../src/open'
import { tileFromString, tileToString } from '../src/tile'
import type { Tile } from '../src/tile'
const h = (...s: string[]) => s.map(tileFromString)
const OKEY = tileFromString('7M')
/** Build the işlek predicate suggestDiscard expects (mirrors the real call site). */
const workable = (tableMelds: { owner: number; kind: 'run' | 'group' | 'pair'; tiles: Tile[] }[], okey: Tile) =>
  (t: Tile) => isWorkableDiscard(t, tableMelds, okey, KLASIK_101)

describe('arrange — value-maximizing objective (101 Sırala)', () => {
  it('places the wild in the highest-value slot when given a valueFn', () => {
    const okey = tileFromString('1M') // wild = 1M
    const rack = h('10R', '11R', '12R', '5R', '5K', '5S', '1M')
    // Value mode: wild extends the high run to 13 → {10,11,12,13}=46 + {5,5,5}=15 = 61
    const valued = arrange(rack, okey, KLASIK_101, (m) => openingValue(m, okey))
    expect(openingValue(valued.melds, okey)).toBe(61)
  })
})

describe('suggestDiscard — avoids işlek tiles (usable on a table meld)', () => {
  // Tiles below have NO rack partners, so the OLD suggestDiscard just returns the
  // first (colour-sorted: BLACK<BLUE<RED<YELLOW). The işlek tile is BLACK so it
  // sorts first → the old code would throw it; the new code must skip it.
  it('does not suggest a tile that extends a table run when a dead tile exists', () => {
    const okey = tileFromString('1S') // wild not in the rack/melds below
    const tableMelds = [{ owner: 1, kind: 'run' as const, tiles: h('4K', '5K', '6K') }]
    // 7K extends the black run on the table (işlek). 9M / 13S fit nothing.
    const tile = suggestDiscard(h('7K', '9M', '13S'), okey, KLASIK_101, workable(tableMelds, okey))
    expect(tileToString(tile)).not.toBe('7K')
  })

  it('does not suggest a tile that can swap an okey out of a table pair', () => {
    const okey = tileFromString('12R')
    // Table pair [13⚫ + okey]: a real 13⚫ could reclaim the okey → 13K is işlek.
    const tableMelds = [{ owner: 1, kind: 'pair' as const, tiles: [tileFromString('13K'), tileFromString('12R')] }]
    const tile = suggestDiscard(h('13K', '9M', '2S'), okey, KLASIK_101, workable(tableMelds, okey))
    expect(tileToString(tile)).not.toBe('13K')
  })

  it('still works (no crash) with no işlek predicate passed', () => {
    const okey = tileFromString('1S')
    expect(suggestDiscard(h('7K', '9M', '13S'), okey, KLASIK_101)).toBeDefined()
  })
})

describe('arrange — 13→1 wrap runs (Klasik)', () => {
  const W = tileFromString('8K') // a wild not present in the racks below

  it('does NOT form an illegal run that continues past the 1 (13,1,2,3)', () => {
    // The only LEGAL run here is [1,2,3]; 13R must stay a leftover — never melded
    // into a 13,1,2,3 "run". (Auto Seri Diz bug, PO 2026-06-21.)
    const a = arrange(h('13R', '1R', '2R', '3R'), W, KLASIK)
    expect(a.melds.some((m) => m.some((t) => t.number === 13))).toBe(false)
    expect(a.leftovers.map(tileToString)).toContain('13R')
    // [1,2,3] still melds.
    expect(a.meldedCount).toBe(3)
  })

  it('still forms a LEGAL …,13,1 wrap run (1 as the top)', () => {
    const a = arrange(h('11R', '12R', '13R', '1R'), W, KLASIK)
    expect(a.meldedCount).toBe(4) // 11,12,13,1 is a valid wrap run
  })
})

describe('arrange', () => {
  it('groups three obvious melds and reports leftovers', () => {
    const rack = h('1R','2R','3R','4K','5K','6K','9S','9R','9M','8M','2S') // 3 melds (9 tiles) + 8M,2S leftover
    const a = arrange(rack, OKEY, KLASIK)
    expect(a.meldedCount).toBe(9)
    expect(a.melds.length).toBe(3)
    expect(a.leftovers.map(tileToString).sort()).toEqual(['2S','8M'])
  })
  it('uses a real okey tile (wild) inside a meld to maximize melded count', () => {
    // 7M is the okey tile and is wild — it fills the gap in 1R-(7M wild=2R)-3R run.
    const rack = h('1R','7M','3R','9S','9R') // 1R-(7M wild)-3R run(3) + 9S,9R leftover
    const a = arrange(rack, OKEY, KLASIK)
    expect(a.meldedCount).toBe(3)
    expect(a.melds[0]!.length).toBe(3)
  })
  it('false joker (X) acts as a plain concrete tile (okey value), not as a universal wild', () => {
    // okey=7M. X is plain 7M (BLUE). Can join a blue run: X(=7M),8M,9M.
    const rack = h('X','8M','9M','2S','5K') // X-8M-9M = valid blue run; 2S,5K = leftovers
    const a = arrange(rack, OKEY, KLASIK)
    expect(a.meldedCount).toBe(3)
    expect(a.melds.length).toBe(1)
  })
  it('suggestDiscard returns a leftover tile', () => {
    const rack = h('1R','2R','3R','4K','5K','6K','9S','9R','9M','8M','2S')
    const d = suggestDiscard(rack, OKEY, KLASIK)
    expect(['8M','2S']).toContain(tileToString(d))
  })
})
