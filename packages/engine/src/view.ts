import type { GameState, PlayerState, Phase, Terminal } from './state'
import type { Tile } from './tile'
import type { VariantConfig } from './config'

export interface OpponentView {
  seat: number
  rackCount: number
  discardTop?: Tile
  discardCount: number
  hasOpened: boolean
  /** Public once opened: the first-open value and route (for the centre badges). */
  openedValue?: number
  openRoute?: 'seri' | 'cift'
  declaredCift?: boolean
  /** Flat penalties applied to this seat THIS hand (işlek, okey-discard, …). */
  penalties: number
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
  // it to offer "return the floor tile". floorTileTaken is the exact tile taken (it
  // came off a public discard pile) — used by the bot to satisfy the "use it or
  // return it" rule. canRetract: the current seat opened THIS turn (pre-discard).
  turn: { seat: number; phase: Phase; tookFromLeft?: boolean; floorTileTaken?: Tile; canRetract?: boolean }
  scores: number[]
  status: GameState['status']
  terminal?: Terminal
  tableMelds: { owner: number; kind: 'run' | 'group' | 'pair'; tiles: Tile[] }[]
  rizikoActive: boolean
  /** Flat penalty count per seat (index = seat) applied THIS hand. */
  penalties: number[]
  /** Per-penalty detail applied THIS hand (seat + type + the tile that caused it) —
   *  public info (the discarded/fed tile is observable), used for the penalty audit log. */
  penaltyLog?: { seat: number; type: string; tile?: Tile }[]
  version: number
}

export function redactFor(state: GameState, seat: number, version: number): PlayerView {
  const you = state.players.find((p) => p.seat === seat)
  if (!you) throw new Error(`No player at seat ${seat}`)
  const applied = state.penaltiesApplied ?? []
  const penaltyCount = (s: number) => applied.reduce((acc, p) => (p.seat === s ? acc + 1 : acc), 0)
  const opponents: OpponentView[] = state.players
    .filter((p) => p.seat !== seat)
    .map((p) => ({
      seat: p.seat,
      rackCount: p.rack.length,
      discardTop: p.discard.length ? p.discard[p.discard.length - 1] : undefined,
      discardCount: p.discard.length,
      hasOpened: p.hasOpened,
      openedValue: p.openedValue,
      openRoute: p.openRoute,
      declaredCift: p.declaredCift,
      penalties: penaltyCount(p.seat),
    }))
  return {
    seat, config: state.config, handNo: state.handNo,
    you: { ...you, rack: you.rack.slice(), discard: you.discard.slice() },
    opponents,
    stockCount: state.stock.length,
    indicator: state.indicator, okey: state.okey,
    // Redact the turn: expose only public fields (never the openSnapshot, which
    // holds the opener's rack) and a boolean canRetract derived from it.
    turn: {
      seat: state.turn.seat,
      phase: state.turn.phase,
      tookFromLeft: state.turn.tookFromLeft,
      floorTileTaken: state.turn.floorTileTaken,
      canRetract: state.turn.openSnapshot != null ? true : undefined,
    },
    scores: state.scores.slice(), status: state.status,
    terminal: state.terminal,
    tableMelds: state.tableMelds ?? [],
    rizikoActive: state.rizikoActive ?? false,
    penalties: Array.from({ length: state.config.players }, (_, s) => penaltyCount(s)),
    penaltyLog: applied.map((p) => ({ seat: p.seat, type: p.type, tile: p.tile })),
    version,
  }
}
