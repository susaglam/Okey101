import type { Tile } from './tile'
import type { VariantConfig } from './config'

export type GameEvent =
  | { type: 'CreateGame'; gameId: string; seed: number; config: VariantConfig }
  | { type: 'StartHand' }
  | { type: 'DrawFromStock'; seat: number }
  | { type: 'DrawFromDiscard'; seat: number }
  | { type: 'Discard'; seat: number; tile: Tile }
  | { type: 'DeclareWin'; seat: number; discardTile: Tile }
  | { type: 'DeclareCift'; seat: number }
  | { type: 'OpenMeld'; seat: number; melds: Tile[][] }
  | { type: 'LayOff'; seat: number; meldIndex: number; tiles: Tile[] }
  // Take the okey out of a table meld by inserting the real tile it represents.
  // The okey returns to the player's rack (it is NOT auto-reused). `tile` is the
  // real rack tile to put in the okey's place.
  | { type: 'TakeOkey'; seat: number; meldIndex: number; tile: Tile }
