import type { Tile, TileColor } from './tile'
import { tilesEqual } from './tile'
import type { VariantConfig } from './config'

export interface Arrangement {
  melds: Tile[][]
  leftovers: Tile[]
  meldedCount: number
}

// ─── Internal helpers ───────────────────────────────────────────────────────

const COLORS: TileColor[] = ['BLACK', 'BLUE', 'RED', 'YELLOW']

/**
 * Canonical tile sort key: wild NUMBER tiles (real okey-valued tiles) sort last.
 * For sorting, a FALSE_JOKER is treated as a NUMBER tile at okey's position.
 * Among NUMBER tiles: sort by color then number.
 */
function tileKey(t: Tile, okey: Tile): string {
  if (t.kind === 'FALSE_JOKER') {
    // Sort FALSE_JOKER same as its concrete value (okey's color+number)
    if (okey.color == null || okey.number == null) return '~wild'
    return `${okey.color}|${String(okey.number).padStart(2, '0')}`
  }
  if (t.kind !== 'NUMBER' || t.color == null || t.number == null) return '~wild'
  return `${t.color}|${String(t.number).padStart(2, '0')}`
}

/**
 * A tile is wild only if it is a real NUMBER tile whose number+color matches okey.
 * FALSE_JOKER is NOT wild — it is a plain tile fixed to okey's value.
 */
function isWild(t: Tile, okey: Tile): boolean {
  return t.kind === 'NUMBER' && t.number === okey.number && t.color === okey.color
}

/**
 * Return the effective number and color of a tile for meld-building purposes.
 * FALSE_JOKER resolves to okey's number and color.
 * NUMBER tiles return their own number and color.
 * Returns null if the tile has no effective number/color.
 */
function effectiveNumberColor(t: Tile, okey: Tile): { number: number; color: TileColor } | null {
  if (t.kind === 'FALSE_JOKER') {
    if (okey.number == null || okey.color == null) return null
    return { number: okey.number, color: okey.color }
  }
  if (t.kind === 'NUMBER' && t.number != null && t.color != null) {
    return { number: t.number, color: t.color }
  }
  return null
}

// ─── Backtracking ─────────────────────────────────────────────────────────────

/**
 * Status: 0 = undecided (not yet processed), 1 = in a meld, 2 = leftover
 */
type TileStatus = 0 | 1 | 2

interface BtState {
  tiles: Tile[]
  okey: Tile
  config: VariantConfig
  status: TileStatus[]
  // Objective: when valueFn is set, maximize meld VALUE (tie-break by count);
  // otherwise maximize melded tile COUNT (the default Klasik behaviour).
  valueFn?: (melds: Tile[][]) => number
  bestValue: number
  // best solution found
  bestMeldedCount: number
  bestMelds: Tile[][]
  bestLeftovers: Tile[]
}

function isUndecided(state: BtState, i: number): boolean {
  return state.status[i] === 0
}

function isMelded(state: BtState, i: number): boolean {
  return state.status[i] === 1
}

function idxIsWild(state: BtState, i: number): boolean {
  return isWild(state.tiles[i]!, state.okey)
}

/** Count tiles with status === 1 (in a meld). */
function countMelded(state: BtState): number {
  let c = 0
  for (const s of state.status) if (s === 1) c++
  return c
}

/**
 * Admissible over-estimate of the value still obtainable from undecided tiles:
 * each contributes at most its face value (a wild at most 13). Used to prune
 * value-mode branches that cannot beat the best arrangement found so far.
 */
function remainingValueUpperBound(state: BtState): number {
  let ub = 0
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.status[i] !== 0) continue
    const t = state.tiles[i]!
    if (isWild(t, state.okey)) { ub += 13; continue }
    const nc = effectiveNumberColor(t, state.okey)
    ub += nc ? nc.number : 0
  }
  return ub
}

/** Count undecided wilds. */
function undecidedWilds(state: BtState): number {
  let w = 0
  for (let i = 0; i < state.tiles.length; i++) {
    if (isUndecided(state, i) && idxIsWild(state, i)) w++
  }
  return w
}

