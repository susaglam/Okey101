import type { GameState } from '../state'
import { partnerOf, teamOf } from '../state'
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
 * Sum of face values of a rack's leftover tiles, EXCLUDING the real okey.
 * A held okey is charged separately as a flat +101 "okey-held" penalty (see
 * okeyHeldPenalties), so it must not also be counted (and ×-multiplied) here.
 * FALSE_JOKER stays in the sum (its fixed face value = okey's number).
 */
function leftoverSum(rack: Tile[], okey: Tile | undefined): number {
  return rack.reduce((acc, t) => {
    if (okey != null && t.kind === 'NUMBER' && tilesEqual(t, okey)) return acc // real okey → okey-held
    return acc + tileValue(t, okey)
  }, 0)
}

/**
 * Flat "okey-held" penalties for an ended hand: an OPENED non-finisher who still
 * holds the real okey pays a flat +101 per okey held (PO 2026-06-22). A player who
 * NEVER opened pays nothing extra for holding the okey (they already pay the flat
 * never-opened base). The finisher's rack is empty, so they're never charged.
 * Exposed so the score table can show it as a distinct line, and so scoreHand101
 * and the match history agree.
 */
export function okeyHeldPenalties(state: GameState): { seat: number; type: string }[] {
  const okey = state.okey
  const term = state.terminal
  if (!term || okey == null) return []
  const winnerSeat = term.reason === 'win' && term.winnerSeat != null ? term.winnerSeat : -1
  const out: { seat: number; type: string }[] = []
  for (let seat = 0; seat < state.config.players; seat++) {
    if (seat === winnerSeat) continue
    const p = state.players[seat]!
    if (p.hasOpened !== true) continue
    for (const t of p.rack) {
      if (t.kind === 'NUMBER' && tilesEqual(t, okey)) out.push({ seat, type: 'okey-held' })
    }
  }
  return out
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
      // Çift binding: declaring çift OR opening via the pairs route (openRoute='cift')
      // both lock you into çift scoring (2× leftover) — you can't dodge it by simply
      // not saying "çifte gidiyorum" (PO 2026-06-22).
      const cift = player.declaredCift === true || player.openRoute === 'cift'
      const m = finishMultiplier * riziko

      if (cift && !opened) {
        // Çift declared, never opened: 2 × 202
        deltas[seat] = 2 * 202 * m
      } else if (cift && opened) {
        // Çift (declared or opened-via-pairs), opened but didn't finish: 2 × leftover
        deltas[seat] = 2 * leftoverSum(player.rack, okey) * m
      } else if (opened) {
        // Opened non-finisher: leftover (okey excluded → charged flat below)
        deltas[seat] = leftoverSum(player.rack, okey) * m
      } else {
        // Never-opened, no çift: 202
        deltas[seat] = 202 * m
      }
    }
  }

  // Eşli (team) mode — partner waiver: when a player finishes, their PARTNER's
  // leftover (base) score is waived ("eşi bittiği için sayıları sayılmaz"). This
  // zeroes ONLY the base computed above; flat penalties below still stick
  // ("cezalar hariç, cezalar aynen devam eder"). The finisher keeps their credit.
  if (state.config.teamMode === true && hasFinisher) {
    const partner = partnerOf(winnerSeat, n)
    if (partner !== winnerSeat) deltas[partner] = 0
  }

  // Apply flat penalties (NOT multiplied by anything).
  const penalties = state.penaltiesApplied ?? []
  for (const { seat } of penalties) {
    if (seat >= 0 && seat < n) {
      deltas[seat] = (deltas[seat] ?? 0) + 101
    }
  }

  // Okey-held penalty (flat +101, NEVER multiplied): an opened non-finisher who
  // still holds the real okey. Applies on a finish AND on exhaustion. The okey is
  // excluded from leftoverSum above, so this is the ONLY place it's charged.
  for (const { seat } of okeyHeldPenalties(state)) {
    deltas[seat] = (deltas[seat] ?? 0) + 101
  }

  return deltas
}

/**
 * Aggregate a per-seat score array into the two eşli-mode team totals
 * [team0 (seats 0,2…), team1 (seats 1,3…)]. Works on a single hand's deltas OR on
 * cumulative match standings. Each player still keeps their own row; this is only
 * the combined figure the score table and match winner use in team mode.
 */
export function teamScores(perSeat: number[]): [number, number] {
  let team0 = 0
  let team1 = 0
  perSeat.forEach((v, seat) => {
    if (teamOf(seat) === 0) team0 += v
    else team1 += v
  })
  return [team0, team1]
}
