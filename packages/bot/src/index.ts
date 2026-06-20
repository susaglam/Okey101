import { evaluateHand, findOpening, findLayableMeld, findPairOpening, findLayablePairs, tilesEqual, type PlayerView, type GameEvent, type Tile } from '@cs-okey/engine'

export function decide(view: PlayerView, legal: GameEvent['type'][], rng: () => number): GameEvent {
  const seat = view.seat
  const rack = view.you.rack

  // ── DRAW phase (same logic for Klasik and 101) ───────────────────────────────
  if (view.turn.phase === 'DRAW') {
    // Prefer the left discard only if it pairs with or sequences a tile we already hold.
    if (legal.includes('DrawFromDiscard')) {
      const left = view.opponents.find((o) => o.seat === leftSeatOf(seat, view))
      const top = left?.discardTop
      if (top && top.kind === 'NUMBER' && isUseful(top, rack)) {
        // Kural 11: a non-çift, not-yet-opened player who takes the floor MUST open
        // this turn (else they must return it). So only take if it enables an open
        // — otherwise stay on the stock and avoid the dead end (and a stalled turn).
        const mustOpenToTake = view.config.requiresOpening && !view.you.hasOpened && !view.you.declaredCift
        const canOpenWithFloor = !mustOpenToTake
          || findOpening([...rack, top], view.okey!, view.config) !== null
          || findPairOpening([...rack, top], view.okey!, view.config) !== null
        if (canOpenWithFloor) return { type: 'DrawFromDiscard', seat }
      }
    }
    return { type: 'DrawFromStock', seat }
  }

  // ── DISCARD phase ─────────────────────────────────────────────────────────────

  if (view.config.requiresOpening) {
    // ── 101 branch ──────────────────────────────────────────────────────────────

    // 1. DeclareWin: only if already opened and a winning discard exists.
    if (legal.includes('DeclareWin') && view.you.hasOpened) {
      for (let i = 0; i < rack.length; i++) {
        const rest = rack.filter((_, j) => j !== i)
        if (evaluateHand(rest, view.okey!, view.config).isWinning) {
          return { type: 'DeclareWin', seat, discardTile: rack[i]! }
        }
      }
    }

    // 2. OpenMeld: if not yet opened, open via the seri route (≥101) if possible,
    //    otherwise fall back to the çift route (5 identical pairs).
    if (!view.you.hasOpened && legal.includes('OpenMeld')) {
      const opening = findOpening(rack, view.okey!, view.config)
      if (opening !== null) {
        return { type: 'OpenMeld', seat, melds: opening }
      }
      const pairOpening = findPairOpening(rack, view.okey!, view.config)
      if (pairOpening !== null) {
        return { type: 'OpenMeld', seat, melds: pairOpening }
      }
    }

    // 3. OpenMeld (post-opening): lay a new meld from the rack — pairs on the çift
    //    route, runs/groups on the seri route (matches the binding open route).
    //    Always keep >=1 tile so the engine's finish-protection doesn't reject the
    //    move (a rejected bot move would stall the turn).
    if (view.you.hasOpened && legal.includes('OpenMeld')) {
      if (view.you.openRoute === 'cift') {
        const pairs = findLayablePairs(rack, view.okey!, view.config)
        if (pairs !== null && pairs.length > 0) {
          const maxPairs = Math.floor((rack.length - 1) / 2) // keep >=1 tile to discard
          const toLay = pairs.slice(0, Math.min(pairs.length, maxPairs))
          if (toLay.length > 0) {
            return { type: 'OpenMeld', seat, melds: toLay }
          }
        }
      } else {
        const layable = findLayableMeld(rack, view.okey!, view.config)
        if (layable !== null && rack.length - layable.length >= 1) {
          return { type: 'OpenMeld', seat, melds: [layable] }
        }
      }
    }

    // 4. LayOff: if already opened, try to extend a table meld with one rack tile.
    //    Keep at least 2 tiles so the lay-off leaves >=1 to discard as the
    //    finishing move (the engine rejects a lay-off that empties the rack).
    if (view.you.hasOpened && legal.includes('LayOff') && rack.length > 1) {
      const layOff = findLayOff(rack, view.tableMelds, view.okey!)
      if (layOff !== null) {
        return { type: 'LayOff', seat, meldIndex: layOff.meldIndex, tiles: [layOff.tile] }
      }
    }

    // 5. Fall through: discard least-useful.
    const idx = leastUsefulIndex(rack, view.okey, rng)
    return { type: 'Discard', seat, tile: rack[idx]! }
  }

  // ── Klasik branch (unchanged) ─────────────────────────────────────────────────
  if (legal.includes('DeclareWin')) {
    for (let i = 0; i < rack.length; i++) {
      const rest = rack.filter((_, j) => j !== i)
      if (evaluateHand(rest, view.okey!, view.config).isWinning) {
        return { type: 'DeclareWin', seat, discardTile: rack[i]! }
      }
    }
  }
  // Otherwise discard the least useful tile.
  const idx = leastUsefulIndex(rack, view.okey, rng)
  return { type: 'Discard', seat, tile: rack[idx]! }
}

