import type { Tile, TileColor } from './tile'
import { tilesEqual } from './tile'
import type { VariantConfig } from './config'
import { arrange } from './arrange'

// ─── Wild detection ───────────────────────────────────────────────────────────

/**
 * A tile is wild only if it is a real NUMBER tile whose number+color matches okey.
 * FALSE_JOKER is NOT wild — it is a plain tile fixed to okey's value.
 */
function isWild(tile: Tile, okey: Tile): boolean {
  return tile.kind === 'NUMBER' && tilesEqual(tile, okey)
}

/**
 * Return the effective {number, color} of a tile for meld analysis:
 * - FALSE_JOKER → okey's {number, color} (it is a plain tile fixed to this value)
 * - NUMBER tile → its own {number, color}
 * - Returns null if the tile lacks number/color (should not happen in practice).
 */
function effectiveValue(t: Tile, okey: Tile): { number: number; color: TileColor } | null {
  if (t.kind === 'FALSE_JOKER') {
    if (okey.number == null || okey.color == null) return null
    return { number: okey.number, color: okey.color }
  }
  if (t.number == null || t.color == null) return null
  return { number: t.number, color: t.color }
}

// ─── Meld shape detection ─────────────────────────────────────────────────────

/**
 * Detect whether a meld (already known to be structurally valid) is a RUN or
 * a GROUP by inspecting the non-wild tiles.
 *
 * FALSE_JOKERs are treated as their concrete value (okey's number+color) but are
 * NOT wild. Only real NUMBER tiles equal to okey are wild.
 * Returns 'run' | 'group' | 'ambiguous' (all wilds → treat as group, value 0).
 */
