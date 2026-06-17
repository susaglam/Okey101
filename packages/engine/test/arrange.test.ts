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
