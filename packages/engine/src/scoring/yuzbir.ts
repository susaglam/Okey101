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
 * Finish-type multiplier — applies to EVERY player's amount (finisher AND the
 * non-finishers' leftover), because "the winner finished with okey/çift, so the
 * whole table pays at that multiplier":
 *   - okey-finish (finishingTile === okey) → ×2
 *   - çift finish (winType === 'pairs') → ×2
 *   - both → ×4
 *   (No finisher / exhaustion → ×1.)
 *
 * Riziko multiplier (×2, orthogonal) and the finish multiplier MULTIPLY together
 * for both the finisher credit and the non-finisher amounts. NOT applied to flat
 * penalties.
 *
 * Per-seat (m = finishMultiplier × riziko):
 *   - finisher:                 −101 × m
 *   - hasOpened, not çift:      +rackSum × m
 *   - !hasOpened, not çift:     +202 × m
 *   - declaredCift && !opened:  +2×202 × m
 *   - declaredCift && opened:   +2×rackSum × m
 *
 * e.g. çift+okey finish (×4): finisher −404, never-opened +808, opened-55 +220.
 *
 * Flat penalties (from state.penaltiesApplied): +101 each. NEVER multiplied.
 *
 * Exhaustion (reason === 'exhausted'): no finisher; finishMultiplier = 1.
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
      // The FINISH multiplier (okey ×2 / çift ×2 / both ×4) now applies to the
      // non-finishers' amounts TOO — "I finished with the okey, so everyone pays
      // double their leftover" (PO 2026-06-21). On exhaustion there is no finisher
      // so finishMultiplier === 1 and amounts are unchanged.
      const opened = player.hasOpened === true
      const cift = player.declaredCift === true
      const m = finishMultiplier * riziko

      if (cift && !opened) {
        // Çift declared, never opened: 2 × 202
        deltas[seat] = 2 * 202 * m
      } else if (cift && opened) {
        // Çift declared, opened but didn't finish: 2 × rackSum
        deltas[seat] = 2 * rackSum(player.rack, okey) * m
      } else if (opened) {
        // Opened non-finisher: rackSum
        deltas[seat] = rackSum(player.rack, okey) * m
      } else {
        // Never-opened, no çift: 202
        deltas[seat] = 202 * m
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
