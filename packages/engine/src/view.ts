import type { GameState, PlayerState, Phase, Terminal } from './state'
import type { Tile } from './tile'
import type { VariantConfig } from './config'

export interface OpponentView {
  seat: number
  rackCount: number
  discardTop?: Tile
  discardCount: number
  hasOpened: boolean
}

export interface PlayerView {
  seat: number
  config: VariantConfig
  handNo: number
  you: PlayerState
  opponents: OpponentView[]
  stockCount: number
  indicator?: Tile
  okey?: Tile
  // tookFromLeft is public (taking the floor is an observable move); the UI uses
  // it to offer "return the floor tile" to a non-çift taker who can't open.
  turn: { seat: number; phase: Phase; tookFromLeft?: boolean }
  scores: number[]
  status: GameState['status']
  terminal?: Terminal
  tableMelds: { owner: number; kind: 'run' | 'group' | 'pair'; tiles: Tile[] }[]
  rizikoActive: boolean
  version: number
}

export function redactFor(state: GameState, seat: number, version: number): PlayerView {
  const you = state.players.find((p) => p.seat === seat)
  if (!you) throw new Error(`No player at seat ${seat}`)
  const opponents: OpponentView[] = state.players
    .filter((p) => p.seat !== seat)
    .map((p) => ({
      seat: p.seat,
      rackCount: p.rack.length,
      discardTop: p.discard.length ? p.discard[p.discard.length - 1] : undefined,
      discardCount: p.discard.length,
      hasOpened: p.hasOpened,
    }))
  return {
    seat, config: state.config, handNo: state.handNo,
    you: { ...you, rack: you.rack.slice(), discard: you.discard.slice() },
    opponents,
    stockCount: state.stock.length,
    indicator: state.indicator, okey: state.okey,
    turn: state.turn, scores: state.scores.slice(), status: state.status,
    terminal: state.terminal,
    tableMelds: state.tableMelds ?? [],
    rizikoActive: state.rizikoActive ?? false,
    version,
  }
}