// ── LayOff helper ─────────────────────────────────────────────────────────────

interface LayOffResult { meldIndex: number; tile: Tile }

/**
 * Find the first rack tile that legally extends one of the table melds.
 * For a run: the tile continues the sequence at either end.
 * For a group: the tile shares the same number with a new color.
 * Returns the first match found, or null.
 */
function findLayOff(
  rack: Tile[],
  tableMelds: PlayerView['tableMelds'],
  okey: Tile,
): LayOffResult | null {
  for (let mi = 0; mi < tableMelds.length; mi++) {
    const meld = tableMelds[mi]!
    // Pair (çift-route) melds can't be extended by a lay-off — merging a tile
    // would form an invalid meld and the engine would reject it (stalling the bot).
    if (meld.kind === 'pair') continue
    for (const tile of rack) {
      if (tile.kind !== 'NUMBER') continue
      if (canExtendMeld(tile, meld, okey)) {
        return { meldIndex: mi, tile }
      }
    }
  }
  return null
}

function canExtendMeld(
  tile: Tile,
  meld: PlayerView['tableMelds'][number],
  okey: Tile,
): boolean {
  if (tile.kind !== 'NUMBER' || tile.number == null || tile.color == null) return false

  if (meld.kind === 'run') {
    return canExtendRun(tile, meld.tiles, okey)
  } else {
    return canExtendGroup(tile, meld.tiles, okey)
  }
}

/**
 * Return the effective {number, color} of a tile:
 * - FALSE_JOKER → okey's {number, color} (plain tile fixed to okey's value)
 * - NUMBER tile → its own {number, color}
 * Returns null if the tile lacks number/color.
 */
function tileEffectiveValue(t: Tile, okey: Tile): { number: number; color: string } | null {
  if (t.kind === 'FALSE_JOKER') {
    if (okey.number == null || okey.color == null) return null
    return { number: okey.number, color: okey.color }
  }
  if (t.number == null || t.color == null) return null
  return { number: t.number, color: t.color }
}

/**
 * A tile is wild only if it is a real NUMBER tile whose number+color matches okey.
 */
function isTileWild(t: Tile, okey: Tile): boolean {
  return t.kind === 'NUMBER' && tilesEqual(t, okey)
}

