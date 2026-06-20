import type { Tile } from './tile'
import type { VariantConfig } from './config'
import type { WinKind } from './evaluator'

export type Phase = 'DRAW' | 'DISCARD'

export interface TurnState {
  seat: number
  phase: Phase
  /** Set to true when the player took the left neighbour's top discard tile this turn. */
  tookFromLeft?: boolean
  /** The exact tile taken from the floor this turn (so it can be returned if the
   *  non-çift taker can't open). Set together with tookFromLeft. */
  floorTileTaken?: Tile
}

export interface PlayerState {
  seat: number
  rack: Tile[]
  discard: Tile[]
  hasOpened: boolean
  isOut: boolean
  declaredCift?: boolean
  openedValue?: number
  /** Tracks which opening route the player used. Set on first OpenMeld.
   *  'seri' = opened via runs/groups (≥101 total value route).
   *  'cift' = opened via 5 identical pairs route.
   *  Governs which subsequent meld-laying is allowed. */
  openRoute?: 'seri' | 'cift'
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
  tableMelds?: { owner: number; kind: 'run' | 'group' | 'pair'; tiles: Tile[] }[]
  rizikoActive?: boolean
  penaltiesApplied?: { seat: number; type: string }[]
}

export function nextSeat(seat: number, players: number): number {
  return (seat + 1) % players
}

export function leftSeat(seat: number, players: number): number {
  return (seat - 1 + players) % players
}
