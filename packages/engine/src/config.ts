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
  requiresOpening?: boolean
  openingThreshold?: number
  pairsOpenCount?: number
  layOff?: boolean
  layOffCapPerRun?: number
  penaltyRepeatable?: boolean
  mustRetainFinishingTile?: boolean
  matchHands?: number
  scoringModel?: 'klasik-flat' | 'yuzbir-penalty'
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
  requiresOpening: false,
  openingThreshold: 0,
  pairsOpenCount: 7,
  layOff: false,
  layOffCapPerRun: 0,
  penaltyRepeatable: false,
  mustRetainFinishingTile: true,
  matchHands: 5,
  scoringModel: 'klasik-flat',
}

export const KLASIK_101: VariantConfig = {
  colors: ['RED', 'BLACK', 'BLUE', 'YELLOW'],
  tilesPerColor: 13,
  copies: 2,
  falseJokers: 2,
  players: 4,
  tilesInRack: 21,
  starterExtra: 1,
  runWrap13to1: false,
  allowPairsWin: true,
  requiresOpening: true,
  openingThreshold: 101,
  pairsOpenCount: 5,
  layOff: true,
  layOffCapPerRun: 2,
  penaltyRepeatable: false,
  mustRetainFinishingTile: true,
  matchHands: 11,
  scoringModel: 'yuzbir-penalty',
}
