import type { TileColor } from './tile'

export interface VariantConfig {
  colors: TileColor[]
  tilesPerColor: number
  copies: number
  falseJokers: number
  players: number
  tilesInRack: number   // tiles per player after deal (non-starter)
  starterExtra: number  // extra tiles for the starter (gets tilesInRack + starterExtra)
  runWrap13to1: boolean
  allowPairsWin: boolean
}

export const KLASIK: VariantConfig = {
  colors: ['RED', 'BLACK', 'BLUE', 'YELLOW'],
  tilesPerColor: 13,
  copies: 2,
  falseJokers: 2,
  players: 4,
  tilesInRack: 14,
  starterExtra: 1,
  runWrap13to1: true,
  allowPairsWin: true,
}