/**
 * Find the index of the first undecided non-wild tile (lexicographic by tileKey).
 * Returns -1 if none.
 * FALSE_JOKER tiles are non-wild (they have a fixed concrete value).
 */
function firstUndecidedNonWild(state: BtState): number {
  let best = -1
  for (let i = 0; i < state.tiles.length; i++) {
    if (!isUndecided(state, i)) continue
    if (idxIsWild(state, i)) continue
    if (best === -1 || tileKey(state.tiles[i]!, state.okey) < tileKey(state.tiles[best]!, state.okey)) {
      best = i
    }
  }
  return best
}

// ─── Meld candidates ──────────────────────────────────────────────────────────

/**
 * Enumerate valid GROUP melds anchored at anchorIdx.
 * A group: same number, distinct colors, size 3 or 4.
 * Wilds fill missing color slots.
 * FALSE_JOKER tiles participate as concrete tiles with okey's number+color.
 */
function groupCandidates(
  state: BtState,
  anchorIdx: number,
): Array<{ realIndices: number[]; wildsUsed: number }> {
  const anchor = state.tiles[anchorIdx]!
  const anchorNC = effectiveNumberColor(anchor, state.okey)
  if (anchorNC === null) return []
  const num = anchorNC.number
  const anchorColor = anchorNC.color

  // Map color → first undecided index with same number and that color
  const byColor = new Map<TileColor, number>()
  for (let i = 0; i < state.tiles.length; i++) {
    if (i === anchorIdx || !isUndecided(state, i)) continue
    if (idxIsWild(state, i)) continue // wilds are handled separately
    const t = state.tiles[i]!
    const nc = effectiveNumberColor(t, state.okey)
    if (nc !== null && nc.number === num && nc.color !== anchorColor) {
      if (!byColor.has(nc.color)) byColor.set(nc.color, i)
    }
  }

  const availableWilds = undecidedWilds(state)
  const otherColors = COLORS.filter((c) => c !== anchorColor)
  const results: Array<{ realIndices: number[]; wildsUsed: number }> = []

  for (const size of [3, 4]) {
    const need = size - 1
    const combos = subsets(otherColors, need)
    for (const combo of combos) {
      const realUsed: number[] = []
      let wildCount = 0
      for (const c of combo) {
        const realIdx = byColor.get(c)
        if (realIdx !== undefined && !realUsed.includes(realIdx)) {
          realUsed.push(realIdx)
        } else {
          wildCount++
        }
      }
      if (wildCount <= availableWilds) {
        results.push({ realIndices: [anchorIdx, ...realUsed], wildsUsed: wildCount })
      }
    }
  }

  return results
}

/**
 * Enumerate valid RUN melds anchored at anchorIdx.
 * A run: same color, consecutive numbers, length >= 3, optional 13->1 wrap.
 * Wilds fill gaps.
 * FALSE_JOKER tiles participate as concrete tiles with okey's number+color.
 */
