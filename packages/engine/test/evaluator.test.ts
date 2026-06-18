import { describe, it, expect } from 'vitest'
import { evaluateHand, effectiveWilds } from '../src/evaluator'
import { KLASIK } from '../src/config'
import { tileFromString, fromKotlinShort } from '../src/tile'
import { OKEY, WINNING_PAIRS, NOT_WINNING } from './fixtures/evaluator-corpus'

const h = (...s: string[]) => s.map(tileFromString)

describe('evaluator', () => {
  it('counts effective wilds (only real okey-valued NUMBER tiles)', () => {
    // Under new rule: FALSE_JOKER (X) is NOT wild — it is a plain tile fixed to okey's value.
    // Only real NUMBER tiles equal to okey are wild.
    const rack = h('X', '7M', '7M', '5R') // X is plain 7M (not wild), two real 7M = 2 wilds
    expect(effectiveWilds(rack, OKEY)).toBe(2)
  })
  it('detects a pure per (runs+groups) win', () => {
    // 9-group(4) + 5-group(4) + 1R2R3R run + 11K12K13K run = 14, full cover
    const rack = h('9R','9K','9M','9S','5R','5K','5M','5S','1R','2R','3R','11K','12K','13K')
    expect(evaluateHand(rack, OKEY, KLASIK)).toEqual({ isWinning: true, winKind: 'perOnly' })
  })
  it('detects a 7-pairs (çift) win', () => {
    expect(evaluateHand(WINNING_PAIRS, OKEY, KLASIK)).toEqual({ isWinning: true, winKind: 'pairs' })
  })
  it('false joker can complete a meld only as its fixed concrete value (okey tile value)', () => {
    // okey=7M. X is plain 7M (BLUE). It can join a blue run: 5M,6M,X(=7M) = run ✓
    // 9-group(4) + 5-group(4) + 5M,6M,X(=7M blue run) + 11K,12K,13K run = 14 tiles ✓
    const rack = h('9R','9K','9M','9S','5R','5K','5S','5M','5M','6M','X','11K','12K','13K')
    expect(evaluateHand(rack, OKEY, KLASIK).isWinning).toBe(true)
  })
  it('false joker (X) is NOT equivalent to a real okey tile (7M) — real okey is wild, X is plain', () => {
    // okey=7M. Real 7M is wild (can fill any slot). X is plain 7M (can only be 7M).
    // withFalse: 1R,2R,X(=7M BLUE, NOT RED) → X cannot fill slot 3R → NOT WINNING
    const withFalse = h('9R','9K','9M','9S','5R','5K','5M','5S','1R','2R','X','11K','12K','13K')
    // withOkey: 1R,2R,7M(wild) → 7M can fill slot 3R → WINNING
    const withOkey  = h('9R','9K','9M','9S','5R','5K','5M','5S','1R','2R','7M','11K','12K','13K')
    expect(evaluateHand(withFalse, OKEY, KLASIK).isWinning).toBe(false)
    expect(evaluateHand(withOkey, OKEY, KLASIK).isWinning).toBe(true)
  })
  it('allows 13→1 wrap run when config.runWrap13to1 is true', () => {
    // 9-group(4) + 2-group(4) + 12R13R1R wrap run + 4S5S6S run = 14, full cover
    const rack = h('9R','9K','9M','9S','2K','2M','2S','2R','12R','13R','1R','4S','5S','6S')
    expect(evaluateHand(rack, OKEY, KLASIK).isWinning).toBe(true)
  })
  it('rejects a wrap-only hand when runWrap13to1 is false', () => {
    const noWrap = { ...KLASIK, runWrap13to1: false }
    const rack = h('9R','9K','9M','9S','2K','2M','2S','2R','12R','13R','1R','4S','5S','6S')
    expect(evaluateHand(rack, OKEY, noWrap).isWinning).toBe(false)
  })
  it('rejects a non-winning hand', () => {
    expect(evaluateHand(NOT_WINNING, OKEY, KLASIK).isWinning).toBe(false)
  })
  it('handles up to 4 wilds without throwing (Kotlin oracle limitation region)', () => {
    const rack = h('X','X','7M','7M','5K','6K','9S','9R','11S','12S','13S','2M','3M','4M')
    expect(() => evaluateHand(rack, OKEY, KLASIK)).not.toThrow()
  })
  it('transcribes a legacy Kotlin winning rack (G→BLUE)', () => {
    // 9-group(4) + 5-group(4) + 1R2R3R run + 11B12B13B run = 14, full cover
    const rack = ['9R','9B','9G','9Y','5R','5B','5G','5Y','1R','2R','3R','11B','12B','13B'].map(fromKotlinShort)
    expect(evaluateHand(rack, fromKotlinShort('7G'), KLASIK).isWinning).toBe(true)
  })
  it('rejects 4 melds + 2 unrelated junk tiles (no orphan win)', () => {
    // 9R9K9M group(3) + 5R6R7R run(3) + 1K2K3K run(3) + 4S5S6S run(3) = 12 tiles + 13M,8R leftover
    expect(evaluateHand(h('9R','9K','9M','5R','6R','7R','1K','2K','3K','4S','5S','6S','13M','8R'), OKEY, KLASIK).isWinning).toBe(false)
  })
})
