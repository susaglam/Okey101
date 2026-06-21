import type { Tile } from '../tile'
import type { VariantConfig } from '../config'

// Backtracking cover: can the given non-wild tiles + `wilds` jokers be partitioned
// into melds (group: same number, distinct colors, size 3-4; run: same color
// consecutive, size>=3, optional 13->1 wrap)?
//
// ZERO tiles may remain uncovered — every tile must be consumed into a meld.
// All wilds MUST be placed inside melds (no leftover wilds).
export function canCoverInMelds(nonWild: Tile[], wilds: number, config: VariantConfig): boolean {
  const counts = new Map<string, number>()
  for (const t of nonWild) {
    const k = `${t.color}|${t.number}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return solve(counts, wilds, config)
}

function totalCount(counts: Map<string, number>): number {
  let s = 0; for (const v of counts.values()) s += v; return s
}

function firstTile(counts: Map<string, number>): { color: string; number: number } | null {
  let best: { color: string; number: number } | null = null
  for (const [k, v] of counts) {
    if (v <= 0) continue
    const [color, numStr] = k.split('|')
    const number = Number(numStr)
    if (!best || color! < best.color || (color === best.color && number < best.number)) {
      best = { color: color!, number }
    }
  }
  return best
}

function take(counts: Map<string, number>, color: string, number: number, n = 1): boolean {
  const k = `${color}|${number}`
  const have = counts.get(k) ?? 0
  if (have < n) return false
  counts.set(k, have - n)
  return true
}
function give(counts: Map<string, number>, color: string, number: number, n = 1): void {
  const k = `${color}|${number}`
  counts.set(k, (counts.get(k) ?? 0) + n)
}

const COLORS = ['RED', 'BLACK', 'BLUE', 'YELLOW']

function solve(
  counts: Map<string, number>,
  wilds: number,
  config: VariantConfig,
): boolean {
  const remaining = totalCount(counts)

  // Base case: no more real tiles and no leftover wilds → success.
  if (remaining === 0) return wilds === 0

  // Can't even start a meld — failure (no orphan allowance).
  if (remaining + wilds < 3) return false

  const anchor = firstTile(counts)
  if (anchor === null) return false

  const { color, number } = anchor

  // Option A: GROUP using this tile (same number, distinct colors), size 3 or 4.
  for (const size of [3, 4]) {
    const otherColors = COLORS.filter((c) => c !== color)
    if (tryGroup(counts, wilds, color, number, size, otherColors, config)) return true
  }

  // Option B: RUN containing this tile (same color, consecutive), length 3–13.
  // Try all starting positions where the anchor falls at position `pos` in the run.
  const triedRunStarts = new Set<string>()
  for (let len = 3; len <= 13; len++) {
    for (let pos = 0; pos < len; pos++) {
      let start = number - pos
      if (start < 1) {
        if (!config.runWrap13to1) continue
        // Wrap negative start into 1..13 range.
        start = ((start - 1 + 13 * (Math.floor(Math.abs(start) / 13) + 1)) % 13) + 1
      }
      const key = `${len}:${start}`
      if (triedRunStarts.has(key)) continue
      triedRunStarts.add(key)
      if (tryRun(counts, wilds, color, start, len, config)) return true
    }
  }

  return false
}

function tryGroup(
  counts: Map<string, number>, wilds: number, color: string, number: number,
  size: number, otherColors: string[], config: VariantConfig,
): boolean {
  if (!take(counts, color, number)) return false
  const result = pickGroupMembers(counts, wilds, otherColors, number, size - 1, config)
  give(counts, color, number)
  return result
}

function pickGroupMembers(
  counts: Map<string, number>, wilds: number, pool: string[], number: number,
  need: number, config: VariantConfig,
): boolean {
  if (need === 0) {
    return solve(counts, wilds, config)
  }
  for (let i = 0; i < pool.length; i++) {
    const c = pool[i]!
    const rest = pool.slice(i + 1)
    // Try a real tile of this color.
    if (take(counts, c, number)) {
      const ok = pickGroupMembers(counts, wilds, rest, number, need - 1, config)
      give(counts, c, number)
      if (ok) return true
    }
    // Try a wild standing in for this color slot.
    if (wilds > 0) {
      const ok = pickGroupMembers(counts, wilds - 1, rest, number, need - 1, config)
      if (ok) return true
    }
  }
  return false
}

function tryRun(
  counts: Map<string, number>, wilds: number, color: string, start: number, len: number,
  config: VariantConfig,
): boolean {
  const seq: number[] = []
  for (let i = 0; i < len; i++) {
    let n = start + i
    if (n > 13) {
      if (!config.runWrap13to1) return false
      // A 13→1 wrap is legal ONLY as the final tile (…,12,13,1). 13,1,2,… is not a
      // run, so reject any wrap past the 1 (n>14) or a non-final wrap.
      if (n !== 14 || i !== len - 1) return false
      n = 1
    }
    if (seq.includes(n)) return false
    seq.push(n)
  }

  let usedWilds = 0
  const consumed: number[] = []
  for (const n of seq) {
    if (take(counts, color, n)) {
      consumed.push(n)
    } else if (wilds - usedWilds > 0) {
      usedWilds++
    } else {
      for (const cn of consumed) give(counts, color, cn)
      return false
    }
  }

  const ok = solve(counts, wilds - usedWilds, config)
  for (const cn of consumed) give(counts, color, cn)
  return ok
}
