import type { GameState } from '../state'
import { tilesEqual } from '../tile'

export interface KlasikScoring { normal: number; okeyFinishMultiplier: number; ciftMultiplier: number }
export const KLASIK_SCORING: KlasikScoring = { normal: 2, okeyFinishMultiplier: 2, ciftMultiplier: 2 }

export function scoreHand(state: GameState, scoring: KlasikScoring = KLASIK_SCORING): number[] {
  const n = state.config.players
  const deltas = Array.from({ length: n }, () => 0)
  const term = state.terminal
  if (!term || term.reason !== 'win' || term.winnerSeat == null) return deltas

  let perOpponent = scoring.normal
  if (term.winType === 'pairs') perOpponent *= scoring.ciftMultiplier
  const finishedByOkey = term.finishingTile != null && state.okey != null && tilesEqual(term.finishingTile, state.okey)
  if (finishedByOkey) perOpponent *= scoring.okeyFinishMultiplier

  let winnerGain = 0
  for (let seat = 0; seat < n; seat++) {
    if (seat === term.winnerSeat) continue
    deltas[seat] = -perOpponent
    winnerGain += perOpponent
  }
  deltas[term.winnerSeat] = winnerGain
  return deltas
}
