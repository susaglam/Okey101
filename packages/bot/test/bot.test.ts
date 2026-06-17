import { describe, it, expect } from 'vitest'
import { decide } from '../src/index'
import { makeRng, KLASIK, redactFor, type GameState } from '@cs-okey/engine'
import { tileFromString } from '@cs-okey/engine'

function viewWith(rack: string[], phase: 'DRAW'|'DISCARD', leftDiscard: string[] = []) {
  const state: GameState = {
    gameId: 'g', config: KLASIK, rngSeed: 1, handNo: 1,
    stock: [tileFromString('1R'), tileFromString('2R')],
    indicator: tileFromString('6M'), okey: tileFromString('7M'),
    turn: { seat: 0, phase },
    players: [
      { seat: 0, rack: rack.map(tileFromString), discard: [], hasOpened: false, isOut: false },
      { seat: 1, rack: [], discard: [], hasOpened: false, isOut: false },
      { seat: 2, rack: [], discard: [], hasOpened: false, isOut: false },
      { seat: 3, rack: leftDiscard.map(tileFromString), discard: leftDiscard.map(tileFromString), hasOpened: false, isOut: false },
    ],
    scores: [0,0,0,0], status: 'PLAYING',
  }
  // seat 0's left neighbour is seat 3 (leftSeat(0,4)=3)
  return redactFor(state, 0, 1)
}

describe('bot.decide', () => {
  it('declares win in DISCARD phase when a winning discard exists', () => {
    // 15 tiles: a full-cover 14 + one extra discardable
    const rack = ['9R','9K','9M','9S','5R','5K','5M','5S','1R','2R','3R','11K','12K','13K','8S']
    const ev = decide(viewWith(rack, 'DISCARD'), ['Discard','DeclareWin'], makeRng(1))
    expect(ev.type).toBe('DeclareWin')
    if (ev.type === 'DeclareWin') expect(ev.seat).toBe(0)
  })
  it('discards a useless tile in DISCARD phase when not winning', () => {
    const rack = ['1R','2R','3R','9S','9R','5K','11M','13S','4K','6K','8M','10S','12R','2K','7S']
    const ev = decide(viewWith(rack, 'DISCARD'), ['Discard','DeclareWin'], makeRng(2))
    expect(ev.type).toBe('Discard')
    if (ev.type === 'Discard') expect(rack.map(tileFromString)).toContainEqual(ev.tile)
  })
  it('chooses a legal draw in DRAW phase', () => {
    const ev = decide(viewWith(['1R','2R'], 'DRAW', ['3R']), ['DrawFromStock','DrawFromDiscard'], makeRng(3))
    expect(['DrawFromStock','DrawFromDiscard']).toContain(ev.type)
    expect(ev.seat).toBe(0)
  })
  it('only draws from stock when discard not legal', () => {
    const ev = decide(viewWith(['1R','2R'], 'DRAW', []), ['DrawFromStock'], makeRng(4))
    expect(ev.type).toBe('DrawFromStock')
  })
})
