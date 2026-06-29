import { describe, it, expect } from 'vitest'
import { decide } from '../src/index'
import {
  reduce, RuleError, redactFor, legalMoves101, makeRng, deriveSeed,
  KLASIK_101, scoreHand101, teamScores,
  type GameState, type GameEvent,
} from '@cs-okey/engine'

/**
 * Drive a full eşli (team) 101 hand with four bots until it ends, mirroring the
 * LocalAdapter bot loop (with the same legal-move fallback so a single bad move
 * can't deadlock the hand). End-to-end proof that team mode plays cleanly and the
 * partner waiver / team aggregation behave on REAL played-out states.
 */
function playOutHand(teamMode: boolean, seed: number): GameState {
  let state = reduce(null, {
    type: 'CreateGame', gameId: 'g', seed, config: { ...KLASIK_101, teamMode },
  })
  state = reduce(state, { type: 'StartHand' })

  let guard = 0
  while (state.status === 'PLAYING' && guard++ < 4000) {
    const seat = state.turn.seat
    const legal = legalMoves101(state, seat)
    if (legal.length === 0) break
    const view = redactFor(state, seat, guard)
    const rng = makeRng(deriveSeed(seed, `bot:${seat}:${guard}`))
    const fallback = (): GameEvent =>
      state.turn.phase === 'DRAW'
        ? { type: 'DrawFromStock', seat }
        : { type: 'Discard', seat, tile: state.players[seat]!.rack[0]! }
    let ev: GameEvent
    try { ev = decide(view, legal, rng) } catch { ev = fallback() }
    try { state = reduce(state, ev) }
    catch (e) {
      if (!(e instanceof RuleError)) throw e
      try { state = reduce(state, fallback()) } catch { break }
    }
  }
  return state
}

describe('eşli (team) mode — full bot self-play', () => {
  // A few seeds is enough — full self-play is slow (findOpening over a 21-tile rack),
  // so keep the count low and give each test a generous timeout under parallel load.
  const SEEDS = [1, 7, 42]
  const TIMEOUT = 30_000

  it('a four-bot eşli hand always reaches a terminal state', () => {
    for (const seed of SEEDS) {
      const state = playOutHand(true, seed)
      expect(state.status, `seed ${seed}`).toBe('ENDED')
    }
  }, TIMEOUT)

  it('the winner’s partner never pays MORE than they would in solo scoring (leftover waived)', () => {
    for (const seed of SEEDS) {
      const state = playOutHand(true, seed)
      const term = state.terminal
      if (term?.reason !== 'win' || term.winnerSeat == null) continue
      const partner = (term.winnerSeat + 2) % 4
      const teamDeltas = scoreHand101(state)
      const soloDeltas = scoreHand101({ ...state, config: { ...state.config, teamMode: false } })
      // Team mode waives the partner's leftover (base) but keeps flat penalties,
      // so the partner's team-mode delta is ≤ their solo delta.
      expect(teamDeltas[partner]!, `seed ${seed}`).toBeLessThanOrEqual(soloDeltas[partner]!)
    }
  }, TIMEOUT)

  it('teamScores partitions a played-out hand into two finite team totals', () => {
    const state = playOutHand(true, 42)
    const [t0, t1] = teamScores(scoreHand101(state))
    expect(Number.isFinite(t0)).toBe(true)
    expect(Number.isFinite(t1)).toBe(true)
  }, TIMEOUT)
})
