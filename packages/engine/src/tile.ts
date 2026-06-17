export type TileColor = 'RED' | 'BLACK' | 'BLUE' | 'YELLOW'
export type TileKind = 'NUMBER' | 'FALSE_JOKER'
export interface Tile { number?: number; color?: TileColor; kind: TileKind }

export const COLOR_TO_SHORT: Record<TileColor, string> = { RED: 'R', BLACK: 'K', BLUE: 'M', YELLOW: 'S' }
export const SHORT_TO_COLOR: Record<string, TileColor> = { R: 'RED', K: 'BLACK', M: 'BLUE', S: 'YELLOW' }
// Legacy Kotlin oracle short codes: R=red, G=green(→BLUE), B=black, Y=yellow
const KOTLIN_SHORT_TO_COLOR: Record<string, TileColor> = { R: 'RED', G: 'BLUE', B: 'BLACK', Y: 'YELLOW' }

function upperInvariant(s: string): string {
  // Avoid Turkish dotted/dotless İ/ı corruption: map ASCII letters only.
  return s.replace(/[a-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 32))
}

export function tileFromString(s: string): Tile {
  const u = upperInvariant(s.trim())
  if (u === 'X') return { kind: 'FALSE_JOKER' }
  const num = parseInt(u.replace(/[^0-9]/g, ''), 10)
  const letter = u.replace(/[0-9]/g, '')
  const color = SHORT_TO_COLOR[letter]
  if (!color || Number.isNaN(num)) throw new Error(`Invalid tile string: ${s}`)
  return { number: num, color, kind: 'NUMBER' }
}

export function fromKotlinShort(s: string): Tile {
  const u = upperInvariant(s.trim())
  if (u === 'X') return { kind: 'FALSE_JOKER' }
  const num = parseInt(u.replace(/[^0-9]/g, ''), 10)
  const letter = u.replace(/[0-9]/g, '')
  const color = KOTLIN_SHORT_TO_COLOR[letter]
  if (!color || Number.isNaN(num)) throw new Error(`Invalid kotlin tile string: ${s}`)
  return { number: num, color, kind: 'NUMBER' }
}

export function tileToString(t: Tile): string {
  if (t.kind === 'FALSE_JOKER' || t.number == null || t.color == null) return 'X'
  return `${t.number}${COLOR_TO_SHORT[t.color]}`
}

export function tilesEqual(a: Tile, b: Tile): boolean {
  return a.kind === b.kind && a.number === b.number && a.color === b.color
}
