import type { Tile } from './tile'
import type { VariantConfig } from './config'
import type { WinKind } from './evaluator'

export type Phase = 'DRAW' | 'DISCARD'

/** State captured just before a player's FIRST open of a turn, so the open can be
 *  retracted ("Taşları Geri Al") any time before that turn's discard. Lives on the
 *  turn, so it vanishes the moment the turn advances — an open+discard is final. */
export interface OpenSnapshot {
  rack: Tile[]
  hasOpened: boolean
  openRoute?: 'seri' | 'cift'
  openedValue?: number
  declaredCift?: boolean
  tableMelds: { owner: number; kind: 'run' | 'group' | 'pair'; tiles: Tile[] }[]
  penaltiesApplied: { seat: number; type: string }[]
}

export interface TurnState {
  seat: number
  phase: Phase
  /** Set to true when the player took the left neighbour's top discard tile this turn. */
  tookFromLeft?: boolean
  /** The exact tile taken from the floor this turn (so it can be returned if the
   *  non-çift taker can't open). Set together with tookFromLeft. */
  floorTileTaken?: Tile
  /** Pre-open snapshot for retracting THIS turn's open (cleared when the turn ends). */
  openSnapshot?: OpenSnapshot
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
  /** A çift-declarer who took a floor tile but DEFERRED opening carries the pending
   *  işlek penalty here (the fed seat). It lands when they finally open — a çift
   *  route lets the take + open span different turns, unlike a seri taker. */
  pendingIslekSeat?: number
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

/**
 * Eşli (team) mode — fixed karşılıklı (across-the-table) partnership: seats 0 & 2
 * are one team, 1 & 3 the other. The partner sits opposite (seat + 2), so a player's
 * adjacent neighbours (the feeder/taker of a floor tile) are ALWAYS opponents.
 */
export function partnerOf(seat: number, players: number): number {
  return (seat + Math.floor(players / 2)) % players
}

/** Team id (0 or 1) for `seat` — even seats vs odd seats. */
export function teamOf(seat: number): number {
  return seat % 2
}
