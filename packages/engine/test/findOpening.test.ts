import { describe, it, expect } from 'vitest'
import { findOpening, openingValue, canOpen } from '../src/open'
import { KLASIK_101 } from '../src/config'
import { tileFromString } from '../src/tile'

const okey = tileFromString('7M') // 7 Blue is okey

describe('findOpening', () => {
  it('returns a valid ≥101 meld set for a rack that can open', () => {
    // Construct a rack with clear runs and groups summing well above 101:
    // Run: 11R 12R 13R = 36
    // Run: 11K 12K 13K = 36
    // Group: 11R 11K 11M 11S = 44  (but 11R already used above — use different ones)
    // Let's use separate tiles:
    // Run 1: 11R 12R 13R  = 36
    // Run 2: 10K 11K 12K  = 33
    // Group: 13K 13M 13S  = 39
    // Total = 108 ≥ 101
    const rack = [
      tileFromString('11R'), tileFromString('12R'), tileFromString('13R'),
      tileFromString('10K'), tileFromString('11K'), tileFromString('12K'),
      tileFromString('13K'), tileFromString('13M'), tileFromString('13S'),
      // Extra tiles (leftovers)
      tileFromString('1R'), tileFromString('2K'), tileFromString('3M'),
    ]
    const result = findOpening(rack, okey, KLASIK_101)
    expect(result).not.toBeNull()
    expect(openingValue(result!, okey)).toBeGreaterThanOrEqual(101)
    expect(canOpen(result!, okey, KLASIK_101)).toBe(true)
  })

  it('returns null for a weak rack that cannot reach 101', () => {
    // Low scattered tiles: no runs/groups possible that sum to 101
    const rack = [
      tileFromString('1R'), tileFromString('2K'), tileFromString('3M'),
      tileFromString('4S'), tileFromString('5R'), tileFromString('6K'),
      tileFromString('1K'), tileFromString('2M'), tileFromString('3S'),
    ]
    const result = findOpening(rack, okey, KLASIK_101)
    expect(result).toBeNull()
  })
})
