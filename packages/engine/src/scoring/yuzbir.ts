import type { GameState } from '../state'
import type { Tile } from '../tile'
import { tilesEqual } from '../tile'

/**
 * Face value of a tile in the 101 scoring context (leftover-sum penalty).
 * - Real okey tile (kind NUMBER, equals okey): flat 101 (it is the precious wild).
 * - FALSE_JOKER (♣): plain tile fixed to okey's face value (e.g. 8 when okey=8K).
 *   If okey is somehow undefined, fall back to 0.
 * - Normal NUMBER tile: its number.
 */
function tileValue(tile: Tile, okey: Tile | undefined): number {
  if (tile.kind === 'FALSE_JOKER') return okey?.number ?? 0
  if (okey != null && tilesEqual(tile, okey)) return 101
  return tile.number ?? 0
}

/**
 * Sum of face values of all tiles in a rack.
 */
function rackSum(rack: Tile[], okey: Tile | undefined): number {
  return rack.reduce((acc, t) => acc + tileValue(t, okey), 0)
}

/**
 * scoreHand101 — per-seat deltas for an ended 101 hand.
 *
 * Negative delta = credit (good for finisher).
 * Positive delta = penalty (bad).
 *
 * Rules (PO-approved):
 *
 * Finish-type multiplier (applies ONLY to finisher's base −101):
 *   - okey-finish (finishingTile === okey) → ×2
 *   - çift finish (winType === 'pairs') → ×2
 *   - both → ×4
 *
 * Riziko multiplier (×2, orthogonal to finish-type):
 *   Applied to: finisher credit, non-finisher ladder amounts (face-sum, +202).
 *   NOT applied to: flat penalties.
 *
 * Non-finisher base (before riziko):
 *   - hasOpened, not çift: +rackSum (×2 if riziko)
 *   - !hasOpened, not çift: +202 (×2 if riziko = +404)
 *   - declaredCift && !hasOpened: 2×202 = +404 (×2 if riziko = +808)
 *   - declaredCift && hasOpened: 2×rackSum (×2 if riziko = 4×sum)
 *
 * Flat penalties (from state.penaltiesApplied):
 *   Each entry adds +101 to that seat. NEVER multiplied.
 *
 * Exhaustion (reason === 'exhausted'): no finisher; everyone pays non-finisher rules.
 */
export function scoreHand101(state: GameState): number[] {
  const n = state.config.players
  const deltas = Array.from({ length: n }, () => 0)

  const term = state.terminal
  if (!term) return deltas

  const okey = state.okey
  const riziko = state.rizikoActive === true ? 2 : 1

  // Determine if this hand has a finisher.
  const hasFinisher = term.reason === 'win' && term.winnerSeat != null
  const winnerSeat = hasFinisher ? term.winnerSeat! : -1

  // Finish-type multiplier (only relevant when there is a finisher).
  let finishMultiplier = 1
  if (hasFinisher) {
    const isCift = term.winType === 'pairs'
    const isOkeyFinish =
      term.finishingTile != null && okey != null && tilesEqual(term.finishingTile, okey)
    if (isCift && isOkeyFinish) {
      finishMultiplier = 4
    } else if (isCift || isOkeyFinish) {
      finishMultiplier = 2
    }
  }

  // Compute base delta for each seat (before flat penalties).
  for (let seat = 0; seat < n; seat++) {
    const player = state.players[seat]!

    if (hasFinisher && seat === winnerSeat) {
      // Finisher: −101 × finishMultiplier × riziko
      deltas[seat] = -101 * finishMultiplier * riziko
    } else {
      // Non-finisher (or exhaustion — all seats are non-finishers).
      const opened = player.hasOpened === true
      const cift = player.declaredCift === true

      if (cift && !opened) {
        // Çift declared, never opened: 2 × 202, then × riziko
        deltas[seat] = 2 * 202 * riziko
      } else if (cift && opened) {
        // Çift declared, opened but didn't finish: 2 × rackSum, then × riziko
        const sum = rackSum(player.rack, okey)
        deltas[seat] = 2 * sum * riziko
      } else if (opened) {
        // Opened non-finisher: rackSum × riziko
        const sum = rackSum(player.rack, okey)
        deltas[seat] = sum * riziko
      } else {
        // Never-opened, no çift: 202 × riziko
        deltas[seat] = 202 * riziko
      }
    }
  }

  // Apply flat penalties (NOT multiplied by anything).
  const penalties = state.penaltiesApplied ?? []
  for (const { seat } of penalties) {
    if (seat >= 0 && seat < n) {
      deltas[seat] = (deltas[seat] ?? 0) + 101
    }
  }

  return deltas
}
