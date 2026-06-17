// packages/app/src/match.ts

export interface MatchState {
  handNo: number
  totalHands: number
  standings: number[]
  over: boolean
}

export function applyHandScore(prev: number[], deltas: number[]): number[] {
  if (prev.length !== deltas.length) {
    throw new Error(`applyHandScore: length mismatch (${prev.length} vs ${deltas.length})`)
  }
  return prev.map((v, i) => v + deltas[i]!)
}
