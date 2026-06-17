import type { Tile } from './tile'
import type { VariantConfig } from './config'

export type GameEvent =
  | { type: 'CreateGame'; gameId: string; seed: number; config: VariantConfig }
  | { type: 'StartHand' }
  | { type: 'DrawFromStock'; seat: number }
  | { type: 'DrawFromDiscard'; seat: number }
  | { type: 'Discard'; seat: number; tile: Tile }
  | { type: 'DeclareWin'; seat: number; discardTile: Tile }
