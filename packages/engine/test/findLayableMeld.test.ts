import { describe, it, expect } from 'vitest'
import { findLayableMeld } from '../src/open'
import { KLASIK_101 } from '../src/config'
import { tileFromString } from '../src/tile'

const okey = tileFromString('7M') // 7 Blue is okey

describe('findLayableMeld', () => {
  it('returns the run meld when rack contains 7M,8M,9M plus junk', () => {
    // 7M is okey (wild), 8M, 9M — can form a run with a wild
    // Actually let's use a plain run: 7R, 8R, 9R (not involving the okey tile)
    const rack = [
      tileFromString('7R'), tileFromString('8R'), tileFromString('9R'),
      tileFromString('1K'), tileFromString('3M'), tileFromString('5S'),
    ]
    const result = findLayableMeld(rack, okey, KLASIK_101)
    expect(result).not.toBeNull()
    expect(result!.length).toBeGreaterThanOrEqual(3)
  })

  it('returns a meld when rack has a valid group (same number, different colors)', () => {
    const rack = [
      tileFromString('9R'), tileFromString('9K'), tileFromString('9M'),
      tileFromString('2S'), tileFromString('4R'),
    ]
    const result = findLayableMeld(rack, okey, KLASIK_101)
    expect(result).not.toBeNull()
    expect(result!.length).toBeGreaterThanOrEqual(3)
  })

  it('returns null when rack has no valid meld', () => {
    // Scattered tiles with no run or group possible
    const rack = [
      tileFromString('1R'), tileFromString('3K'), tileFromString('5M'),
      tileFromString('7S'), tileFromString('9R'),
    ]
    const result = findLayableMeld(rack, okey, KLASIK_101)
    expect(result).toBeNull()
  })

  it('returns null for an empty rack', () => {
    const result = findLayableMeld([], okey, KLASIK_101)
    expect(result).toBeNull()
  })

  it('does NOT require ≥101 total value — a low-value meld (e.g. 1R,2R,3R) is returned', () => {
    const rack = [
      tileFromString('1R'), tileFromString('2R'), tileFromString('3R'),
      tileFromString('5K'), tileFromString('8M'),
    ]
    const result = findLayableMeld(rack, okey, KLASIK_101)
    // 1+2+3 = 6 which is far below 101 threshold, but findLayableMeld ignores that
    expect(result).not.toBeNull()
  })
})
