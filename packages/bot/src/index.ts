import { evaluateHand, tilesEqual, type PlayerView, type GameEvent, type Tile } from '@cs-okey/engine'

export function decide(view: PlayerView, legal: GameEvent['type'][], rng: () => number): GameEvent {
  const seat = view.seat
  const rack = view.you.rack

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

  // DISCARD phase: try to win by dropping each tile.
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
