import { describe, it, expect } from 'vitest'
import { evaluateHand, effectiveWilds } from '../src/evaluator'
import { KLASIK } from '../src/config'
import { tileFromString, fromKotlinShort } from '../src/tile'
import { OKEY, WINNING_PAIRS, NOT_WINNING } from './fixtures/evaluator-corpus'

const h = (...s: string[]) => s.map(tileFromString)

describe('evaluator', () => {
  it('counts effective wilds (false jokers + okey-valued tiles)', () => {
    const rack = h('X', '7M', '7M', '5R') // 2 false jokers? no: 1 X + two 7M (okey) = 3 wilds
    expect(effectiveWilds(rack, OKEY)).toBe(3)
  })
  it('detects a pure per (runs+groups) win', () => {
    const rack = h('1R','2R','3R','4K','5K','6K','9S','9R','9M','11S','12S','13S','13K','13R')
    expect(evaluateHand(rack, OKEY, KLASIK)).toEqual({ isWinning: true, winKind: 'perOnly' })
  })
  it('detects a 7-pairs (çift) win', () => {
    expect(evaluateHand(WINNING_PAIRS, OKEY, KLASIK)).toEqual({ isWinning: true, winKind: 'pairs' })
  })
  it('uses a false joker as a wild to complete a run', () => {
    const rack = h('1R','X','3R','4K','5K','6K','9S','9R','9M','11S','12S','13S','13K','13R')
    expect(evaluateHand(rack, OKEY, KLASIK).isWinning).toBe(true)
  })
  it('treats a real okey tile (7M) identically to a false joker (invariance)', () => {
    const withFalse = h('1R','X','3R','4K','5K','6K','9S','9R','9M','11S','12S','13S','13K','13R')
    const withOkey  = h('1R','7M','3R','4K','5K','6K','9S','9R','9M','11S','12S','13S','13K','13R')
    expect(evaluateHand(withFalse, OKEY, KLASIK).isWinning).toBe(evaluateHand(withOkey, OKEY, KLASIK).isWinning)
  })
  it('allows 13→1 wrap run when config.runWrap13to1 is true', () => {
    const rack = h('12R','13R','1R','4K','5K','6K','9S','9R','9M','11S','12S','13S','2M','3M')
    expect(evaluateHand(rack, OKEY, KLASIK).isWinning).toBe(true)
  })
  it('rejects a non-winning hand', () => {
    expect(evaluateHand(NOT_WINNING, OKEY, KLASIK).isWinning).toBe(false)
  })
  it('handles up to 4 wilds without throwing (Kotlin oracle limitation region)', () => {
    const rack = h('X','X','7M','7M','5K','6K','9S','9R','11S','12S','13S','2M','3M','4M')
    expect(() => evaluateHand(rack, OKEY, KLASIK)).not.toThrow()
  })
  it('transcribes a legacy Kotlin winning rack (G→BLUE)', () => {
    const rack = ['1R','2R','3R','4G','5G','6G','9Y','9R','9G','11Y','12Y','13Y','13R','13B'].map(fromKotlinShort)
    expect(evaluateHand(rack, fromKotlinShort('7G'), KLASIK).isWinning).toBe(true)
  })
})