function runCandidates(
  state: BtState,
  anchorIdx: number,
): Array<{ realIndices: number[]; wildsUsed: number }> {
  const anchor = state.tiles[anchorIdx]!
  const anchorNC = effectiveNumberColor(anchor, state.okey)
  if (anchorNC === null) return []
  const color = anchorNC.color
  const anchorNum = anchorNC.number

  // Map number -> first undecided non-wild index with this color and number (excluding anchor)
  const byNum = new Map<number, number>()
  for (let i = 0; i < state.tiles.length; i++) {
    if (i === anchorIdx || !isUndecided(state, i)) continue
    if (idxIsWild(state, i)) continue // wilds are handled separately
    const t = state.tiles[i]!
    const nc = effectiveNumberColor(t, state.okey)
    if (nc !== null && nc.color === color) {
      if (!byNum.has(nc.number)) byNum.set(nc.number, i)
    }
  }

  const totalWilds = undecidedWilds(state)
  const results: Array<{ realIndices: number[]; wildsUsed: number }> = []
  const tried = new Set<string>()

  for (let len = 3; len <= 13; len++) {
    for (let pos = 0; pos < len; pos++) {
      let startNum = anchorNum - pos
      if (startNum < 1) {
        if (!state.config.runWrap13to1) continue
        // Wrap into 1..13
        while (startNum < 1) startNum += 13
      }

      const key = `${len}:${startNum}`
      if (tried.has(key)) continue
      tried.add(key)

      // Build sequence
      const seq: number[] = []
      let validSeq = true
      for (let i = 0; i < len; i++) {
        let n = startNum + i
        if (n > 13) {
          if (!state.config.runWrap13to1) { validSeq = false; break }
          // A 13→1 wrap is legal ONLY as the final tile (…,12,13,1). Anything past
          // the 1 (13,1,2,3 …) is not a run, so reject n>14 or a non-final wrap.
          if (n !== 14 || i !== len - 1) { validSeq = false; break }
          n = 1
        }
        if (seq.includes(n)) { validSeq = false; break }
        seq.push(n)
      }
      if (!validSeq || !seq.includes(anchorNum)) continue

      // Fill sequence
      let wildsUsed = 0
      const realIndices: number[] = []
      const usedIdx = new Set<number>([anchorIdx])
      let canBuild = true

      for (const n of seq) {
        if (n === anchorNum) {
          realIndices.push(anchorIdx)
        } else {
          // Find an undecided, unused tile with this color+number
          let found = false
          const candidate = byNum.get(n)
          if (candidate !== undefined && !usedIdx.has(candidate)) {
            realIndices.push(candidate)
            usedIdx.add(candidate)
            found = true
          }
          if (!found) {
            wildsUsed++
            if (wildsUsed > totalWilds) { canBuild = false; break }
          }
        }
      }

      if (canBuild) {
        results.push({ realIndices, wildsUsed })
      }
    }
  }

  return results
}

// ─── Main backtracking ────────────────────────────────────────────────────────