function detectShape(meld: Tile[], okey: Tile): 'run' | 'group' | 'ambiguous' {
  // Collect non-wild effective values (wild = real NUMBER tile matching okey)
  const nonWildVals = meld
    .filter((t) => !isWild(t, okey))
    .map((t) => effectiveValue(t, okey))
    .filter((v): v is { number: number; color: TileColor } => v !== null)

  if (nonWildVals.length === 0) return 'ambiguous'

  // Check if all same color → run candidate
  const colors = new Set(nonWildVals.map((v) => v.color))
  if (colors.size === 1) {
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

  // Find the inferred start from the first non-wild tile's position.
  // FALSE_JOKER contributes its concrete okey value; real okey-NUMBER tiles are wild.
  let inferredStart: number | null = null
  for (let i = 0; i < len; i++) {
    const tile = meld[i]!
    if (!isWild(tile, okey)) {
      const ev = effectiveValue(tile, okey)
      if (ev !== null) {
        inferredStart = ev.number - i
        break
      }
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
  // Find the group number from the first non-wild tile's effective value.
  // FALSE_JOKER contributes its concrete okey value; real okey-NUMBER tiles are wild.
  for (const t of meld) {
    if (!isWild(t, okey)) {
      const ev = effectiveValue(t, okey)
      if (ev !== null) {
        return ev.number * meld.length
      }
    }
  }
  return 0 // all wilds — no group number
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
 *
 * FALSE_JOKERs contribute their concrete okey value as a PLAIN tile (not wild).
 * Only real NUMBER tiles equal to okey are treated as wild (universal substitutes).
 */
function isValidRun(meld: Tile[], okey: Tile, config: VariantConfig): boolean {
  if (meld.length < 3) return false

  // Build effective-value list for non-wild tiles. Wild = real NUMBER tile matching okey.
  // FALSE_JOKER is non-wild; its effective value is okey's number+color.
  const nonWildEv = meld
    .filter((t) => !isWild(t, okey))
    .map((t) => effectiveValue(t, okey))
    .filter((v): v is { number: number; color: TileColor } => v !== null)

  if (nonWildEv.length === 0) return false // all wilds — not a valid run (no color info)

  // All non-wild must be same color
  const colors = new Set(nonWildEv.map((v) => v.color))
  if (colors.size !== 1) return false

  const nums = nonWildEv.map((v) => v.number).sort((a, b) => a - b)
  const min = nums[0]!
  const max = nums[nums.length - 1]!
  const len = meld.length

  // Check no 13→1 wrap: if config disallows it, the sequence must not span across 13→1
  if (!config.runWrap13to1) {
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
    if (!config.runWrap13to1 && s + len - 1 > 13) continue

    const inRange = nums.filter((n) => n >= s && n <= s + len - 1)
    if (inRange.length !== nonWildEv.length) continue

    const slots = new Set(nums)
    if (slots.size !== nonWildEv.length) continue

    return true
  }

  return false
}

/**
 * Validate a single meld as a GROUP.
 * Rules: same number, distinct colors, 3–4 tiles, wilds fill remaining slots.
 *
 * FALSE_JOKERs contribute their concrete okey value as a PLAIN tile (not wild).
 * Only real NUMBER tiles equal to okey are treated as wild (universal substitutes).
 */
function isValidGroup(meld: Tile[], okey: Tile, _config: VariantConfig): boolean {
  if (meld.length < 3 || meld.length > 4) return false

  // Build effective-value list for non-wild tiles.
  const nonWildEv = meld
    .filter((t) => !isWild(t, okey))
    .map((t) => effectiveValue(t, okey))
    .filter((v): v is { number: number; color: TileColor } => v !== null)

  if (nonWildEv.length === 0) return false // all wilds — no group number

  // All non-wild must share the same number
  const numbers = new Set(nonWildEv.map((v) => v.number))
  if (numbers.size !== 1) return false

  // All non-wild must have distinct colors
  const cols = nonWildEv.map((v) => v.color)
  if (new Set(cols).size !== cols.length) return false

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
 * Neither tile may be a wild (real NUMBER tile equal to okey).
 * FALSE_JOKERs are treated as their concrete okey value (plain, not wild).
 */
function isValidPair(meld: Tile[], okey: Tile): boolean {
  if (meld.length !== 2) return false
  const [a, b] = meld
  if (!a || !b) return false
  // Neither tile should be a wild (pairs must be real identical tiles)
  if (isWild(a, okey) || isWild(b, okey)) return false
  // Use effective values for comparison (handles FALSE_JOKER)
  const evA = effectiveValue(a, okey)
  const evB = effectiveValue(b, okey)
  if (!evA || !evB) return false
  return evA.number === evB.number && evA.color === evB.color
}

// ─── Public: isValidPairSet ───────────────────────────────────────────────────

/**
 * Returns true if every meld in the set is a valid pair (for post-opening
 * çift-route meld laying).
 */
export function isValidPairSet(melds: Tile[][], okey: Tile): boolean {
  if (melds.length === 0) return false
  return melds.every((m) => isValidPair(m, okey))
}

// ─── Public: canOpen ──────────────────────────────────────────────────────────

// ─── Public: findPairOpening ──────────────────────────────────────────────────

/**
 * Attempt to find exactly `config.pairsOpenCount` (default 5) identical pairs
 * in the given rack for the initial çift-route opening.
 *
 * A pair = 2 tiles with the same effective number and color; neither may be wild
 * (a real NUMBER tile equal to okey). FALSE_JOKERs use okey's concrete value.
 *
 * Returns the array of pairs (each a 2-element Tile[]) if found, else null.
 */
export function findPairOpening(rack: Tile[], okey: Tile, config: VariantConfig): Tile[][] | null {
  const pairsCount = config.pairsOpenCount ?? 5
  const all = _collectPairs(rack, okey, pairsCount)
  if (!all) return null
  // Return exactly pairsCount pairs
  return all.length >= pairsCount ? all.slice(0, pairsCount) : null
}

/**
 * Helper: collect identical pairs from the rack.
 * Uses a frequency map keyed by "number:color" to find pairs.
 * If `minPairs` is provided and fewer pairs are found, returns null.
 * If `minPairs` is 0, returns all found pairs (or null if none).
 */
function _collectPairs(rack: Tile[], okey: Tile, minPairs: number): Tile[][] | null {
  // Group non-wild tiles by their effective "number:color" key
  type Entry = { tile: Tile; key: string }
  const entries: Entry[] = []
  for (const t of rack) {
    if (isWild(t, okey)) continue
    const ev = effectiveValue(t, okey)
    if (!ev) continue
    entries.push({ tile: t, key: `${ev.number}:${ev.color}` })
  }

  // Count occurrences per key and track tile instances
  const groups = new Map<string, Tile[]>()
  for (const { tile, key } of entries) {
    const arr = groups.get(key)
    if (arr) { arr.push(tile) }
    else { groups.set(key, [tile]) }
  }

  // Extract pairs — each group with ≥2 tiles contributes ⌊count/2⌋ pairs
  const pairs: Tile[][] = []
  for (const [, tiles] of groups) {
    for (let i = 0; i + 1 < tiles.length; i += 2) {
      pairs.push([tiles[i]!, tiles[i + 1]!])
    }
  }

  if (pairs.length === 0) return null
  if (minPairs > 0 && pairs.length < minPairs) return null
  return pairs
}

// ─── Public: findLayablePairs ─────────────────────────────────────────────────

/**
 * Find all additional identical pairs in the rack for a çift-route player who
 * has already opened (post-opening pair laying: "Çift Aç").
 *
 * Returns an array of 2-element Tile[] arrays (one per additional pair found),
 * or null if no pairs are available.
 */
export function findLayablePairs(rack: Tile[], okey: Tile, _config: VariantConfig): Tile[][] | null {
  return _collectPairs(rack, okey, 0)
}

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