function canExtendRun(tile: Tile, meldTiles: Tile[], okey: Tile): boolean {
  if (tile.kind !== 'NUMBER' || tile.number == null || tile.color == null) return false

  // Find the run's color and number range (ignoring wilds, using effective values for FALSE_JOKER)
  // Only real NUMBER tiles equal to okey are wild; FALSE_JOKER is a plain tile with okey's value.
  const nonWildEvs = meldTiles
    .filter((t) => !isTileWild(t, okey))
    .map((t) => tileEffectiveValue(t, okey))
    .filter((v): v is { number: number; color: string } => v !== null)
  if (nonWildEvs.length === 0) return false

  // All non-wild tiles in a run must be same color
  const runColor = nonWildEvs[0]!.color
  if (tile.color !== runColor) return false

  const nums = nonWildEvs.map((v) => v.number).sort((a, b) => a - b)
  const minNum = nums[0]!
  const maxNum = nums[nums.length - 1]!

  // Extend at left end: tile.number === minNum - 1
  // Extend at right end: tile.number === maxNum + 1
  return tile.number === minNum - 1 || tile.number === maxNum + 1
}

function canExtendGroup(tile: Tile, meldTiles: Tile[], okey: Tile): boolean {
  if (tile.kind !== 'NUMBER' || tile.number == null || tile.color == null) return false

  // Group: same number, distinct colors, max 4 tiles
  if (meldTiles.length >= 4) return false // already full group

  // Only real NUMBER tiles equal to okey are wild; FALSE_JOKER is a plain tile with okey's value.
  const nonWildEvs = meldTiles
    .filter((t) => !isTileWild(t, okey))
    .map((t) => tileEffectiveValue(t, okey))
    .filter((v): v is { number: number; color: string } => v !== null)
  if (nonWildEvs.length === 0) return false

  const groupNumber = nonWildEvs[0]!.number
  if (tile.number !== groupNumber) return false

  // Tile color must not already appear in the group
  const existingColors = new Set(nonWildEvs.map((v) => v.color))
  return !existingColors.has(tile.color)
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function leftSeatOf(seat: number, view: PlayerView): number {
  return (seat - 1 + view.config.players) % view.config.players
}

function isUseful(t: Tile, rack: Tile[]): boolean {
  return rack.some((r) =>
    r.kind === 'NUMBER' && t.kind === 'NUMBER' && (
      (r.number === t.number && r.color !== t.color) ||           // group potential
      (r.color === t.color && Math.abs((r.number ?? 0) - (t.number ?? 0)) <= 2) // run potential
    ))
}

/**
 * How "live"/işlek a tile is: a weighted count of its run/group partners in the
 * rest of the rack. Higher = keep it; lower = safe to discard. Discarding the
 * least-connected tile avoids feeding opponents useful (işlek) tiles.
 */
function connectionDegree(t: Tile, rest: Tile[]): number {
  if (t.kind !== 'NUMBER' || t.number == null || t.color == null) return 99
  let deg = 0
  for (const r of rest) {
    if (r.kind !== 'NUMBER' || r.number == null || r.color == null) { deg += 1; continue }
    if (r.number === t.number && r.color !== t.color) deg += 2          // group partner
    else if (r.color === t.color) {
      const d = Math.abs(r.number - t.number)
      if (d === 1) deg += 2                                             // adjacent run partner
      else if (d === 2) deg += 1                                        // gapped run partner
    }
  }
  return deg
}

/**
 * Pick the index of the tile to discard: the least-connected ("most dead") tile.
 * Never discards the okey (wild) or a false joker; slightly prefers shedding edge
 * values (1, 13), which are less useful to opponents.
 */
function leastUsefulIndex(rack: Tile[], okey: Tile | undefined, rng: () => number): number {
  let bestIdx = 0; let bestScore = Infinity
  for (let i = 0; i < rack.length; i++) {
    const t = rack[i]!
    const rest = rack.filter((_, j) => j !== i)
    let score = connectionDegree(t, rest)
    if (t.kind === 'FALSE_JOKER') score += 1000                         // keep false jokers
    if (okey && t.kind === 'NUMBER' && tilesEqual(t, okey)) score += 1000 // never discard the okey
    if (t.kind === 'NUMBER' && (t.number === 1 || t.number === 13)) score -= 0.4 // shed edges first
    const jittered = score + rng() * 0.3
    if (jittered < bestScore) { bestScore = jittered; bestIdx = i }
  }
  return bestIdx
}
