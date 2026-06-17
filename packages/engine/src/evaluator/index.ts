import type { Tile } from '../tile'
import { tilesEqual } from '../tile'
import type { VariantConfig } from '../config'
import { canCoverInMelds } from './melds'
import { canFormPairs } from './pairs'

export type WinKind = 'perOnly' | 'pairs'
export interface WinResult { isWinning: boolean; winKind?: WinKind }

export function effectiveWilds(rack: Tile[], okey: Tile): number {
  let w = 0
  for (const t of rack) {
    if (t.kind === 'FALSE_JOKER') w++
    else if (tilesEqual(t, okey)) w++
  }
  return w
}

function nonWildTiles(rack: Tile[], okey: Tile): Tile[] {
  return rack.filter((t) => t.kind !== 'FALSE_JOKER' && !tilesEqual(t, okey))
}

export function evaluateHand(rack: Tile[], okey: Tile, config: VariantConfig): WinResult {
  const wilds = effectiveWilds(rack, okey)
  const nonWild = nonWildTiles(rack, okey)
  if (canCoverInMelds(nonWild, wilds, config)) return { isWinning: true, winKind: 'perOnly' }
  if (config.allowPairsWin && canFormPairs(nonWild, wilds)) return { isWinning: true, winKind: 'pairs' }
  return { isWinning: false }
}
