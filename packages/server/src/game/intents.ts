// packages/server/src/game/intents.ts
// Validate a client-sent intent BEFORE it reaches reduce(). reduce() assumes
// well-formed events; a malformed payload could throw a raw error (crashing the
// table) or carry oversized arrays. We accept only the known PLAYER events with
// sane shapes/bounds; server-only events (CreateGame/StartHand) are rejected.
import type { GameEvent, Tile } from '@cs-okey/engine'

const COLORS = new Set(['RED', 'BLACK', 'BLUE', 'YELLOW'])
const MAX_TILES = 30 // a rack is ~21; bound array work regardless

function isTile(x: unknown): x is Tile {
  if (typeof x !== 'object' || x === null) return false
  const t = x as Record<string, unknown>
  if (t.kind === 'FALSE_JOKER') return true
  if (t.kind !== 'NUMBER') return false
  return typeof t.number === 'number' && t.number >= 1 && t.number <= 13 && typeof t.color === 'string' && COLORS.has(t.color)
}
const isTileArray = (x: unknown, max = MAX_TILES): x is Tile[] =>
  Array.isArray(x) && x.length >= 1 && x.length <= max && x.every(isTile)

/** Returns a sanitized GameEvent (without seat — the host injects the authoritative
 *  seat) or null if the payload is malformed / not a permitted player event. */
export function validateIntent(raw: unknown): GameEvent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as Record<string, unknown>
  switch (e.type) {
    case 'DrawFromStock':
    case 'DrawFromDiscard':
    case 'ReturnFloorTile':
    case 'RetractOpen':
    case 'DeclareCift':
      return { type: e.type, seat: 0 } as GameEvent
    case 'Discard':
      return isTile(e.tile) ? ({ type: 'Discard', seat: 0, tile: e.tile } as GameEvent) : null
    case 'DeclareWin':
      return isTile(e.discardTile) ? ({ type: 'DeclareWin', seat: 0, discardTile: e.discardTile } as GameEvent) : null
    case 'TakeOkey':
      return typeof e.meldIndex === 'number' && isTile(e.tile)
        ? ({ type: 'TakeOkey', seat: 0, meldIndex: e.meldIndex, tile: e.tile } as GameEvent) : null
    case 'LayOff':
      return typeof e.meldIndex === 'number' && isTileArray(e.tiles, 4)
        ? ({ type: 'LayOff', seat: 0, meldIndex: e.meldIndex, tiles: e.tiles } as GameEvent) : null
    case 'OpenMeld': {
      const melds = e.melds
      if (!Array.isArray(melds) || melds.length < 1 || melds.length > 20) return null
      if (!melds.every((m) => isTileArray(m, MAX_TILES))) return null
      return { type: 'OpenMeld', seat: 0, melds: melds as Tile[][] } as GameEvent
    }
    default:
      return null // unknown or server-only (CreateGame/StartHand) → reject
  }
}
