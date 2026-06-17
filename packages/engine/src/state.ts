import type { Tile } from './tile'
import type { VariantConfig } from './config'
import type { WinKind } from './evaluator'

export type Phase = 'DRAW' | 'DISCARD'

export interface TurnState {
  seat: number
  phase: Phase
  /** Set to true when the player took the left neighbour's top discard tile this turn. */
  tookFromLeft?: boolean
}

export interface PlayerState {
  seat: number
  rack: Tile[]
  discard: Tile[]
  hasOpened: boolean
  isOut: boolean
  declaredCift?: boolean
  openedValue?: number
  /** Set when a çift-declarer takes a floor tile and may defer opening to a later turn.
   *  Holds the seat number of the left neighbour (discarder) who should be penalised
   *  when this player eventually calls OpenMeld. Cleared once the penalty is applied. */
  pendingIslekFromSeat?: number
}

export interface Terminal {
  reason: 'win' | 'hand-void' | 'exhausted'
  winnerSeat?: number
  winType?: WinKind
  finishingTile?: Tile
}

export interface GameState {
  gameId: string
  config: VariantConfig
  rngSeed: number
  handNo: number
  stock: Tile[]
  indicator?: Tile
  okey?: Tile
  turn: TurnState
  players: PlayerState[]
  scores: number[]
  status: 'CREATED' | 'DEALT' | 'PLAYING' | 'ENDED'
  terminal?: Terminal
  tableMelds?: { owner: number; kind: 'run' | 'group'; tiles: Tile[] }[]
  rizikoActive?: boolean
  penaltiesApplied?: { seat: number; type: string }[]
}

export function nextSeat(seat: number, players: number): number {
  return (seat + 1) % players
}

export function leftSeat(seat: number, players: number): number {
  return (seat - 1 + players) % players
}
