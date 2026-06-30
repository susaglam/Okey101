import type { Tile, TileColor } from './tile'
import { tilesEqual } from './tile'
import type { VariantConfig } from './config'
import { isValidMeldSet } from './open'

// ─── Wild helpers ───────────────────────────────────────────────────────────

/**
 * A tile is a (gap-filling) WILD only if it is a real NUMBER tile whose number+color
 * matches okey. A FALSE_JOKER is NOT wild — it is a fixed plain tile worth okey's
 * value, so it is never reinterpreted.
 */
export function isWildTile(t: Tile, okey: Tile): boolean {
  return t.kind === 'NUMBER' && tilesEqual(t, okey)
}

/** Resolve a FALSE_JOKER to its concrete tile (okey's number+color); reals unchanged. */
function concreteTile(t: Tile, okey: Tile): Tile {
  if (t.kind === 'FALSE_JOKER') {
    return { kind: 'NUMBER', number: okey.number, color: okey.color }
  }
  return t
}

const COLOR_ORDER: Record<string, number> = { RED: 0, YELLOW: 1, BLUE: 2, BLACK: 3 }

// ─── Display ordering ─────────────────────────────────────────────────────────

/**
 * Order a meld's tiles for READABLE display (and as the canonical order the
 * represented-value helpers expect):
 * - RUN (reals share a colour, differ in number): ascending by number, gap-filling
 *   wilds placed in their gap positions ("7 ♣ 9 10" → 7-8-9-10); extra wilds extend
 *   the run at the end. Wrap (12-13-1) handled best-effort.
 * - GROUP (reals share a number): reals by a fixed colour order, wilds last.
 * FALSE_JOKERs are CONCRETE tiles placed at their value; only real okey tiles are
 * gap-filling wilds. Original tile objects are preserved.
 */
export function orderMeldForDisplay(meld: Tile[], okey: Tile): Tile[] {
  const pairs = meld.map((t) => ({ orig: t, resolved: concreteTile(t, okey) }))
  const wildPairs = pairs.filter((p) => isWildTile(p.orig, okey))
  const realPairs = pairs.filter((p) => !isWildTile(p.orig, okey))

  if (realPairs.length === 0) return [...meld]

  const firstColor = realPairs[0]!.resolved.color
  const sameColor = realPairs.every((p) => p.resolved.color === firstColor)
  const firstNum = realPairs[0]!.resolved.number
  const sameNumber = realPairs.every((p) => p.resolved.number === firstNum)

  if (sameColor && !sameNumber) {
    // RUN: place reals at their slot, wilds fill the gaps in run order.
    const byNum = new Map<number, Tile>()
    for (const p of realPairs) if (p.resolved.number != null) byNum.set(p.resolved.number, p.orig)
    const nums = [...byNum.keys()]
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    const len = meld.length

    let startNum = min
    if (max - min + 1 > len) {
      // Reals span more than `len` → a 13→1 wrap run; find the wrapping start.
      for (let s = 1; s <= 13; s++) {
        const window = new Set<number>()
        for (let k = 0; k < len; k++) window.add(((s - 1 + k) % 13) + 1)
        if (window.size !== len) continue
        if (nums.every((n) => window.has(n))) { startNum = s; break }
      }
    } else if (startNum + len - 1 > 13) {
      // Extending up from min would pass 13 → anchor so the window ENDS at 13.
      startNum = 13 - len + 1
    }

    const out: Tile[] = []
    let wi = 0
    for (let k = 0; k < len; k++) {
      const face = ((startNum - 1 + k) % 13) + 1
      const real = byNum.get(face)
      if (real) out.push(real)
      else if (wi < wildPairs.length) out.push(wildPairs[wi++]!.orig)
    }
    while (wi < wildPairs.length) out.push(wildPairs[wi++]!.orig)
    return out
  }

  // GROUP (same number) or fallback: reals by colour order, wilds last.
  const sortedReals = [...realPairs].sort(
    (a, b) => (COLOR_ORDER[a.resolved.color ?? ''] ?? 9) - (COLOR_ORDER[b.resolved.color ?? ''] ?? 9),
  )
  return [...sortedReals.map((p) => p.orig), ...wildPairs.map((p) => p.orig)]
}

// ─── Represented values / colours (the okey "oracle") ─────────────────────────

/**
 * For an already-ordered meld (orderMeldForDisplay output), the NUMBER each tile
 * represents. Gap-filling wild (real okey) in a RUN → its slot number; in a GROUP →
 * the group number. FALSE_JOKER / real tile → its own number. null if indeterminate.
 */
