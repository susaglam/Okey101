import { describe, it, expect } from 'vitest'
import { KLASIK } from '../src/config'
import { buildDeck } from '../src/deck'
import { tileToString } from '../src/tile'

describe('deck', () => {
  it('builds 106 tiles for Klasik', () => {
    const deck = buildDeck(KLASIK)
    expect(deck).toHaveLength(106)
  })
  it('has exactly 2 false jokers', () => {
    const deck = buildDeck(KLASIK)
    expect(deck.filter((t) => t.kind === 'FALSE_JOKER')).toHaveLength(2)
  })
  it('has exactly 2 copies of each numbered tile', () => {
    const deck = buildDeck(KLASIK)
    expect(deck.filter((t) => tileToString(t) === '7M')).toHaveLength(2)
    expect(deck.filter((t) => tileToString(t) === '13S')).toHaveLength(2)
  })
})
