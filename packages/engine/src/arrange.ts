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
 * Canonical tile sort key: wild tiles sort last (after all NUMBER tiles).
 * Among NUMBER tiles: sort by color then number.
 */
function tileKey(t: Tile): string {
  if (t.kind !== 'NUMBER' || t.color == null || t.number == null) return '~wild'
  return `${t.color}|${String(t.number).padStart(2, '0')}`
}

function isWild(t: Tile, okey: Tile): boolean {
  return t.kind === 'FALSE_JOKER' || tilesEqual(t, okey)
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
 */
function firstUndecidedNonWild(state: BtState): number {
  let best = -1
  for (let i = 0; i < state.tiles.length; i++) {
    if (!isUndecided(state, i)) continue
    if (idxIsWild(state, i)) continue
    if (best === -1 || tileKey(state.tiles[i]!) < tileKey(state.tiles[best]!)) {
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
 */
function groupCandidates(
  state: BtState,
  anchorIdx: number,
): Array<{ realIndices: number[]; wildsUsed: number }> {
  const anchor = state.tiles[anchorIdx]!
  if (anchor.kind !== 'NUMBER' || anchor.number == null || anchor.color == null) return []
  const num = anchor.number
  const anchorColor = anchor.color

  // Map color → first undecided index with same number and that color
  const byColor = new Map<TileColor, number>()
  for (let i = 0; i < state.tiles.length; i++) {
    if (i === anchorIdx || !isUndecided(state, i)) continue
    const t = state.tiles[i]!
    if (t.kind === 'NUMBER' && t.number === num && t.color != null && t.color !== anchorColor) {
      if (!byColor.has(t.color)) byColor.set(t.color, i)
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
 */
function runCandidates(
  state: BtState,
  anchorIdx: number,
): Array<{ realIndices: number[]; wildsUsed: number }> {
  const anchor = state.tiles[anchorIdx]!
  if (anchor.kind !== 'NUMBER' || anchor.number == null || anchor.color == null) return []
  const color = anchor.color
  const anchorNum = anchor.number

  // Map number -> first undecided index with this color and number (excluding anchor)
  const byNum = new Map<number, number>()
  for (let i = 0; i < state.tiles.length; i++) {
    if (i === anchorIdx || !isUndecided(state, i)) continue
    const t = state.tiles[i]!
    if (t.kind === 'NUMBER' && t.color === color && t.number != null) {
      if (!byNum.has(t.number)) byNum.set(t.number, i)
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
          n = ((n - 1) % 13) + 1
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
    if (meldedCount > state.bestMeldedCount) {
      state.bestMeldedCount = meldedCount
      state.bestMelds = currentMelds.map((m) => [...m])
      state.bestLeftovers = []
      for (let i = 0; i < state.tiles.length; i++) {
        if (!isMelded(state, i)) state.bestLeftovers.push(state.tiles[i]!)
      }
    }
    return
  }

  // Upper bound pruning: melded so far + all undecided tiles
  const meldedSoFar = countMelded(state)
  let undecidedCount = 0
  for (const s of state.status) if (s === 0) undecidedCount++
  if (meldedSoFar + undecidedCount <= state.bestMeldedCount) return

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

export function arrange(rack: Tile[], okey: Tile, config: VariantConfig): Arrangement {
  if (rack.length === 0) return { melds: [], leftovers: [], meldedCount: 0 }

  // Sort rack for determinism: non-wilds by color+number, wilds last
  const sorted = [...rack].sort((a, b) => tileKey(a).localeCompare(tileKey(b)))

  const state: BtState = {
    tiles: sorted,
    okey,
    config,
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
