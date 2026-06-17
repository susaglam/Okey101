import type { Tile } from './tile'
import type { VariantConfig } from './config'
import type { WinKind } from './evaluator'

export type Phase = 'DRAW' | 'DISCARD'

export interface PlayerState {
  seat: number
  rack: Tile[]
  discard: Tile[]
  hasOpened: boolean
  isOut: boolean
}

export interface Terminal {
  reason: 'win' | 'hand-void'
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
  turn: { seat: number; phase: Phase }
  players: PlayerState[]
  scores: number[]
  status: 'CREATED' | 'DEALT' | 'PLAYING' | 'ENDED'
  terminal?: Terminal
}

export function nextSeat(seat: number, players: number): number {
  return (seat + 1) % players
}

export function leftSeat(seat: number, players: number): number {
  return (seat - 1 + players) % players
}
