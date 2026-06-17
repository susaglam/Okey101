import type { Tile } from '../tile'
import { tileToString } from '../tile'

// 7 identical pairs; wilds complete missing halves. Returns true if a valid 7-pair cover exists.
export function canFormPairs(nonWild: Tile[], wilds: number): boolean {
  const counts = new Map<string, number>()
  for (const t of nonWild) {
    const k = tileToString(t)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let pairs = 0
  let singles = 0
  for (const v of counts.values()) {
    pairs += Math.floor(v / 2)
    singles += v % 2
  }
  // Each wild can pair with a leftover single; two leftover wilds can form a pair together.
  let w = wilds
  // First, pair wilds with singles.
  const usedWithSingles = Math.min(w, singles)
  pairs += usedWithSingles
  w -= usedWithSingles
  // Remaining wilds pair among themselves.
  pairs += Math.floor(w / 2)
  return pairs >= 7
}
