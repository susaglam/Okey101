import type { Tile } from './tile'
import { tilesEqual } from './tile'
import type { VariantConfig } from './config'
import { arrange } from './arrange'

// ─── Wild detection ───────────────────────────────────────────────────────────

function isWild(tile: Tile, okey: Tile): boolean {
  return tile.kind === 'FALSE_JOKER' || tilesEqual(tile, okey)
}

// ─── Meld shape detection ─────────────────────────────────────────────────────

/**
 * Detect whether a meld (already known to be structurally valid) is a RUN or
 * a GROUP by inspecting the non-wild tiles.
 *
 * Returns 'run' | 'group' | 'ambiguous' (all wilds → treat as group, value 0).
 */
function detectShape(meld: Tile[], okey: Tile): 'run' | 'group' | 'ambiguous' {
  const nonWild = meld.filter((t) => !isWild(t, okey))
  if (nonWild.length === 0) return 'ambiguous'

  // Check if all same color → run candidate
  const colors = new Set(nonWild.map((t) => t.color))
  if (colors.size === 1) {
    // Same color — it's a run (consecutive sequence)
    return 'run'
  }
  // Multiple colors → group (same number, distinct colors)
  return 'group'
}

// ─── Run value computation ────────────────────────────────────────────────────

/**
 * Compute the face value of a run meld.
 * Wilds fill gaps; their value is the slot number they occupy.
 *
 * Strategy: Use the positional order of the meld as the run order.
 * Find the run start by examining the first non-wild tile and its index;
 * then assign each slot its consecutive number.
 *
 * Example: [10R, X, 12R]  → indices 0,1,2 → slots start, start+1, start+2
 *   10R at index 0 → start = 10 → slots are 10,11,12. Sum = 33.
 * Example: [10R, 11R, X]  → 10R at index 0 → start=10 → 10,11,12. Sum=33.
 * Example: [X, 11R, 12R]  → 11R at index 1 → start = 11-1=10 → 10,11,12. Sum=33.
 */
function runValue(meld: Tile[], okey: Tile): number {
  const len = meld.length

  // Find the inferred start from the first non-wild tile's position
  let inferredStart: number | null = null
  for (let i = 0; i < len; i++) {
    const tile = meld[i]!
    if (!isWild(tile, okey)) {
      inferredStart = tile.number! - i
      break
    }
  }

  if (inferredStart === null) {
    // All wilds — cannot infer
    return 0
  }

  // Sum all slot values
  let total = 0
  for (let i = 0; i < len; i++) {
    total += inferredStart + i
  }
  return total
}

// ─── Group value computation ──────────────────────────────────────────────────

/**
 * Compute the face value of a group meld.
 * Every tile (incl. wilds) counts as the group's number.
 */
function groupValue(meld: Tile[], okey: Tile): number {
  const nonWild = meld.filter((t) => !isWild(t, okey))
  if (nonWild.length === 0) return 0
  const groupNumber = nonWild[0]!.number!
  return groupNumber * meld.length
}

// ─── Public: openingValue ─────────────────────────────────────────────────────

/**
 * Sum of face values across all melds. Each wild counts as the value of the
 * slot it fills: in a run → the missing consecutive number; in a group →
 * the group's number.
 */
export function openingValue(melds: Tile[][], okey: Tile): number {
  let total = 0
  for (const meld of melds) {
    const shape = detectShape(meld, okey)
    if (shape === 'run') {
      total += runValue(meld, okey)
    } else if (shape === 'group') {
      total += groupValue(meld, okey)
    }
    // 'ambiguous' (all wilds) → contributes 0
  }
  return total
}

// ─── Meld validity predicates ─────────────────────────────────────────────────

/**
 * Validate a single meld as a RUN.
 * Rules: same color, consecutive ≥3 tiles, wilds fill at most one contiguous
 * gap region, no 13→1 wrap if config.runWrap13to1 is false.
 */
function isValidRun(meld: Tile[], okey: Tile, config: VariantConfig): boolean {
  if (meld.length < 3) return false

  const nonWild = meld.filter((t) => !isWild(t, okey))
  const wildCount = meld.length - nonWild.length

  if (nonWild.length === 0) return false // all wilds — not a valid run (no color info)

  // All non-wild must be same color
  const colors = new Set(nonWild.map((t) => t.color))
  if (colors.size !== 1) return false

  const nums = nonWild.map((t) => t.number!).sort((a, b) => a - b)
  const min = nums[0]!
  const max = nums[nums.length - 1]!
  const len = meld.length

  // Check no 13→1 wrap: if config disallows it, the sequence must not span across 13→1
  if (!config.runWrap13to1) {
    // No number should be 1 while another is 13 in the same run
    if (min === 1 && max === 13) return false
  }

  // The consecutive range [start, start+len-1] must fit all real numbers
  // and leave exactly wildCount positions for wilds.
  const startMin = max - len + 1
  const startMax = min

  if (startMin < 1) {
    if (!config.runWrap13to1) return false
  }
  if (startMin > startMax) return false

  for (let s = startMin; s <= startMax; s++) {
    if (s < 1 && !config.runWrap13to1) continue
    // Check that the range [s, s+len-1] stays within 1..13 (no wrap for 101)
    if (!config.runWrap13to1 && s + len - 1 > 13) continue

    // Count how many real numbers fall in this range
    const inRange = nums.filter((n) => n >= s && n <= s + len - 1)
    if (inRange.length !== nonWild.length) continue

    // Verify no duplicate numbers in range (each slot exactly once)
    const slots = new Set(nums)
    if (slots.size !== nonWild.length) continue

    // The number of wilds needed is len - nonWild.length = wildCount — must match
    return true
  }

  return false
}

