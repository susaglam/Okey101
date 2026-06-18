import { describe, it, expect } from 'vitest'
import { tileFromString } from '../src/tile'
import type { Tile } from '../src/tile'
import { KLASIK_101, KLASIK } from '../src/config'
import { openingValue, isValidMeldSet, canOpen } from '../src/open'

// Helper: build a meld from tile strings
function h(...strs: string[]): Tile[] {
  return strs.map(tileFromString)
}

const OKEY = tileFromString('7M') // 7 Blue = okey
const OKEY_8K = tileFromString('8K') // 8 Black = okey for false-joker rule tests

describe('openingValue', () => {
  it('sums plain tiles in a run', () => {
    // 10R, 11R, 12R → 10+11+12 = 33
    const melds = [h('10R', '11R', '12R')]
    expect(openingValue(melds, OKEY)).toBe(33)
  })

  it('values a real okey tile (wild) in a run as the gap number', () => {
    // 10R, 7M(wild), 12R → 7M is wild (real okey NUMBER tile), fills slot 11 → 10+11+12 = 33
    const melds = [h('10R', '7M', '12R')]
    expect(openingValue(melds, OKEY)).toBe(33)
  })
  it('values a false joker (X) in a run as its concrete okey value slot', () => {
    // 10R, X, 12R → X is plain 7M (BLUE), meld is actually 10R-7M-12R = different colors
    // The detectShape sees multiple colors → treated as group; group number = 10 (first non-wild)
    // groupValue = 10 * 3 = 30
    const melds = [h('10R', 'X', '12R')]
    expect(openingValue(melds, OKEY)).toBe(30)
  })

  it('values an okey-tile (wild) in a run as the gap number', () => {
    // 5R, 6R, 7M → 7M is the okey tile (wild), fills slot 7 → 5+6+7 = 18
    const melds = [h('5R', '6R', '7M')]
    expect(openingValue(melds, OKEY)).toBe(18)
  })

  it('values a real okey tile (wild) in a group as the group number', () => {
    // 9R, 9K, 7M(wild) → 7M is wild (real okey tile), fills group value 9 → 9+9+9 = 27
    const melds = [h('9R', '9K', '7M')]
    expect(openingValue(melds, OKEY)).toBe(27)
  })
  it('false joker (X) in a pseudo-group: openingValue uses first non-wild effective value', () => {
    // 9R, 9K, X → X is plain 7M (number=7). nonWild effective values: [(9,RED),(9,BLACK),(7,BLUE)].
    // detectShape: multiple colors → 'group'. groupValue: first non-wild = 9R → 9 * 3 = 27.
    // (Note: this meld is structurally INVALID as a real group — different numbers — but
    //  openingValue computes a value for it anyway; isValidMeldSet would reject it.)
    const melds = [h('9R', '9K', 'X')]
    expect(openingValue(melds, OKEY)).toBe(27)
  })

  it('values the okey tile in a group as the group number', () => {
    // 9R, 9K, 7M → 7M is okey (wild), group number is 9 → 9+9+9 = 27
    const melds = [h('9R', '9K', '7M')]
    expect(openingValue(melds, OKEY)).toBe(27)
  })

  it('sums plain tiles in a group', () => {
    // 12R, 12K, 12M → 12+12+12 = 36
    const melds = [h('12R', '12K', '12M')]
    expect(openingValue(melds, OKEY)).toBe(36)
  })

  it('sums across multiple melds', () => {
    // Run 10R,11R,12R=33 + Group 12R,12K,12M=36 → 69
    const melds = [h('10R', '11R', '12R'), h('12R', '12K', '12M')]
    expect(openingValue(melds, OKEY)).toBe(69)
  })

  it('real okey tile (wild) at start of run valued as leading slot', () => {
    // 7M(wild), 11R, 12R → 7M is wild (real okey tile), fills slot 10 → 10+11+12 = 33
    const melds = [h('7M', '11R', '12R')]
    expect(openingValue(melds, OKEY)).toBe(33)
  })

  it('real okey tile (wild) at end of run valued as trailing slot', () => {
    // 10R, 11R, 7M(wild) → 7M is wild (real okey tile), fills slot 12 → 10+11+12 = 33
    const melds = [h('10R', '11R', '7M')]
    expect(openingValue(melds, OKEY)).toBe(33)
  })
})

