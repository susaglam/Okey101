import type { Tile } from '../tile'
import { tilesEqual } from '../tile'
import type { VariantConfig } from '../config'
import { canCoverInMelds } from './melds'
import { canFormPairs } from './pairs'

export type WinKind = 'perOnly' | 'pairs'
export interface WinResult { isWinning: boolean; winKind?: WinKind }

/**
 * A tile is wild only if it is a real NUMBER tile whose number+color matches okey.
 * FALSE_JOKER is NOT wild — it is a plain tile fixed to okey's value.
 */
function isWild(t: Tile, okey: Tile): boolean {
  return t.kind === 'NUMBER' && tilesEqual(t, okey)
}

/**
 * Count effective wilds: only real NUMBER tiles equal to okey are wild.
 * FALSE_JOKER tiles are NOT counted as wilds — they are plain tiles fixed
 * to okey's concrete value (number+color) and can only act as that specific tile.
 */
export function effectiveWilds(rack: Tile[], okey: Tile): number {
  let w = 0
  for (const t of rack) {
    if (isWild(t, okey)) w++
  }
  return w
}

/**
 * Return rack tiles that are not wild, for meld-cover analysis.
 * - Real NUMBER tiles equal to okey → excluded (they are wilds).
 * - FALSE_JOKER tiles → included as a concrete NUMBER tile equal to okey's
 *   number+color. They are PLAIN tiles (not wilds) that can only act as
 *   that specific value in melds.
 * - All other NUMBER tiles → included as-is.
 */
function nonWildTiles(rack: Tile[], okey: Tile): Tile[] {
  const result: Tile[] = []
  for (const t of rack) {
    if (t.kind === 'FALSE_JOKER') {
      // Concrete plain tile fixed to okey's value — not a wild
      result.push({ kind: 'NUMBER', number: okey.number, color: okey.color })
    } else if (!isWild(t, okey)) {
      result.push(t)
    }
    // Real NUMBER tiles matching okey are wild → excluded here, counted by effectiveWilds
  }
  return result
}

export function evaluateHand(rack: Tile[], okey: Tile, config: VariantConfig): WinResult {
  const wilds = effectiveWilds(rack, okey)
  const nonWild = nonWildTiles(rack, okey)
  if (canCoverInMelds(nonWild, wilds, config)) return { isWinning: true, winKind: 'perOnly' }
  if (config.allowPairsWin && canFormPairs(nonWild, wilds)) return { isWinning: true, winKind: 'pairs' }
  return { isWinning: false }
}
