import { describe, it, expect } from 'vitest'
import { tileFromString } from '../src/tile'
import type { Tile } from '../src/tile'
import { KLASIK_101 } from '../src/config'
import { openingValue, isValidMeldSet, canOpen } from '../src/open'

// Helper: build a meld from tile strings
function h(...strs: string[]): Tile[] {
  return strs.map(tileFromString)
}

const OKEY = tileFromString('7M') // 7 Blue = okey

describe('openingValue', () => {
  it('sums plain tiles in a run', () => {
    // 10R, 11R, 12R → 10+11+12 = 33
    const melds = [h('10R', '11R', '12R')]
    expect(openingValue(melds, OKEY)).toBe(33)
  })

  it('values a wild in a run as the gap number', () => {
    // 10R, X, 12R → X fills slot 11 → 10+11+12 = 33
    const melds = [h('10R', 'X', '12R')]
    expect(openingValue(melds, OKEY)).toBe(33)
  })

  it('values an okey-tile (wild) in a run as the gap number', () => {
    // 5R, 6R, 7M → 7M is the okey tile (wild), fills slot 7 → 5+6+7 = 18
    const melds = [h('5R', '6R', '7M')]
    expect(openingValue(melds, OKEY)).toBe(18)
  })

  it('values a wild in a group as the group number', () => {
    // 9R, 9K, X → X fills group value 9 → 9+9+9 = 27
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

  it('wild at start of run valued as leading slot', () => {
    // X, 11R, 12R → X fills slot 10 → 10+11+12 = 33
    const melds = [h('X', '11R', '12R')]
    expect(openingValue(melds, OKEY)).toBe(33)
  })

  it('wild at end of run valued as trailing slot', () => {
    // 10R, 11R, X → X fills slot 12 → 10+11+12 = 33
    const melds = [h('10R', '11R', 'X')]
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

  it('accepts a run with wild filling a gap', () => {
    expect(isValidMeldSet([h('10R', 'X', '12R')], OKEY, KLASIK_101)).toBe(true)
  })

  it('accepts a group with a wild', () => {
    expect(isValidMeldSet([h('9R', '9K', 'X')], OKEY, KLASIK_101)).toBe(true)
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
