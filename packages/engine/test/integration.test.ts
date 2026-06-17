// packages/engine/test/integration.test.ts
import { describe, it, expect } from 'vitest'
import { reduce } from '../src/reduce'
import { legalMoves } from '../src/rules/klasik'
import { redactFor } from '../src/view'
import { scoreHand } from '../src/scoring/klasik'
import { KLASIK } from '../src/config'
import { evaluateHand } from '../src/evaluator'
import type { GameState } from '../src/state'
import type { GameEvent } from '../src/events'

// A bot-free driver: each turn, draw from stock then discard the last tile,
// unless the current rack (minus some discard) is already winning -> declare win.
function autoPlay(seed: number): GameState {
  let s = reduce(null, { type: 'CreateGame', gameId: 'g', seed, config: KLASIK })
  s = reduce(s, { type: 'StartHand' })
  let guard = 0
  while (s.status === 'PLAYING' && guard++ < 2000) {
    const seat = s.turn.seat
    if (s.turn.phase === 'DRAW') {
      const moves = legalMoves(s, seat)
      // Hidden-info discipline: a real bot would use redactFor; here we just assert it works.
      const view = redactFor(s, seat, guard)
      expect(view.you.seat).toBe(seat)
      if (moves.includes('DrawFromStock')) s = reduce(s, { type: 'DrawFromStock', seat })
      else { s = reduce(s, { type: 'DrawFromDiscard', seat }); }
    } else {
      const p = s.players.find((x) => x.seat === seat)!
      // try to find a winning declare: drop each tile, check evaluate
      let declared = false
      for (let i = 0; i < p.rack.length; i++) {
        const rest = p.rack.filter((_, j) => j !== i)
        if (evaluateHand(rest, s.okey!, KLASIK).isWinning) {
          const ev: GameEvent = { type: 'DeclareWin', seat, discardTile: p.rack[i]! }
          s = reduce(s, ev); declared = true; break
        }
      }
      if (!declared) s = reduce(s, { type: 'Discard', seat, tile: p.rack[p.rack.length - 1]! })
    }
  }
  return s
}

describe('integration: full Klasik hand', () => {
  it('reaches a terminal state (win or void) deterministically', () => {
    const a = autoPlay(12345)
    const b = autoPlay(12345)
    expect(a.status).toBe('ENDED')
    expect(a.terminal).toEqual(b.terminal) // determinism
  })
  it('produces a consistent score on a win', () => {
    const s = autoPlay(777)
    if (s.terminal?.reason === 'win') {
      const deltas = scoreHand(s)
      expect(deltas.reduce((x, y) => x + y, 0)).toBe(0) // zero-sum
      expect(deltas[s.terminal.winnerSeat!]!).toBeGreaterThan(0)
    } else {
      expect(s.terminal?.reason).toBe('hand-void')
    }
  })
})