function backtrack(state: BtState, currentMelds: Tile[][]): void {
  const anchorIdx = firstUndecidedNonWild(state)

  if (anchorIdx === -1) {
    // All non-wild tiles are decided. Remaining undecided wilds go to leftovers.
    const meldedCount = countMelded(state)
    const recordBest = () => {
      state.bestMeldedCount = meldedCount
      state.bestMelds = currentMelds.map((m) => [...m])
      state.bestLeftovers = []
      for (let i = 0; i < state.tiles.length; i++) {
        if (!isMelded(state, i)) state.bestLeftovers.push(state.tiles[i]!)
      }
    }
    if (state.valueFn) {
      // Maximize total meld value (tie-break by melded count).
      const v = state.valueFn(currentMelds)
      if (v > state.bestValue || (v === state.bestValue && meldedCount > state.bestMeldedCount)) {
        state.bestValue = v
        recordBest()
      }
    } else if (meldedCount > state.bestMeldedCount) {
      recordBest()
    }
    return
  }

  // Upper-bound pruning.
  if (state.valueFn) {
    // Value mode: current value + best-case value of all undecided tiles.
    // Use `<` (not `<=`): a branch that can only TIE the best value may still
    // win the meld-count tie-break (see the accept condition), so don't prune it.
    const cur = state.valueFn(currentMelds)
    if (cur + remainingValueUpperBound(state) < state.bestValue) return
  } else {
    // Count mode: melded so far + all undecided tiles.
    const meldedSoFar = countMelded(state)
    let undecidedCount = 0
    for (const s of state.status) if (s === 0) undecidedCount++
    if (meldedSoFar + undecidedCount <= state.bestMeldedCount) return
  }

  // Option A: place anchor in a GROUP meld
  const groups = groupCandidates(state, anchorIdx)
  for (const g of groups) {
    // Mark real tiles as melded
    for (const ri of g.realIndices) state.status[ri] = 1

    // Mark wilds as melded
    const wildsMelded: number[] = []
    let wLeft = g.wildsUsed
    for (let i = 0; i < state.tiles.length && wLeft > 0; i++) {
      if (isUndecided(state, i) && idxIsWild(state, i)) {
        state.status[i] = 1
        wildsMelded.push(i)
        wLeft--
      }
    }

    const meldTiles = [
      ...g.realIndices.map((ri) => state.tiles[ri]!),
      ...wildsMelded.map((wi) => state.tiles[wi]!),
    ]
    currentMelds.push(meldTiles)
    backtrack(state, currentMelds)
    currentMelds.pop()

    // Undo
    for (const ri of g.realIndices) state.status[ri] = 0
    for (const wi of wildsMelded) state.status[wi] = 0
  }

  // Option B: place anchor in a RUN meld
  const runs = runCandidates(state, anchorIdx)
  for (const r of runs) {
    for (const ri of r.realIndices) state.status[ri] = 1

    const wildsMelded: number[] = []
    let wLeft = r.wildsUsed
    for (let i = 0; i < state.tiles.length && wLeft > 0; i++) {
      if (isUndecided(state, i) && idxIsWild(state, i)) {
        state.status[i] = 1
        wildsMelded.push(i)
        wLeft--
      }
    }

    const meldTiles = [
      ...r.realIndices.map((ri) => state.tiles[ri]!),
      ...wildsMelded.map((wi) => state.tiles[wi]!),
    ]
    currentMelds.push(meldTiles)
    backtrack(state, currentMelds)
    currentMelds.pop()

    for (const ri of r.realIndices) state.status[ri] = 0
    for (const wi of wildsMelded) state.status[wi] = 0
  }

  // Option C: skip anchor to leftovers
  state.status[anchorIdx] = 2
  backtrack(state, currentMelds)
  state.status[anchorIdx] = 0
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Partition a rack into melds + leftovers.
 *
 * Default objective: maximize melded tile COUNT (good for Klasik, where the goal
 * is to meld everything). Pass `valueFn` to maximize total meld VALUE instead
 * (used by 101's "Sırala", which should place the okey/false-joker in the
 * highest-value slots so the player can reach ≥101).
 */
export function arrange(
  rack: Tile[],
  okey: Tile,
  config: VariantConfig,
  valueFn?: (melds: Tile[][]) => number,
): Arrangement {
  if (rack.length === 0) return { melds: [], leftovers: [], meldedCount: 0 }

  // Sort rack for determinism: non-wilds (including FALSE_JOKER) by color+number, wilds last.
  // FALSE_JOKER tiles sort at okey's position (they are plain tiles, not wilds).
  const sorted = [...rack].sort((a, b) => tileKey(a, okey).localeCompare(tileKey(b, okey)))

  const state: BtState = {
    tiles: sorted,
    okey,
    config,
    valueFn,
    bestValue: -1,
    status: new Array<TileStatus>(sorted.length).fill(0),
    bestMeldedCount: 0,
    bestMelds: [],
    bestLeftovers: [...sorted],
  }

  backtrack(state, [])

  return {
    melds: state.bestMelds,
    leftovers: state.bestLeftovers,
    meldedCount: state.bestMeldedCount,
  }
}

export function suggestDiscard(rack: Tile[], okey: Tile, config: VariantConfig): Tile {
  const result = arrange(rack, okey, config)

  if (result.leftovers.length === 0) {
    // Fully melded — return last tile of the rack
    return rack[rack.length - 1]!
  }

  // Find a leftover with no near-meld partner in the rack:
  // - no same-number tile (for group potential)
  // - no same-color tile with number ±1 or ±2 (for run potential)
  for (const leftover of result.leftovers) {
    if (leftover.kind !== 'NUMBER' || leftover.number == null || leftover.color == null) continue
    const num = leftover.number
    const col = leftover.color
    let hasPartner = false
    for (const t of rack) {
      if (tilesEqual(t, leftover)) continue
      if (isWild(t, okey)) continue
      if (t.kind !== 'NUMBER' || t.number == null || t.color == null) continue
      // Group potential
      if (t.number === num && t.color !== col) { hasPartner = true; break }
      // Run potential
      if (t.color === col) {
        const diff = Math.abs(t.number - num)
        if (diff === 1 || diff === 2) { hasPartner = true; break }
      }
    }
    if (!hasPartner) return leftover
  }

  // All leftovers have some partner — return first leftover
  return result.leftovers[0]!
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Return all subsets of `arr` of exactly `k` elements. */
function subsets<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [head, ...tail] = arr as [T, ...T[]]
  const withHead = subsets(tail, k - 1).map((s) => [head, ...s])
  const withoutHead = subsets(tail, k)
  return [...withHead, ...withoutHead]
}
