import { describe, it, expect } from 'vitest'
import { redactFor } from '../src/view'
import type { GameState } from '../src/state'
import { KLASIK } from '../src/config'
import { tileFromString } from '../src/tile'

function fixtureState(): GameState {
  return {
    gameId: 'g1', config: KLASIK, rngSeed: 1, handNo: 1,
    stock: [tileFromString('1R'), tileFromString('2R'), tileFromString('3R')],
    indicator: tileFromString('6M'), okey: tileFromString('7M'),
    turn: { seat: 0, phase: 'DISCARD' },
    players: [
      { seat: 0, rack: [tileFromString('5R'), tileFromString('5K')], discard: [], hasOpened: false, isOut: false },
      { seat: 1, rack: [tileFromString('9S'), tileFromString('9R')], discard: [tileFromString('1K')], hasOpened: false, isOut: false },
    ],
    scores: [0, 0], status: 'PLAYING',
  }
}

describe('redactFor', () => {
  it('reveals your own rack but not opponents tiles', () => {
    const v = redactFor(fixtureState(), 0, 5)
    expect(v.you.rack.map((t) => t.number)).toEqual([5, 5])
    expect(v.opponents).toHaveLength(1)
    expect(v.opponents[0]!.rackCount).toBe(2)
    expect((v.opponents[0] as any).rack).toBeUndefined()
  })
  it('exposes only the top discard tile + count, never the stock contents', () => {
    const v = redactFor(fixtureState(), 0, 5)
    expect(v.opponents[0]!.discardTop).toEqual(tileFromString('1K'))
    expect(v.opponents[0]!.discardCount).toBe(1)
    expect(v.stockCount).toBe(3)
    expect((v as any).stock).toBeUndefined()
  })
  it('carries the version stamp', () => {
    expect(redactFor(fixtureState(), 0, 5).version).toBe(5)
  })
})
