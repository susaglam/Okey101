import { describe, it, expect } from 'vitest'
import { scoreHand } from '../src/scoring/klasik'
import type { GameState } from '../src/state'
import { KLASIK } from '../src/config'
import { tileFromString } from '../src/tile'

function ended(winType: 'perOnly' | 'pairs', finishing: string): GameState {
  return {
    gameId: 'g', config: KLASIK, rngSeed: 1, handNo: 1, stock: [],
    indicator: tileFromString('6M'), okey: tileFromString('7M'),
    turn: { seat: 0, phase: 'DISCARD' },
    players: [0, 1, 2, 3].map((seat) => ({ seat, rack: [], discard: [], hasOpened: false, isOut: seat === 0 })),
    scores: [0, 0, 0, 0], status: 'ENDED',
    terminal: { reason: 'win', winnerSeat: 0, winType, finishingTile: tileFromString(finishing) },
  }
}

describe('klasik scoring', () => {
  it('normal per win: each opponent -2, winner +6', () => {
    expect(scoreHand(ended('perOnly', '5R'))).toEqual([6, -2, -2, -2])
  })
  it('çift win: each opponent -4, winner +12', () => {
    expect(scoreHand(ended('pairs', '5R'))).toEqual([12, -4, -4, -4])
  })
  it('finishing by discarding the okey doubles: each opponent -4, winner +12', () => {
    expect(scoreHand(ended('perOnly', '7M'))).toEqual([12, -4, -4, -4])
  })
  it('void hand scores zero for everyone', () => {
    const s = ended('perOnly', '5R'); s.terminal = { reason: 'hand-void' }
    expect(scoreHand(s)).toEqual([0, 0, 0, 0])
  })
})
