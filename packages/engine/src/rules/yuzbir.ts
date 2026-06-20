import type { GameState } from '../state'
import type { GameEvent } from '../events'
import { leftSeat } from '../state'

/**
 * Returns the set of legal event types for the given seat in a 101 game.
 * This is used by the UI / bot to enumerate valid actions.
 */
export function legalMoves101(state: GameState, seat: number): GameEvent['type'][] {
  if (state.status !== 'PLAYING' || state.turn.seat !== seat) return []

  if (state.turn.phase === 'DRAW') {
    const moves: GameEvent['type'][] = []
    // DrawFromStock is always a legal move (empty stock triggers hand exhaustion in reduce)
    moves.push('DrawFromStock')
    const leftIdx = leftSeat(seat, state.config.players)
    const left = state.players.find((p) => p.seat === leftIdx)!
    if (left.discard.length > 0) moves.push('DrawFromDiscard')
    return moves
  }

  // DISCARD phase
  const moves: GameEvent['type'][] = ['Discard']
  const player = state.players.find((p) => p.seat === seat)!

  // DeclareCift: binding declaration, can be made before opening
  if (!player.declaredCift) {
    moves.push('DeclareCift')
  }

  // OpenMeld: available in discard phase
  // (validation of the specific melds is done in reduce; here we just indicate it's structurally possible)
  moves.push('OpenMeld')

  // LayOff & TakeOkey: only if the player has opened and there are table melds
  if (player.hasOpened && (state.tableMelds?.length ?? 0) > 0) {
    moves.push('LayOff')
    moves.push('TakeOkey')
  }

  // DeclareWin: can attempt (reduce will validate)
  moves.push('DeclareWin')

  return moves
}

/**
 * Checks whether the given seat is in an "işlek" situation:
 * the player took the left neighbour's discard this turn.
 */
export function isIslek(state: GameState, seat: number): boolean {
  if (state.turn.seat !== seat) return false
  return (state.turn as { tookFromLeft?: boolean }).tookFromLeft === true
}
