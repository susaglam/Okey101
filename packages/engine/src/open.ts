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
 * Compute the face value of a run meld. Wilds fill gaps; their value is the slot
 * they occupy in the run.
 *
 * ORDER-INSENSITIVE: the value is derived from the run's WINDOW (the consecutive
 * span the non-wild numbers occupy), not from where tiles physically sit, so a
 * mis-ordered meld (e.g. [12,13,okey] or a front-extended lay-off [2,3,4,5,6,1])
 * is valued correctly. A wild that would extend the run PAST 13 is instead placed
 * at the low end (e.g. [12,13]+wild → 11,12,13 = 36, never 12,13,1 = 26), since a
 * 13→1 wrap is only valued when the real numbers genuinely span the wrap.
 *
 * Examples: [10R, X, 12R] → 10,11,12 = 33.  [12R, 13R, X] → 11,12,13 = 36.
 */
function runValue(meld: Tile[], okey: Tile): number {
  const len = meld.length

  // Non-wild effective numbers + the start implied by the FIRST non-wild tile's
  // position (a wild's slot follows from where the player physically placed it).
  const nums: number[] = []
  let inferredStart: number | null = null
  for (let i = 0; i < len; i++) {
    const tile = meld[i]!
    if (isWild(tile, okey)) continue
    const ev = effectiveValue(tile, okey)
    if (ev === null) continue
    nums.push(ev.number)
    if (inferredStart === null) inferredStart = ev.number - i
  }
  if (inferredStart === null) return 0 // all wilds — cannot infer

  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const end = inferredStart + len - 1

  // HONOUR the player's wild placement when the implied window is valid — fits
  // 1..13 and contains every real number. This is what lets [7M,11,12] mean
  // 10-11-12 (wild low) while [11,12,7M] means 11-12-13 (wild high).
  if (inferredStart >= 1 && end <= 13 && nums.every((n) => n >= inferredStart && n <= end)) {
    let total = 0
    for (let k = 0; k < len; k++) total += inferredStart + k
    return total
  }

  // Genuine 13→1 wrap: the reals span more than `len` → find the wrapping window.
  if (max - min + 1 > len) {
    for (let s = 1; s <= 13; s++) {
      const window = new Set<number>()
      for (let k = 0; k < len; k++) window.add(((s - 1 + k) % 13) + 1)
      if (window.size !== len) continue
      if (nums.every((n) => window.has(n))) {
        let total = 0
        for (const f of window) total += f
        return total
      }
    }
    return 0
  }

  // The physical placement overflows 1..13 (e.g. [12,13,okey] → 12,13,14): the
  // wild can't extend the run above 13, so anchor on the reals and shift the
  // window DOWN to fit (→ 11,12,13 = 36, not the wrapped 12,13,1 = 26).
  let start = min
  if (start + len - 1 > 13) start = 13 - len + 1
  let total = 0
  for (let k = 0; k < len; k++) total += start + k
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

  const nums = nonWildEv.map((v) => v.number)
  const len = meld.length
  if (len > 13) return false

  // A run cannot repeat a number (same colour, distinct consecutive values).
  const numSet = new Set(nums)
  if (numSet.size !== nums.length) return false

  const wrap = !!config.runWrap13to1

  // The run occupies `len` consecutive slots starting at some s (1..13), wrapping
  // 13→1 only when allowed. A valid run exists iff some window contains every
  // non-wild number; the remaining slots are then filled by the wilds.
  for (let s = 1; s <= 13; s++) {
    const window = new Set<number>()
    let fits = true
    for (let k = 0; k < len; k++) {
      let n = s + k
      if (n > 13) {
        if (!wrap) { fits = false; break }
        // A 13→1 wrap is legal ONLY as the final slot (…,12,13,1). 13,1,2,… is not
        // a run, so reject any wrap past the 1 (n>14) or a non-final wrap.
        if (n !== 14 || k !== len - 1) { fits = false; break }
        n = 1
      }
      window.add(n)
    }
    if (!fits) continue
    if (window.size !== len) continue // (only possible if len > 13, already guarded)

    let covers = true
    for (const n of numSet) {
      if (!window.has(n)) { covers = false; break }
    }
    if (covers) return true
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
 * A pair is 2 tiles representing the same number and colour. The okey (a real
 * NUMBER tile equal to okey) is WILD and may stand in for the missing half —
 * "okey her yerde kullanılır", in çift as well as in seri. So a pair is valid if:
 *   - both tiles are the same number+colour (identical real tiles, or a FALSE_JOKER
 *     standing on its concrete okey value), OR
 *   - at least one tile is the wild okey (it completes the pair).
 */
function isValidPair(meld: Tile[], okey: Tile): boolean {
  if (meld.length !== 2) return false
  const [a, b] = meld
  if (!a || !b) return false
  // The wild okey completes a pair with any partner (including another wild).
  if (isWild(a, okey) || isWild(b, okey)) return true
  // Both concrete: must be the same number and colour.
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
  // Separate the wild okeys (they can complete any pair) from concrete tiles.
  type Entry = { tile: Tile; key: string }
  const entries: Entry[] = []
  const wilds: Tile[] = []
  for (const t of rack) {
    if (isWild(t, okey)) { wilds.push(t); continue }
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

  // Extract identical-tile pairs; remember each group's leftover single.
  const pairs: Tile[][] = []
  const singles: Tile[] = []
  for (const [, tiles] of groups) {
    let i = 0
    for (; i + 1 < tiles.length; i += 2) pairs.push([tiles[i]!, tiles[i + 1]!])
    if (i < tiles.length) singles.push(tiles[i]!)
  }

  // The okey is wild: pair each leftover single with a wild, then pair any
  // remaining wilds with each other (a pair of two wilds is valid). Prefer the
  // BIGGEST leftover singles first, so the okey stands in for a high tile — less
  // value is left stranded in the rack (smaller penalty if it stays unopened).
  singles.sort((a, b) => (effectiveValue(b, okey)?.number ?? 0) - (effectiveValue(a, okey)?.number ?? 0))
  let w = 0
  for (const single of singles) {
    if (w >= wilds.length) break
    pairs.push([single, wilds[w++]!])
  }
  for (; w + 1 < wilds.length; w += 2) pairs.push([wilds[w]!, wilds[w + 1]!])

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
