import { evaluateHand, findOpening, tilesEqual, type PlayerView, type GameEvent, type Tile } from '@cs-okey/engine'

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
        return { type: 'DrawFromDiscard', seat }
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

    // 2. OpenMeld: if not yet opened and findOpening returns a set.
    if (!view.you.hasOpened && legal.includes('OpenMeld')) {
      const opening = findOpening(rack, view.okey!, view.config)
      if (opening !== null) {
        return { type: 'OpenMeld', seat, melds: opening }
      }
    }

    // 3. LayOff: if already opened, try to extend a table meld with one rack tile.
    if (view.you.hasOpened && legal.includes('LayOff')) {
      const layOff = findLayOff(rack, view.tableMelds, view.okey!)
      if (layOff !== null) {
        return { type: 'LayOff', seat, meldIndex: layOff.meldIndex, tiles: [layOff.tile] }
      }
    }

    // 4. Fall through: discard least-useful.
    const idx = leastUsefulIndex(rack, rng)
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
  const idx = leastUsefulIndex(rack, rng)
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

function canExtendRun(tile: Tile, meldTiles: Tile[], okey: Tile): boolean {
  if (tile.kind !== 'NUMBER' || tile.number == null || tile.color == null) return false

  // Find the run's color and number range (ignoring wilds)
  const nonWild = meldTiles.filter((t) => !tilesEqual(t, okey) && t.kind !== 'FALSE_JOKER')
  if (nonWild.length === 0) return false

  // All non-wild tiles in a run must be same color
  const runColor = nonWild[0]!.color
  if (tile.color !== runColor) return false

  const nums = nonWild.map((t) => t.number!).sort((a, b) => a - b)
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

  const nonWild = meldTiles.filter((t) => !tilesEqual(t, okey) && t.kind !== 'FALSE_JOKER')
  if (nonWild.length === 0) return false

  const groupNumber = nonWild[0]!.number
  if (tile.number !== groupNumber) return false

  // Tile color must not already appear in the group
  const existingColors = new Set(nonWild.map((t) => t.color))
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

function leastUsefulIndex(rack: Tile[], rng: () => number): number {
  let bestIdx = 0; let bestScore = Infinity
  for (let i = 0; i < rack.length; i++) {
    const t = rack[i]!
    const rest = rack.filter((_, j) => j !== i)
    const score = isUseful(t, rest) ? 1 : 0
    const jittered = score + rng() * 0.5
    if (jittered < bestScore) { bestScore = jittered; bestIdx = i }
  }
  return bestIdx
}