/**
 * Validate a single meld as a GROUP.
 * Rules: same number, distinct colors, 3–4 tiles, wilds fill remaining slots.
 */
function isValidGroup(meld: Tile[], okey: Tile, _config: VariantConfig): boolean {
  if (meld.length < 3 || meld.length > 4) return false

  const nonWild = meld.filter((t) => !isWild(t, okey))

  if (nonWild.length === 0) return false // all wilds — no group number

  // All non-wild must share the same number
  const numbers = new Set(nonWild.map((t) => t.number))
  if (numbers.size !== 1) return false

  // All non-wild must have distinct colors
  const colors = nonWild.map((t) => t.color)
  if (new Set(colors).size !== colors.length) return false

  // Wilds fill remaining slots (up to 4 total); already enforced by meld.length ≤ 4
  return true
}

/**
 * Validate that a meld is either a valid run or a valid group.
 */
function isValidMeld(meld: Tile[], okey: Tile, config: VariantConfig): boolean {
  return isValidRun(meld, okey, config) || isValidGroup(meld, okey, config)
}

// ─── Public: isValidMeldSet ───────────────────────────────────────────────────

/**
 * Returns true if every meld in the set is a valid run or group under the
 * given config.
 */
export function isValidMeldSet(melds: Tile[][], okey: Tile, config: VariantConfig): boolean {
  if (melds.length === 0) return false
  return melds.every((meld) => isValidMeld(meld, okey, config))
}

// ─── Pairs route helpers ──────────────────────────────────────────────────────

/**
 * Validate a single meld as a "pair" for the pairs-opening route.
 * A pair is exactly 2 tiles of the same number and same color (identical tiles).
 */
function isValidPair(meld: Tile[], okey: Tile): boolean {
  if (meld.length !== 2) return false
  const [a, b] = meld
  if (!a || !b) return false
  // Neither tile should be a wild (pairs must be real identical tiles)
  if (isWild(a, okey) || isWild(b, okey)) return false
  return a.number === b.number && a.color === b.color
}

// ─── Public: canOpen ──────────────────────────────────────────────────────────

// ─── Public: findOpening ──────────────────────────────────────────────────────

/**
 * Attempt to find a valid opening subset from the given rack.
 *
 * Uses `arrange` to get the best set of valid melds from the rack, then
 * greedily accumulates melds sorted by their individual openingValue descending
 * until the cumulative value reaches config.openingThreshold.
 *
 * Verifies the accumulated subset with canOpen. Returns the subset if it
 * passes, otherwise returns null.
 */
export function findOpening(rack: Tile[], okey: Tile, config: VariantConfig): Tile[][] | null {
  const { melds } = arrange(rack, okey, config)
  if (melds.length === 0) return null

  const threshold = config.openingThreshold ?? 101

  // Sort melds by individual openingValue descending
  const sorted = [...melds].sort(
    (a, b) => openingValue([b], okey) - openingValue([a], okey),
  )

  // Greedy accumulation: add melds until cumulative value >= threshold
  const subset: Tile[][] = []
  let cumulative = 0
  for (const meld of sorted) {
    subset.push(meld)
    cumulative += openingValue([meld], okey)
    if (cumulative >= threshold) {
      // Verify with canOpen
      if (canOpen(subset, okey, config)) {
        return subset
      }
    }
  }

  return null
}

// ─── Public: findLayableMeld ──────────────────────────────────────────────────

/**
 * Find ONE valid meld (run or group, length ≥3, wilds allowed) in the given
 * rack WITHOUT requiring the ≥101 opening threshold.
 *
 * Used for post-opening meld laying ("Seri Aç"): a player who has already
 * satisfied the opening requirement can lay additional valid melds without
 * needing to re-check the ≥101 total.
 *
 * Returns the first meld from arrange(), or null if no meld is found.
 */
export function findLayableMeld(rack: Tile[], okey: Tile, config: VariantConfig): Tile[] | null {
  const { melds } = arrange(rack, okey, config)
  if (melds.length === 0) return null
  return melds[0]!
}

/**
 * Returns true if the player can open with the given melds under the config:
 *
 * Standard route: all melds are valid runs/groups AND total face value ≥
 *   config.openingThreshold.
 *
 * Pairs route: melds are exactly config.pairsOpenCount valid identical pairs.
 */
export function canOpen(melds: Tile[][], okey: Tile, config: VariantConfig): boolean {
  const threshold = config.openingThreshold ?? 101
  const pairsCount = config.pairsOpenCount ?? 5

  // Try pairs route first
  if (melds.length === pairsCount) {
    if (melds.every((m) => isValidPair(m, okey))) {
      return true
    }
  }

  // Standard route
  if (!isValidMeldSet(melds, okey, config)) return false
  return openingValue(melds, okey) >= threshold
}
