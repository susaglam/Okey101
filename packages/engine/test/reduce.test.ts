// packages/engine/test/reduce.test.ts
import { describe, it, expect } from 'vitest'
import { reduce, deriveOkey, RuleError } from '../src/reduce'
import { KLASIK } from '../src/config'
import { tileFromString, tileToString } from '../src/tile'

describe('deriveOkey', () => {
  it('is indicator+1 same color', () => {
    expect(tileToString(deriveOkey(tileFromString('6M')))).toBe('7M')
  })
  it('wraps 13 to 1', () => {
    expect(tileToString(deriveOkey(tileFromString('13R')))).toBe('1R')
  })
})

describe('reduce — setup', () => {
  it('CreateGame then StartHand deals 15/14/14/14, sets indicator+okey, removes indicator from stock', () => {
    let s = reduce(null, { type: 'CreateGame', gameId: 'g', seed: 99, config: KLASIK })
    s = reduce(s, { type: 'StartHand' })
    expect(s.status).toBe('PLAYING')
    expect(s.players[0]!.rack).toHaveLength(15) // starter
    expect(s.players[1]!.rack).toHaveLength(14)
    expect(s.indicator).toBeDefined()
    expect(s.okey).toBeDefined()
    // 106 - 1 indicator - (15+14+14+14)=57 dealt => stock 48
    expect(s.stock).toHaveLength(48)
    expect(s.turn).toEqual({ seat: 0, phase: 'DISCARD' }) // starter holds 15, must discard first
  })
})

describe('reduce — turn enforcement', () => {
  function started() {
    let s = reduce(null, { type: 'CreateGame', gameId: 'g', seed: 99, config: KLASIK })
    return reduce(s, { type: 'StartHand' })
  }
  it('rejects a draw when it is the discard phase', () => {
    const s = started()
    expect(() => reduce(s, { type: 'DrawFromStock', seat: 0 })).toThrow(RuleError)
  })
  it('rejects an action by the wrong seat', () => {
    const s = started()
    expect(() => reduce(s, { type: 'Discard', seat: 1, tile: s.players[1]!.rack[0]! })).toThrow(RuleError)
  })
  it('discard advances turn to the right and into DRAW phase', () => {
    const s = started()
    const s2 = reduce(s, { type: 'Discard', seat: 0, tile: s.players[0]!.rack[0]! })
    expect(s2.players[0]!.rack).toHaveLength(14)
    expect(s2.players[0]!.discard).toHaveLength(1)
    expect(s2.turn).toEqual({ seat: 1, phase: 'DRAW' })
  })
  it('DrawFromDiscard takes only the left neighbour top tile', () => {
    let s = started()
    s = reduce(s, { type: 'Discard', seat: 0, tile: s.players[0]!.rack[0]! }) // seat0 discards; seat1 to draw
    const topOfLeft = s.players[0]!.discard[s.players[0]!.discard.length - 1]!
    const s2 = reduce(s, { type: 'DrawFromDiscard', seat: 1 })
    expect(s2.players[1]!.rack).toContainEqual(topOfLeft)
    expect(s2.players[0]!.discard).toHaveLength(0)
    expect(s2.turn).toMatchObject({ seat: 1, phase: 'DISCARD' })
  })
  it('voids the hand when stock is exhausted on a stock draw', () => {
    let s = started()
    s = { ...s, stock: [] } // force empty stock
    s = reduce(s, { type: 'Discard', seat: 0, tile: s.players[0]!.rack[0]! }) // seat1 to draw
    const s2 = reduce(s, { type: 'DrawFromStock', seat: 1 })
    expect(s2.status).toBe('ENDED')
    expect(s2.terminal?.reason).toBe('hand-void')
  })
})
