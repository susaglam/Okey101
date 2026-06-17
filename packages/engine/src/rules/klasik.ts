import type { GameState } from '../state'
import type { GameEvent } from '../events'

export function legalMoves(state: GameState, seat: number): GameEvent['type'][] {
  if (state.status !== 'PLAYING' || state.turn.seat !== seat) return []
  if (state.turn.phase === 'DRAW') {
    const moves: GameEvent['type'][] = []
    // Always include DrawFromStock: when stock is empty, reduce will emit hand-void terminal.
    moves.push('DrawFromStock')
    const leftSeatIndex = (seat - 1 + state.config.players) % state.config.players
    const left = state.players.find((p) => p.seat === leftSeatIndex)!
    if (left.discard.length > 0) moves.push('DrawFromDiscard')
    return moves
  }
  // DISCARD phase
  return ['Discard', 'DeclareWin']
}