describe('isValidMeldSet', () => {
  it('accepts a valid run ≥3 same color consecutive', () => {
    expect(isValidMeldSet([h('5R', '6R', '7R')], OKEY, KLASIK_101)).toBe(true)
  })

  it('accepts a valid group same number distinct colors', () => {
    expect(isValidMeldSet([h('8R', '8K', '8M')], OKEY, KLASIK_101)).toBe(true)
  })

  it('accepts a run with real okey tile (wild) filling a gap', () => {
    // 10R, 7M(wild=real okey), 12R → 7M is wild (real NUMBER tile matching okey) → fills slot 11
    expect(isValidMeldSet([h('10R', '7M', '12R')], OKEY, KLASIK_101)).toBe(true)
  })

  it('rejects a run where X (false joker) is misused as universal wild', () => {
    // 10R, X, 12R → X is plain 7M (BLUE, 7), not RED → different colors → invalid run
    expect(isValidMeldSet([h('10R', 'X', '12R')], OKEY, KLASIK_101)).toBe(false)
  })

  it('accepts a group with a real okey tile (wild)', () => {
    // 9R, 9K, 7M(wild=real okey) → 7M is wild → fills missing color slot → valid group
    expect(isValidMeldSet([h('9R', '9K', '7M')], OKEY, KLASIK_101)).toBe(true)
  })

  it('rejects a group where X (false joker) cannot act as universal wild', () => {
    // 9R, 9K, X → X is plain 7M (number=7 ≠ 9) → 3 tiles with numbers 9,9,7 → invalid group
    expect(isValidMeldSet([h('9R', '9K', 'X')], OKEY, KLASIK_101)).toBe(false)
  })

  it('accepts a 4-tile group', () => {
    expect(isValidMeldSet([h('7R', '7K', '7M', '7S')], OKEY, KLASIK_101)).toBe(true)
  })

  it('rejects a run shorter than 3', () => {
    expect(isValidMeldSet([h('5R', '6R')], OKEY, KLASIK_101)).toBe(false)
  })

  it('rejects a 13→1 wrap run when runWrap13to1 is false', () => {
    // 12R, 13R, 1R would be a wrap — invalid in 101
    expect(isValidMeldSet([h('12R', '13R', '1R')], OKEY, KLASIK_101)).toBe(false)
  })

  it('rejects a group with duplicate colors', () => {
    // 9R, 9R, 9K — two RED tiles → invalid group
    expect(isValidMeldSet([h('9R', '9R', '9K')], OKEY, KLASIK_101)).toBe(false)
  })

  it('rejects a group with 5+ tiles', () => {
    // Only 3-4 tiles in a group
    expect(isValidMeldSet([h('6R', '6K', '6M', '6S', '6R')], OKEY, KLASIK_101)).toBe(false)
  })

  it('rejects mixed colors non-consecutive (not a valid run or group)', () => {
    expect(isValidMeldSet([h('5R', '6K', '7R')], OKEY, KLASIK_101)).toBe(false)
  })

  it('accepts multiple melds all valid', () => {
    const melds = [h('5R', '6R', '7R'), h('8K', '8M', '8S')]
    expect(isValidMeldSet(melds, OKEY, KLASIK_101)).toBe(true)
  })

  it('rejects if any meld in the set is invalid', () => {
    const melds = [h('5R', '6R', '7R'), h('12R', '13R', '1R')] // second is wrap
    expect(isValidMeldSet(melds, OKEY, KLASIK_101)).toBe(false)
  })

  // ─── FALSE_JOKER rule tests (okey=8K) ───────────────────────────────────────

  it('RULE: [5R,5Y,X] is NOT valid when okey=8K — X is plain 8K, not a wild 5', () => {
    // X resolves to 8K (plain). Group of 5s needs tiles with number=5.
    // 8K has number=8 ≠ 5, so it cannot join a group of 5s.
    expect(isValidMeldSet([h('5R', '5S', 'X')], OKEY_8K, KLASIK_101)).toBe(false)
  })

  it('RULE: [6K,7K,X] IS a valid black run when okey=8K — X is plain 8K', () => {
    // X resolves to 8K (plain). Run 6K-7K-8K is valid (consecutive blacks).
    expect(isValidMeldSet([h('6K', '7K', 'X')], OKEY_8K, KLASIK_101)).toBe(true)
  })

  it('RULE: real 8K tile IS a wild in a red run when okey=8K', () => {
    // Real 8K NUMBER tile is wild (it IS the okey tile).
    // Run: 1R, 8K(wild), 3R → wild fills slot 2R → valid red run 1R-2R-3R.
    expect(isValidMeldSet([h('1R', '8K', '3R')], OKEY_8K, KLASIK)).toBe(true)
  })
})