export function meldRepresentedValues(orderedMeld: Tile[], okey: Tile): (number | null)[] {
  const resolvedMeld = orderedMeld.map((t) => concreteTile(t, okey))
  const isDisplayWild = orderedMeld.map((t) => isWildTile(t, okey))
  const reals = resolvedMeld.filter((_, i) => !isDisplayWild[i])

  if (reals.length === 0) return orderedMeld.map(() => null)

  const firstColor = reals[0]!.color
  const sameColor = reals.every((t) => t.color === firstColor)
  const firstNum = reals[0]!.number
  const sameNumber = reals.every((t) => t.number === firstNum)

  if (sameColor && !sameNumber) {
    const firstRealIndex = isDisplayWild.findIndex((w) => !w)
    const firstRealNumber = resolvedMeld[firstRealIndex]!.number ?? 1
    return resolvedMeld.map((t, j) => {
      if (!isDisplayWild[j]) return t.number ?? null
      const raw = firstRealNumber - firstRealIndex + j
      return ((raw - 1) % 13 + 13) % 13 + 1
    })
  }

  const groupNumber = firstNum ?? null
  return resolvedMeld.map((t, j) => (isDisplayWild[j] ? groupNumber : t.number ?? null))
}

/**
 * Companion: the COLOUR each gap-filling wild stands in for. RUN → run colour;
 * PAIR → partner colour; GROUP → the single missing colour (null if >1 missing).
 */
export function meldRepresentedColors(orderedMeld: Tile[], okey: Tile): (TileColor | null)[] {
  const resolved = orderedMeld.map((t) => concreteTile(t, okey))
  const isWild = orderedMeld.map((t) => isWildTile(t, okey))
  const reals = resolved.filter((_, i) => !isWild[i])
  if (reals.length === 0) return orderedMeld.map(() => null)

  const colors = new Set(reals.map((r) => r.color))
  const numbers = new Set(reals.map((r) => r.number))
  const ownColor = (i: number): TileColor | null => resolved[i]!.color ?? null

  if (colors.size === 1 && numbers.size > 1) {
    const runColor = reals[0]!.color ?? null
    return orderedMeld.map((_, i) => (isWild[i] ? runColor : ownColor(i)))
  }
  if (orderedMeld.length === 2) {
    const partner = reals[0]!.color ?? null
    return orderedMeld.map((_, i) => (isWild[i] ? partner : ownColor(i)))
  }
  const ALL: TileColor[] = ['RED', 'BLACK', 'BLUE', 'YELLOW']
  const missing = ALL.filter((c) => !colors.has(c))
  const wildColor = missing.length === 1 ? missing[0]! : null
  return orderedMeld.map((_, i) => (isWild[i] ? wildColor : ownColor(i)))
}

// ─── Lay-off (preserving the okey's represented value) ────────────────────────

/** The multiset of NUMBERS the okey wilds currently represent in `meld`. */
function okeyNumbers(meld: Tile[], okey: Tile): number[] {
  const ordered = orderMeldForDisplay(meld, okey)
  const reps = meldRepresentedValues(ordered, okey)
  const out: number[] = []
  ordered.forEach((t, i) => {
    if (isWildTile(t, okey) && reps[i] != null) out.push(reps[i]!)
  })
  return out
}

/** Is every element of `a` present in `b` with at least the same multiplicity? */
function isSubMultiset(a: number[], b: number[]): boolean {
  const counts = new Map<number, number>()
  for (const x of b) counts.set(x, (counts.get(x) ?? 0) + 1)
  for (const x of a) {
    const c = counts.get(x) ?? 0
    if (c === 0) return false
    counts.set(x, c - 1)
  }
  return true
}

/**
 * Can `additions` be laid off onto run/group `meldTiles` WITHOUT changing the value
 * any okey already on the table represents? (The okey is fixed where it was placed;
 * only an explicit TakeOkey may move it — PO 2026-06-23.)
 *
 * True iff: the target is a run/group (≥3 tiles, never a pair); the merged meld is
 * structurally valid; AND every okey ALREADY in the meld keeps the SAME represented
 * number afterwards — only a freshly-laid okey may introduce a new value. So:
 *  - laying yellow-8 onto [10🟡,11🟡,okey(=12)] is REJECTED (would reinterpret okey as 9),
 *  - laying the OKEY onto [2🔵,3🔵,4🔵,5🔵] is ALLOWED (the wild extends the run as 6;
 *    the player may işle the okey itself — PO 2026-06-30).
 */
export function canLayOff(meldTiles: Tile[], additions: Tile[], okey: Tile, config: VariantConfig): boolean {
  if (additions.length === 0) return false
  if (meldTiles.length < 3) return false // pairs / short melds are never lay-off targets

  const merged = [...meldTiles, ...additions]
  if (!isValidMeldSet([merged], okey, config)) return false

  // Existing okeys must keep their value; the okeys we just added account for any new
  // represented numbers (so a lone okey can extend a meld, but real tiles can't shift
  // an okey already on the table).
  const orig = okeyNumbers(meldTiles, okey)
  const mergedNums = okeyNumbers(merged, okey)
  const addedOkeys = additions.filter((t) => isWildTile(t, okey)).length
  return mergedNums.length === orig.length + addedOkeys && isSubMultiset(orig, mergedNums)
}
