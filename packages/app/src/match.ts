// packages/app/src/match.ts

export interface MatchState {
  handNo: number
  totalHands: number
  standings: number[]
  over: boolean
}

/** Per-hand scoreboard record: each seat's net score for the hand plus the flat
 *  penalties applied that hand (by type), for the score-table view. */
export interface HandRecord {
  handNo: number
  deltas: number[] // net score per seat for this hand
  penalties: { seat: number; type: string }[] // flat penalties applied this hand
  winnerSeat?: number
  winType?: 'perOnly' | 'pairs'
  reason?: 'win' | 'exhausted' | 'hand-void'
}

export function applyHandScore(prev: number[], deltas: number[]): number[] {
  if (prev.length !== deltas.length) {
    throw new Error(`applyHandScore: length mismatch (${prev.length} vs ${deltas.length})`)
  }
  return prev.map((v, i) => v + deltas[i]!)
}