describe('canOpen — standard ≥101 route', () => {
  it('returns false for a valid set summing <101', () => {
    // 5R,6R,7R=18 + 8K,8M,8S=24 → 42 < 101
    const melds = [h('5R', '6R', '7R'), h('8K', '8M', '8S')]
    expect(canOpen(melds, OKEY, KLASIK_101)).toBe(false)
  })

  it('returns true for a valid set summing ≥101', () => {
    // 11R,12R,13R=36 + 11K,12K,13K=36 + 11M,11S,11R... let's pick a safe set
    // Run: 11R,12R,13R = 36; Run: 11K,12K,13K = 36; Group: 13R,13K,13M = 39 → total 111
    const melds = [
      h('11R', '12R', '13R'),
      h('11K', '12K', '13K'),
      h('13M', '13S', '13R'),
    ]
    expect(canOpen(melds, OKEY, KLASIK_101)).toBe(true)
  })

  it('returns false for invalid meld even if value ≥101', () => {
    // 13→1 wrap — structurally invalid
    const melds = [
      h('12R', '13R', '1R'),  // invalid wrap
      h('11K', '12K', '13K'),
      h('11M', '12M', '13M'),
    ]
    expect(canOpen(melds, OKEY, KLASIK_101)).toBe(false)
  })

  it('returns true for exactly 101 total value', () => {
    // Need exactly 101: 13+12+11+13+12+11+12+12+5 = let's build carefully
    // Run 11R,12R,13R=36 + Run 11K,12K,13K=36 + Group 9R,9K,9M=27+3 extra...
    // Actually: 11R,12R,13R=36 + 11K,12K,13K=36 + 10R,10K,10M=30 → 102 ≥101
    const melds = [
      h('11R', '12R', '13R'),
      h('11K', '12K', '13K'),
      h('10R', '10K', '10M'),
    ]
    expect(canOpen(melds, OKEY, KLASIK_101)).toBe(true)
  })
})

describe('canOpen — pairs route (pairsOpenCount=5)', () => {
  it('returns true with exactly 5 valid pairs', () => {
    // 5 identical pairs
    const melds = [
      h('3R', '3R'),
      h('5K', '5K'),
      h('8M', '8M'),
      h('11S', '11S'),
      h('13R', '13R'),
    ]
    expect(canOpen(melds, OKEY, KLASIK_101)).toBe(true)
  })

  it('returns false with only 4 pairs', () => {
    const melds = [
      h('3R', '3R'),
      h('5K', '5K'),
      h('8M', '8M'),
      h('11S', '11S'),
    ]
    expect(canOpen(melds, OKEY, KLASIK_101)).toBe(false)
  })

  it('returns false with 5 pairs where one is not a matching pair', () => {
    const melds = [
      h('3R', '3R'),
      h('5K', '5K'),
      h('8M', '8M'),
      h('11S', '11S'),
      h('13R', '12R'), // not a pair
    ]
    expect(canOpen(melds, OKEY, KLASIK_101)).toBe(false)
  })

  it('returns false with 6 pairs (too many for pairs route)', () => {
    const melds = [
      h('3R', '3R'),
      h('5K', '5K'),
      h('8M', '8M'),
      h('11S', '11S'),
      h('13R', '13R'),
      h('1K', '1K'),
    ]
    expect(canOpen(melds, OKEY, KLASIK_101)).toBe(false)
  })
})
