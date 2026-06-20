import { describe, it, expect } from 'vitest'
import { arrange, suggestDiscard } from '../src/arrange'
import { KLASIK, KLASIK_101 } from '../src/config'
import { openingValue } from '../src/open'
import { tileFromString, tileToString } from '../src/tile'
const h = (...s: string[]) => s.map(tileFromString)
const OKEY = tileFromString('7M')

describe('arrange — value-maximizing objective (101 Sırala)', () => {
  it('places the wild in the highest-value slot when given a valueFn', () => {
    const okey = tileFromString('1M') // wild = 1M
    const rack = h('10R', '11R', '12R', '5R', '5K', '5S', '1M')
    // Value mode: wild extends the high run to 13 → {10,11,12,13}=46 + {5,5,5}=15 = 61
    const valued = arrange(rack, okey, KLASIK_101, (m) => openingValue(m, okey))
    expect(openingValue(valued.melds, okey)).toBe(61)
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
