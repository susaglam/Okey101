// packages/engine/test/reduce101.test.ts
import { describe, it, expect } from 'vitest'
import { reduce, RuleError } from '../src/reduce'
import { isValidMeldSet } from '../src/open'
import { scoreHand101 } from '../src/scoring/yuzbir'
import { legalMoves101 } from '../src/rules/yuzbir'
import { KLASIK_101, KLASIK } from '../src/config'
import { tileFromString, tilesEqual, tileToString } from '../src/tile'
import type { Tile } from '../src/tile'
import type { GameState } from '../src/state'
import { buildDeck } from '../src/deck'

// ── helpers ──────────────────────────────────────────────────────────────────

function h(...strs: string[]): Tile[] {
  return strs.map(tileFromString)
}

/** Bootstrap a 101 game and deal one hand. */
function start101(seed = 1): GameState {
  let s = reduce(null, { type: 'CreateGame', gameId: 'g101', seed, config: KLASIK_101 })
  s = reduce(s, { type: 'StartHand' })
  return s
}

// ── Deal integrity + RNG variety + stock accounting ──────────────────────────

/** Stable multiset signature of a tile list (order-independent). */
function multisetKey(tiles: Tile[]): string {
  return tiles.map(tileToString).sort().join('|')
}

describe('Deal integrity & RNG variety', () => {
  it('deals the full 106-tile deck with no missing or duplicate tiles', () => {
    const s = start101()
    const all = [
      ...s.players.flatMap((p) => p.rack),
      ...s.stock,
      ...(s.indicator ? [s.indicator] : []),
    ]
    expect(all).toHaveLength(106)
    expect(multisetKey(all)).toEqual(multisetKey(buildDeck(KLASIK_101)))
  })

  it('different seeds produce different deals (RNG is varied)', () => {
    // Ordered starter hand so we detect identical shuffles, not just same multiset.
    const ordered = (seed: number) => start101(seed).players[0]!.rack.map(tileToString).join(',')
    expect(new Set([ordered(1), ordered(2), ordered(3), ordered(12345), ordered(99999)]).size).toBe(5)
  })
})

describe('Stock accounting', () => {
  it('stock decreases by 1 on DrawFromStock and is unchanged on DrawFromDiscard', () => {
    let s = start101()
    // seat 0 discards so seat 1 has a floor tile available from its left (seat 0)
    s = reduce(s, { type: 'Discard', seat: 0, tile: s.players[0]!.rack[0]! })
    const before = s.stock.length
    const fromStock = reduce(s, { type: 'DrawFromStock', seat: 1 })
    expect(fromStock.stock.length).toBe(before - 1)
    const fromFloor = reduce(s, { type: 'DrawFromDiscard', seat: 1 })
    expect(fromFloor.stock.length).toBe(before)
  })
})

// ── StartHand (101 deal) ──────────────────────────────────────────────────────

describe('StartHand — 101 deal', () => {
  it('deals 22 tiles to starter (seat 0) and 21 to others', () => {
    const s = start101()
    expect(s.players[0]!.rack).toHaveLength(22) // starter = tilesInRack+starterExtra = 21+1
    expect(s.players[1]!.rack).toHaveLength(21)
    expect(s.players[2]!.rack).toHaveLength(21)
    expect(s.players[3]!.rack).toHaveLength(21)
  })

  it('leaves exactly 20 tiles in the stock', () => {
    // 106 deck − 1 indicator − (22+21+21+21) dealt = 20
    const s = start101()
    expect(s.stock).toHaveLength(20)
  })

  it('flips an indicator and derives okey', () => {
    const s = start101()
    expect(s.indicator).toBeDefined()
    expect(s.okey).toBeDefined()
  })

  it('never flips a FALSE JOKER as the indicator (PO rule), across many seeds', () => {
    // A false joker can never be the indicator: StartHand re-flips until a NUMBER
    // turns up. Verify the indicator is always a numbered tile (and never riziko).
    for (let seed = 1; seed <= 500; seed++) {
      const s = start101(seed)
      expect(s.indicator?.kind).toBe('NUMBER')
      expect(s.rizikoActive).toBe(false)
    }
  })

  it('resets per-hand 101 flags: declaredCift=false, openedValue=0, hasOpened=false', () => {
    const s = start101()
    for (const p of s.players) {
      expect(p.declaredCift).toBe(false)
      expect(p.openedValue).toBe(0)
      expect(p.hasOpened).toBe(false)
    }
  })

  it('resets tableMelds to empty and penaltiesApplied to empty', () => {
    const s = start101()
    expect(s.tableMelds).toEqual([])
    expect(s.penaltiesApplied).toEqual([])
  })

  it('sets turn to seat 0, phase DISCARD (starter acts first)', () => {
    const s = start101()
    expect(s.turn).toEqual({ seat: 0, phase: 'DISCARD' })
  })

  it('rotates the starter clockwise each hand (hand 2 → seat 1)', () => {
    let s = reduce(null, { type: 'CreateGame', gameId: 'gr', seed: 5, config: KLASIK_101 })
    s = reduce(s, { type: 'StartHand' }) // hand 1 → starter seat 0
    expect(s.turn.seat).toBe(0)
    expect(s.players[0]!.rack).toHaveLength(22)
    s = reduce(s, { type: 'StartHand' }) // hand 2 → starter seat 1
    expect(s.turn.seat).toBe(1)
    expect(s.players[1]!.rack).toHaveLength(22)
    expect(s.players[0]!.rack).toHaveLength(21)
    s = reduce(s, { type: 'StartHand' }) // hand 3 → starter seat 2
    expect(s.turn.seat).toBe(2)
    expect(s.players[2]!.rack).toHaveLength(22)
  })

  it('clears the previous hand’s table melds on a new StartHand', () => {
    let s = reduce(null, { type: 'CreateGame', gameId: 'g-clear', seed: 4, config: KLASIK_101 })
    s = reduce(s, { type: 'StartHand' })
    // Simulate melds laid during the hand.
    s = { ...s, tableMelds: [{ owner: 0, kind: 'run', tiles: h('5R', '6R', '7R') }] }
    const s2 = reduce(s, { type: 'StartHand' })
    expect(s2.tableMelds).toEqual([])
  })

  // Klasik still deals 15/14/14/14 (regression guard)
  it('Klasik StartHand still deals 15 to starter and 14 to others', () => {
    let s = reduce(null, { type: 'CreateGame', gameId: 'gk', seed: 99, config: KLASIK })
    s = reduce(s, { type: 'StartHand' })
    expect(s.players[0]!.rack).toHaveLength(15)
    expect(s.players[1]!.rack).toHaveLength(14)
    expect(s.stock).toHaveLength(48) // 106-1-57
  })
})

// ── Stock exhaustion ends the hand on the discard that empties the draw ───────

describe('stock exhaustion ends the hand proactively', () => {
  it('101: a discard with an empty stock ends the hand (exhausted), not the next draw', () => {
    const base = start101()
    const s: GameState = { ...base, stock: [], turn: { seat: 0, phase: 'DISCARD' } }
    const tile = s.players[0]!.rack[0]!
    const s2 = reduce(s, { type: 'Discard', seat: 0, tile })
    expect(s2.status).toBe('ENDED')
    expect(s2.terminal?.reason).toBe('exhausted')
  })

  it('Klasik: a discard with an empty stock voids the hand (hand-void)', () => {
    let s = reduce(null, { type: 'CreateGame', gameId: 'gx', seed: 3, config: KLASIK })
    s = reduce(s, { type: 'StartHand' })
    s = { ...s, stock: [], turn: { seat: 0, phase: 'DISCARD' } }
    const tile = s.players[0]!.rack[0]!
    const s2 = reduce(s, { type: 'Discard', seat: 0, tile })
    expect(s2.status).toBe('ENDED')
    expect(s2.terminal?.reason).toBe('hand-void')
  })
})

// ── DeclareCift ───────────────────────────────────────────────────────────────

describe('DeclareCift', () => {
  it('sets declaredCift=true for the acting seat', () => {
    const s = start101() // seat 0 in DISCARD
    const s2 = reduce(s, { type: 'DeclareCift', seat: 0 })
    expect(s2.players[0]!.declaredCift).toBe(true)
    // Others unchanged
    expect(s2.players[1]!.declaredCift).toBe(false)
  })

  it('throws RuleError if not that seat\'s turn', () => {
    const s = start101()
    expect(() => reduce(s, { type: 'DeclareCift', seat: 1 })).toThrow(RuleError)
  })

  it('throws RuleError if not DISCARD phase', () => {
    // seat 0 discards → seat 1 in DRAW
    let s = start101()
    s = reduce(s, { type: 'Discard', seat: 0, tile: s.players[0]!.rack[0]! })
    expect(() => reduce(s, { type: 'DeclareCift', seat: 1 })).toThrow(RuleError)
  })
})

// ── OpenMeld ──────────────────────────────────────────────────────────────────

/**
 * Build a state where the given seat holds specific tiles in the rack
 * and it is that seat's DISCARD phase.
 * We directly mutate a started game state for testing purposes.
 */
function stateWithRack(seat: number, tiles: Tile[]): GameState {
  const s = start101()
  // Force seat 0 into DISCARD and assign whatever rack we need
  return {
    ...s,
    turn: { seat, phase: 'DISCARD' },
    status: 'PLAYING',
    players: s.players.map((p) =>
      p.seat === seat ? { ...p, rack: tiles } : p
    ),
  }
}

describe('OpenMeld', () => {
  // A meld set that clearly sums ≥101: 11R,12R,13R=36 + 11K,12K,13K=36 + 11M,12M,13M=36 → 108
  const bigMelds = [
    h('11R', '12R', '13R'),
    h('11K', '12K', '13K'),
    h('11M', '12M', '13M'),
  ]
  const bigRackTiles = [
    ...h('11R', '12R', '13R', '11K', '12K', '13K', '11M', '12M', '13M'),
    ...h('1R', '2R', '3R'), // filler tiles
  ]

  // Small melds that sum <101: 5R,6R,7R=18
  const smallMelds = [h('5R', '6R', '7R')]
  const smallRackTiles = h('5R', '6R', '7R', '1K', '2K', '3K', '4K', '5K', '6K', '7K', '8K', '9K')

  it('moves tiles from rack to tableMelds and sets hasOpened+openedValue', () => {
    // Need the okey to not be 7M (used in big melds) — use a state where okey is something else
    const base = start101()
    const okeyTile = base.okey!
    // Build a valid ≥101 meld set that avoids the okey tile
    // Use tiles that won't collide with okey
    const s = {
      ...base,
      turn: { seat: 0, phase: 'DISCARD' as const },
      players: base.players.map((p) =>
        p.seat === 0 ? { ...p, rack: bigRackTiles } : p
      ),
    }
    // Determine okey; since we deal deterministically with seed=1, just pass the actual okey
    const s2 = reduce(s, { type: 'OpenMeld', seat: 0, melds: bigMelds })
    const p0 = s2.players[0]!
    expect(p0.hasOpened).toBe(true)
    expect(p0.openedValue).toBeGreaterThanOrEqual(101)
    // The laid tiles (9 tiles) should be in tableMelds
    expect(s2.tableMelds).toBeDefined()
    expect(s2.tableMelds!.length).toBe(3)
    // Rack should shrink by 9
    expect(p0.rack).toHaveLength(bigRackTiles.length - 9)
  })

  it('throws RuleError when opening value < 101', () => {
    const base = start101()
    const s = {
      ...base,
      turn: { seat: 0, phase: 'DISCARD' as const },
      players: base.players.map((p) =>
        p.seat === 0 ? { ...p, rack: smallRackTiles } : p
      ),
    }
    expect(() => reduce(s, { type: 'OpenMeld', seat: 0, melds: smallMelds })).toThrow(RuleError)
  })

  it('throws RuleError if not the acting seat', () => {
    const s = start101()
    expect(() => reduce(s, { type: 'OpenMeld', seat: 1, melds: bigMelds })).toThrow(RuleError)
  })

  it('throws RuleError if not DISCARD phase', () => {
    let s = start101()
    // Advance to seat 1 DRAW phase
    s = reduce(s, { type: 'Discard', seat: 0, tile: s.players[0]!.rack[0]! })
    expect(() => reduce(s, { type: 'OpenMeld', seat: 1, melds: bigMelds })).toThrow(RuleError)
  })

  // Kural 11 (PO 2026-06-20): taking a tile from the floor carries NO penalty
  // for anyone ("işlek cezası yok"). Opening after a floor-take must NOT create
  // an islek-floor-open penalty against the left neighbour (or anyone).
  it('records NO işlek penalty when opening after a floor-take (tookFromLeft=true)', () => {
    const base = start101()
    const s: GameState = {
      ...base,
      turn: { seat: 1, phase: 'DISCARD', tookFromLeft: true } as GameState['turn'] & { tookFromLeft: boolean },
      players: base.players.map((p) =>
        p.seat === 1 ? { ...p, rack: bigRackTiles } : p
      ),
    }
    const s2 = reduce(s, { type: 'OpenMeld', seat: 1, melds: bigMelds })
    expect((s2.penaltiesApplied ?? []).filter((pe) => pe.type === 'islek-floor-open').length).toBe(0)
  })
})

// ── LayOff ────────────────────────────────────────────────────────────────────

describe('LayOff', () => {
  /** Build a state where seat 0 has already opened, tableMelds has one run, and rack has extras. */
  function openedState(): GameState {
    const base = start101()
    const bigRack = [
      ...h('11R', '12R', '13R', '11K', '12K', '13K', '11M', '12M', '13M'),
      ...h('1R', '2R', '3R'),
      ...h('9R'), // extra tile we can lay off
    ]
    const s: GameState = {
      ...base,
      turn: { seat: 0, phase: 'DISCARD' },
      players: base.players.map((p) =>
        p.seat === 0 ? { ...p, rack: bigRack } : p
      ),
    }
    // Open
    const melds = [
      h('11R', '12R', '13R'),
      h('11K', '12K', '13K'),
      h('11M', '12M', '13M'),
    ]
    return reduce(s, { type: 'OpenMeld', seat: 0, melds })
  }

  it('adds a tile to an existing table meld', () => {
    const s = openedState()
    // tableMelds[0] should be 11R,12R,13R. We can add 10R to extend it.
    // First check that seat 0 has 10R (from filler rack h('1R','2R','3R') — it won't have 10R)
    // Actually we need to put 10R explicitly in seat 0's rack after opening.
    const extraTile = tileFromString('10R')
    const s2: GameState = {
      ...s,
      players: s.players.map((p) =>
        p.seat === 0 ? { ...p, rack: [...p.rack, extraTile] } : p
      ),
    }
    const before = s2.players[0]!.rack.length
    const s3 = reduce(s2, { type: 'LayOff', seat: 0, meldIndex: 0, tiles: [extraTile] })
    expect(s3.players[0]!.rack).toHaveLength(before - 1)
    expect(s3.tableMelds![0]!.tiles.length).toBe(4) // was 3, now 4
  })

  it('lays a tile onto the FRONT of a run (prepend) — order-insensitive validity', () => {
    // Repro of the reported case: a run 2R-3R-4R-5R-6R is on the table and the
    // player lays 1R, which belongs at the FRONT. The engine appends to the end
    // of the stored array ([2,3,4,5,6,1]) but isValidRun is order-insensitive, so
    // the lay-off is accepted and the meld remains a valid run.
    const base = start101()
    const run = h('2R', '3R', '4R', '5R', '6R')
    const one = tileFromString('1R')
    const s: GameState = {
      ...base,
      turn: { seat: 0, phase: 'DISCARD' },
      tableMelds: [{ owner: 0, kind: 'run', tiles: run }],
      players: base.players.map((p) =>
        p.seat === 0 ? { ...p, hasOpened: true, openRoute: 'seri' as const, rack: [one, tileFromString('9K')] } : p
      ),
    }
    const s2 = reduce(s, { type: 'LayOff', seat: 0, meldIndex: 0, tiles: [one] })
    expect(s2.tableMelds![0]!.tiles).toHaveLength(6)
    // The stored meld is still a valid run regardless of physical tile order.
    expect(isValidMeldSet([s2.tableMelds![0]!.tiles], s2.okey!, s2.config)).toBe(true)
    expect(s2.players[0]!.rack).toHaveLength(1) // 1R laid off, 9K kept as finisher
  })

  it('throws RuleError when layoff tiles exceed cap (2 per run per turn)', () => {
    const s = openedState()
    // Try adding 3 tiles at once to a run — cap is 2
    const t1 = tileFromString('10R')
    const t2 = tileFromString('9R') // 9R is in rack from bigRack
    const t3 = tileFromString('8R')
    const s2: GameState = {
      ...s,
      players: s.players.map((p) =>
        p.seat === 0 ? { ...p, rack: [...p.rack, t1, t2, t3] } : p
      ),
    }
    expect(() =>
      reduce(s2, { type: 'LayOff', seat: 0, meldIndex: 0, tiles: [t1, t2, t3] })
    ).toThrow(RuleError)
  })

  it('rejects laying off onto a PAIR meld (a çift cannot be extended into a group)', () => {
    const base = start101()
    // A pair on the table; seat 0 opened via çift and holds a third matching tile.
    // Laying the 4K onto [4R,4R] would make a group of 4s — not allowed.
    const s: GameState = {
      ...base,
      turn: { seat: 0, phase: 'DISCARD' },
      tableMelds: [{ owner: 0, kind: 'pair', tiles: [tileFromString('4R'), tileFromString('4R')] }],
      players: base.players.map((p) =>
        p.seat === 0
          ? { ...p, hasOpened: true, declaredCift: true, openRoute: 'cift', rack: [tileFromString('4K'), tileFromString('9M')] }
          : p
      ),
    }
    expect(() =>
      reduce(s, { type: 'LayOff', seat: 0, meldIndex: 0, tiles: [tileFromString('4K')] })
    ).toThrow(RuleError)
  })

  it('throws RuleError if player has not opened yet', () => {
    const base = start101()
    const s: GameState = {
      ...base,
      turn: { seat: 0, phase: 'DISCARD' },
      players: base.players.map((p) =>
        p.seat === 0 ? { ...p, hasOpened: false } : p
      ),
      tableMelds: [{ owner: 1, kind: 'run', tiles: h('5R', '6R', '7R') }],
    }
    const extraTile = tileFromString('8R')
    const s2 = {
      ...s,
      players: s.players.map((p) =>
        p.seat === 0 ? { ...p, rack: [extraTile] } : p
      ),
    }
    expect(() =>
      reduce(s2, { type: 'LayOff', seat: 0, meldIndex: 0, tiles: [extraTile] })
    ).toThrow(RuleError)
  })

  it('throws RuleError if resulting meld is not valid after lay-off', () => {
    const s = openedState()
    // tableMelds[0] = 11R,12R,13R (run). Adding 5S would break it.
    const badTile = tileFromString('5S')
    const s2: GameState = {
      ...s,
      players: s.players.map((p) =>
        p.seat === 0 ? { ...p, rack: [...p.rack, badTile] } : p
      ),
    }
    expect(() =>
      reduce(s2, { type: 'LayOff', seat: 0, meldIndex: 0, tiles: [badTile] })
    ).toThrow(RuleError)
  })

  it('throws RuleError if meldIndex is out of bounds', () => {
    const s = openedState()
    const extraTile = tileFromString('10R')
    const s2: GameState = {
      ...s,
      players: s.players.map((p) =>
        p.seat === 0 ? { ...p, rack: [...p.rack, extraTile] } : p
      ),
    }
    expect(() =>
      reduce(s2, { type: 'LayOff', seat: 0, meldIndex: 99, tiles: [extraTile] })
    ).toThrow(RuleError)
  })

  it('throws RuleError if a lay-off would empty the rack (must keep a finishing tile)', () => {
    const s = openedState()
    // Reduce seat 0 to a single tile that fits tableMelds[0] (11R,12R,13R → add 10R).
    const lastTile = tileFromString('10R')
    const s2: GameState = {
      ...s,
      players: s.players.map((p) => (p.seat === 0 ? { ...p, rack: [lastTile] } : p)),
    }
    expect(() =>
      reduce(s2, { type: 'LayOff', seat: 0, meldIndex: 0, tiles: [lastTile] })
    ).toThrow(RuleError)
  })

  it('allows a lay-off that leaves exactly one tile (the finishing tile)', () => {
    const s = openedState()
    // Two tiles: 10R lays onto the run; the other (1K) stays to be discarded.
    const s2: GameState = {
      ...s,
      players: s.players.map((p) =>
        p.seat === 0 ? { ...p, rack: h('10R', '1K') } : p
      ),
    }
    const s3 = reduce(s2, { type: 'LayOff', seat: 0, meldIndex: 0, tiles: [tileFromString('10R')] })
    expect(s3.players[0]!.rack).toHaveLength(1)
    expect(s3.tableMelds![0]!.tiles.length).toBe(4)
  })
})

// ── TakeOkey — swap a real tile for the okey on the table ─────────────────────

describe('TakeOkey', () => {
  const okey = tileFromString('8K') // wild = 8K

  /** seat 0 has opened; a table run [1R, okey(=2), 3R] exists; rack holds the real 2R. */
  function swapState(rack: string[]): GameState {
    const base = start101()
    return {
      ...base,
      okey,
      turn: { seat: 0, phase: 'DISCARD' },
      tableMelds: [{ owner: 1, kind: 'run', tiles: [tileFromString('1R'), okey, tileFromString('3R')] }],
      players: base.players.map((p) => (p.seat === 0 ? { ...p, hasOpened: true, rack: h(...rack) } : p)),
    }
  }

  it('inserts the real tile into the meld and returns the okey to the rack', () => {
    const s = swapState(['2R', '9R'])
    const s2 = reduce(s, { type: 'TakeOkey', seat: 0, meldIndex: 0, tile: tileFromString('2R') })
    // meld is now a concrete run 1R,2R,3R (no okey)
    const meldTiles = s2.tableMelds![0]!.tiles
    expect(meldTiles.some((t) => tilesEqual(t, okey))).toBe(false)
    expect(meldTiles.some((t) => tilesEqual(t, tileFromString('2R')))).toBe(true)
    // rack: 9R stays, 2R gone, okey gained (net size unchanged)
    const rack = s2.players[0]!.rack
    expect(rack).toHaveLength(2)
    expect(rack.some((t) => tilesEqual(t, okey))).toBe(true)
    expect(rack.some((t) => tilesEqual(t, tileFromString('2R')))).toBe(false)
  })

  it('rejects when the inserted tile would not fit the okey slot (invalid meld)', () => {
    const s = swapState(['5R', '9R']) // 5R cannot fill the 2-slot in 1-_-3
    expect(() =>
      reduce(s, { type: 'TakeOkey', seat: 0, meldIndex: 0, tile: tileFromString('5R') }),
    ).toThrow(RuleError)
  })

  it('rejects when the player does not hold the tile', () => {
    const s = swapState(['9R'])
    expect(() =>
      reduce(s, { type: 'TakeOkey', seat: 0, meldIndex: 0, tile: tileFromString('2R') }),
    ).toThrow(RuleError)
  })

  it('rejects when the player has not opened', () => {
    const base = start101()
    const s: GameState = {
      ...base,
      okey,
      turn: { seat: 0, phase: 'DISCARD' },
      tableMelds: [{ owner: 1, kind: 'run', tiles: [tileFromString('1R'), okey, tileFromString('3R')] }],
      players: base.players.map((p) => (p.seat === 0 ? { ...p, hasOpened: false, rack: h('2R', '9R') } : p)),
    }
    expect(() =>
      reduce(s, { type: 'TakeOkey', seat: 0, meldIndex: 0, tile: tileFromString('2R') }),
    ).toThrow(RuleError)
  })

  /** Build an opened seat-0 state with a single arbitrary table meld + rack. */
  function meldState(meld: Tile[], kind: 'run' | 'group' | 'pair', rack: string[]): GameState {
    const base = start101()
    return {
      ...base,
      okey,
      turn: { seat: 0, phase: 'DISCARD' },
      tableMelds: [{ owner: 1, kind, tiles: meld }],
      players: base.players.map((p) => (p.seat === 0 ? { ...p, hasOpened: true, rack: h(...rack) } : p)),
    }
  }

  it('takes the okey from a PAIR (per ya da çift olması fark etmez)', () => {
    const s = meldState([tileFromString('13K'), okey], 'pair', ['13K', '9R'])
    const s2 = reduce(s, { type: 'TakeOkey', seat: 0, meldIndex: 0, tile: tileFromString('13K') })
    const meld = s2.tableMelds![0]!.tiles
    expect(meld.some((t) => tilesEqual(t, okey))).toBe(false)
    expect(meld.filter((t) => tilesEqual(t, tileFromString('13K')))).toHaveLength(2)
    expect(s2.players[0]!.rack.some((t) => tilesEqual(t, okey))).toBe(true)
  })

  it('rejects taking the okey from an ambiguous same-number group (colour not pinned)', () => {
    // [7♦blue 7♥red okey] — okey could be yellow-7 OR black-7. A single tile is
    // not enough; the meld must be completed first so only one colour remains.
    const s = meldState([tileFromString('7M'), tileFromString('7R'), okey], 'group', ['7S', '9R'])
    expect(() =>
      reduce(s, { type: 'TakeOkey', seat: 0, meldIndex: 0, tile: tileFromString('7S') }),
    ).toThrow(RuleError)
  })

  it('takes the okey from a 4-tile group once only one colour is missing', () => {
    // blue/red/yellow present → okey is pinned to black-7 → 7K takes it.
    const s = meldState([tileFromString('7M'), tileFromString('7R'), tileFromString('7S'), okey], 'group', ['7K', '9R'])
    const s2 = reduce(s, { type: 'TakeOkey', seat: 0, meldIndex: 0, tile: tileFromString('7K') })
    const meld = s2.tableMelds![0]!.tiles
    expect(meld.some((t) => tilesEqual(t, okey))).toBe(false)
    expect(meld.some((t) => tilesEqual(t, tileFromString('7K')))).toBe(true)
  })
})

describe('RetractOpen — undo this turn’s open before discarding', () => {
  const openMelds = () => [h('11R', '12R', '13R'), h('11K', '12K', '13K'), h('11M', '12M', '13M')]
  // seat 0 opens (108 ≥ 101) this turn, keeping two fillers so a later discard
  // does not finish the hand.
  function openedState(extraTurn: Partial<{ tookFromLeft: boolean; floorTileTaken: Tile }> = {}): GameState {
    const base = start101()
    const rack = [...openMelds().flat(), tileFromString('2S'), tileFromString('3S')]
    const s: GameState = {
      ...base,
      okey: tileFromString('5S'),
      turn: { seat: 0, phase: 'DISCARD', ...extraTurn },
      players: base.players.map((p) => (p.seat === 0 ? { ...p, hasOpened: false, rack } : p)),
    }
    return reduce(s, { type: 'OpenMeld', seat: 0, melds: openMelds() })
  }

  it('restores the rack, open flags and table on retract', () => {
    const opened = openedState()
    expect(opened.players[0]!.hasOpened).toBe(true)
    expect(opened.tableMelds!).toHaveLength(3)
    const r = reduce(opened, { type: 'RetractOpen', seat: 0 })
    expect(r.players[0]!.hasOpened).toBe(false)
    expect(r.players[0]!.rack).toHaveLength(11) // 9 meld tiles + 2 fillers back
    expect(r.tableMelds ?? []).toHaveLength(0)
    expect((r.turn as { openSnapshot?: unknown }).openSnapshot).toBeUndefined()
  })

  it('is FINAL once the open is followed by a discard (turn advances)', () => {
    const opened = openedState()
    const afterDiscard = reduce(opened, { type: 'Discard', seat: 0, tile: tileFromString('2S') })
    expect((afterDiscard.turn as { openSnapshot?: unknown }).openSnapshot).toBeUndefined()
    expect(() => reduce(afterDiscard, { type: 'RetractOpen', seat: 0 })).toThrow(RuleError)
  })

  it('reverts the işlek penalty when a floor-take open is retracted', () => {
    const opened = openedState({ tookFromLeft: true, floorTileTaken: tileFromString('11R') })
    expect((opened.penaltiesApplied ?? []).some((x) => x.type === 'islek')).toBe(true)
    const r = reduce(opened, { type: 'RetractOpen', seat: 0 })
    expect((r.penaltiesApplied ?? []).some((x) => x.type === 'islek')).toBe(false)
  })

  it('also reverts lay-offs made onto OTHERS’ melds (and take-okey) this turn', () => {
    const base = start101()
    // seat 1 already has a run on the table; seat 0 opens, then lays 8R onto it.
    const rack = [...openMelds().flat(), tileFromString('8R'), tileFromString('3S')]
    const s: GameState = {
      ...base,
      okey: tileFromString('5S'),
      turn: { seat: 0, phase: 'DISCARD' },
      tableMelds: [{ owner: 1, kind: 'run', tiles: [tileFromString('5R'), tileFromString('6R'), tileFromString('7R')] }],
      players: base.players.map((p) => (p.seat === 0 ? { ...p, hasOpened: false, rack } : p)),
    }
    const opened = reduce(s, { type: 'OpenMeld', seat: 0, melds: openMelds() })
    // meldIndex 0 is still seat 1's run (the opener's melds are appended after it).
    const laid = reduce(opened, { type: 'LayOff', seat: 0, meldIndex: 0, tiles: [tileFromString('8R')] })
    expect(laid.tableMelds![0]!.tiles).toHaveLength(4) // 5,6,7,8
    expect(laid.tableMelds!).toHaveLength(4)           // seat 1's run + seat 0's three melds

    const r = reduce(laid, { type: 'RetractOpen', seat: 0 })
    expect(r.players[0]!.hasOpened).toBe(false)
    expect(r.tableMelds!).toHaveLength(1)              // only seat 1's run remains
    expect(r.tableMelds![0]!.tiles).toHaveLength(3)    // back to 5,6,7 (the 8R lay-off undone)
    expect(r.players[0]!.rack.some((t) => tilesEqual(t, tileFromString('8R')))).toBe(true) // 8R returned
    expect(r.players[0]!.rack).toHaveLength(11)        // full pre-open rack restored
  })

  it('an ALREADY-opened player can retract a lay-off made on a later turn (prior open kept)', () => {
    const base = start101()
    // seat 0 opened on a previous turn (hasOpened). Fresh turn, no snapshot yet.
    // The table has seat 1's run [5R,6R,7R]; seat 0 lays 8R onto it this turn.
    const s: GameState = {
      ...base,
      okey: tileFromString('1S'),
      turn: { seat: 0, phase: 'DISCARD' },
      tableMelds: [{ owner: 1, kind: 'run', tiles: h('5R', '6R', '7R') }],
      players: base.players.map((p) => (p.seat === 0
        ? { ...p, hasOpened: true, openRoute: 'seri' as const, rack: h('8R', '9K', '2M') }
        : p)),
    }
    const laid = reduce(s, { type: 'LayOff', seat: 0, meldIndex: 0, tiles: [tileFromString('8R')] })
    expect(laid.tableMelds![0]!.tiles).toHaveLength(4)
    expect((laid.turn as { openSnapshot?: unknown }).openSnapshot).toBeTruthy() // captured on the lay-off
    const r = reduce(laid, { type: 'RetractOpen', seat: 0 })
    expect(r.tableMelds![0]!.tiles).toHaveLength(3)                              // lay-off undone
    expect(r.players[0]!.rack.some((t) => tilesEqual(t, tileFromString('8R')))).toBe(true) // 8R back
    expect(r.players[0]!.hasOpened).toBe(true)                                  // STILL opened
  })

  it('a lay-off cannot be undone after the discard (snapshot cleared on turn advance)', () => {
    const base = start101()
    const s: GameState = {
      ...base,
      okey: tileFromString('1S'),
      turn: { seat: 0, phase: 'DISCARD' },
      tableMelds: [{ owner: 1, kind: 'run', tiles: h('5R', '6R', '7R') }],
      players: base.players.map((p) => (p.seat === 0
        ? { ...p, hasOpened: true, openRoute: 'seri' as const, rack: h('8R', '9K', '2M') }
        : p)),
    }
    const laid = reduce(s, { type: 'LayOff', seat: 0, meldIndex: 0, tiles: [tileFromString('8R')] })
    const afterDiscard = reduce(laid, { type: 'Discard', seat: 0, tile: tileFromString('2M') })
    expect((afterDiscard.turn as { openSnapshot?: unknown }).openSnapshot).toBeUndefined()
    expect(() => reduce(afterDiscard, { type: 'RetractOpen', seat: 0 })).toThrow(RuleError)
  })

  it('legalMoves101 offers RetractOpen only after opening this turn', () => {
    const base = start101()
    const rack = [...openMelds().flat(), tileFromString('2S'), tileFromString('3S')]
    const s: GameState = {
      ...base, okey: tileFromString('5S'), turn: { seat: 0, phase: 'DISCARD' },
      players: base.players.map((p) => (p.seat === 0 ? { ...p, hasOpened: false, rack } : p)),
    }
    expect(legalMoves101(s, 0)).not.toContain('RetractOpen')
    const opened = reduce(s, { type: 'OpenMeld', seat: 0, melds: openMelds() })
    expect(legalMoves101(opened, 0)).toContain('RetractOpen')
  })
})

describe('Discard — okey-discard penalty (Kural 11)', () => {
  it('adds a +101 okey-discard penalty when the real okey is discarded', () => {
    const base = start101()
    const okey = base.okey! // the real okey tile (full wild)
    const s: GameState = {
      ...base,
      turn: { seat: 0, phase: 'DISCARD' },
      players: base.players.map((p) => (p.seat === 0 ? { ...p, rack: [okey, ...h('5R', '6R')] } : p)),
    }
    const s2 = reduce(s, { type: 'Discard', seat: 0, tile: okey })
    expect(s2.penaltiesApplied?.some((x) => x.seat === 0 && x.type === 'okey-discard')).toBe(true)
  })

  it('does not penalise a normal (non-okey) discard', () => {
    const base = start101()
    const s: GameState = {
      ...base,
      turn: { seat: 0, phase: 'DISCARD' },
      players: base.players.map((p) => (p.seat === 0 ? { ...p, rack: h('5R', '6R', '7R') } : p)),
    }
    const s2 = reduce(s, { type: 'Discard', seat: 0, tile: tileFromString('5R') })
    expect((s2.penaltiesApplied ?? []).length).toBe(0)
  })
})

describe('Kural 11 (Q1) — floor-take must open or return', () => {
  it('rejects a discard when a non-çift player took the floor but has not opened', () => {
    const base = start101()
    const s: GameState = {
      ...base,
      turn: { seat: 0, phase: 'DISCARD', tookFromLeft: true, floorTileTaken: tileFromString('9R') },
      players: base.players.map((p) =>
        p.seat === 0 ? { ...p, hasOpened: false, declaredCift: false, rack: h('9R', '5K', '6M') } : p,
      ),
    }
    expect(() => reduce(s, { type: 'Discard', seat: 0, tile: tileFromString('5K') })).toThrow(RuleError)
  })

  it('ReturnFloorTile puts the tile back on the left pile and returns to DRAW (no auto stock draw)', () => {
    const base = start101()
    const floor = tileFromString('9R')
    const leftIdx = 3 // leftSeat(0, 4)
    const s: GameState = {
      ...base,
      turn: { seat: 0, phase: 'DISCARD', tookFromLeft: true, floorTileTaken: floor },
      players: base.players.map((p) => {
        if (p.seat === 0) return { ...p, hasOpened: false, declaredCift: false, rack: [floor, ...h('5K', '6M')] }
        if (p.seat === leftIdx) return { ...p, discard: [] }
        return p
      }),
    }
    const stockBefore = s.stock.length
    const s2 = reduce(s, { type: 'ReturnFloorTile', seat: 0 })
    // Floor tile back on top of the left neighbour's pile; gone from the rack.
    expect(s2.players[leftIdx]!.discard[s2.players[leftIdx]!.discard.length - 1]).toEqual(floor)
    expect(s2.players[0]!.rack.some((t) => tilesEqual(t, floor))).toBe(false)
    expect(s2.players[0]!.rack).toHaveLength(2) // the take is undone — no replacement drawn
    expect(s2.stock.length).toBe(stockBefore) // stock untouched
    expect(s2.turn.phase).toBe('DRAW') // back to DRAW — may draw again
    expect((s2.turn as { tookFromLeft?: boolean }).tookFromLeft).toBeFalsy()
    // The player may now re-take the same floor tile to retry.
    const s3 = reduce(s2, { type: 'DrawFromDiscard', seat: 0 })
    expect(s3.players[0]!.rack.some((t) => tilesEqual(t, floor))).toBe(true)
  })
})

describe('İşlek penalty (Q1 reversal, PO 2026-06-21) — floor-take + open', () => {
  // A ≥101 opening hand (three full top-runs = 36×3 = 108).
  const openMelds = () => [h('11R', '12R', '13R'), h('11K', '12K', '13K'), h('11M', '12M', '13M')]
  function floorTakerState(over: Partial<GameState> = {}, tookFromLeft = true): GameState {
    const base = start101()
    const rack = [...openMelds().flat(), tileFromString('2S')] // +filler so the open keeps a tile
    return {
      ...base,
      okey: tileFromString('5S'), // distinct from the melds
      turn: { seat: 0, phase: 'DISCARD', tookFromLeft, floorTileTaken: tileFromString('11R') },
      players: base.players.map((p) => (p.seat === 0 ? { ...p, hasOpened: false, rack } : p)),
      ...over,
    }
  }

  it('penalizes the LEFT neighbour (seat 3) with +101 when seat 0 opens after a floor-take', () => {
    const s2 = reduce(floorTakerState(), { type: 'OpenMeld', seat: 0, melds: openMelds() })
    const islek = (s2.penaltiesApplied ?? []).filter((x) => x.type === 'islek')
    expect(islek).toHaveLength(1)
    expect(islek[0]!.seat).toBe(3) // leftSeat(0, 4) — the one who discarded the işlek tile
    // scoreHand101 turns each penalty entry into a flat +101 for that seat.
    const before = scoreHand101({ ...s2, status: 'ENDED', terminal: { reason: 'exhausted' } } as GameState)
    const noPen = scoreHand101({ ...s2, penaltiesApplied: [], status: 'ENDED', terminal: { reason: 'exhausted' } } as GameState)
    expect(before[3]! - noPen[3]!).toBe(101)
  })

  it('does NOT penalize when the open did not follow a floor-take', () => {
    const s2 = reduce(floorTakerState({}, false), { type: 'OpenMeld', seat: 0, melds: openMelds() })
    expect((s2.penaltiesApplied ?? []).filter((x) => x.type === 'islek')).toHaveLength(0)
  })

  it('applies the işlek penalty at most once per hand for a seat', () => {
    const s2 = reduce(floorTakerState(), { type: 'OpenMeld', seat: 0, melds: openMelds() })
    // A pre-existing işlek entry for seat 3 means the open must not add a duplicate.
    const pre = reduce(
      floorTakerState({ penaltiesApplied: [{ seat: 3, type: 'islek' }] }),
      { type: 'OpenMeld', seat: 0, melds: openMelds() },
    )
    expect((s2.penaltiesApplied ?? []).filter((x) => x.type === 'islek' && x.seat === 3)).toHaveLength(1)
    expect((pre.penaltiesApplied ?? []).filter((x) => x.type === 'islek' && x.seat === 3)).toHaveLength(1)
  })
})

describe('OpenMeld — finish-protection', () => {
  it('rejects laying (post-open) that would empty the rack — must keep a finishing tile', () => {
    const base = start101()
    const s: GameState = {
      ...base,
      okey: tileFromString('8K'),
      turn: { seat: 0, phase: 'DISCARD' },
      players: base.players.map((p) =>
        p.seat === 0
          ? { ...p, hasOpened: true, declaredCift: true, openRoute: 'cift', rack: h('3R', '3R') }
          : p,
      ),
    }
    // Laying the only pair would empty the rack → rejected.
    expect(() =>
      reduce(s, { type: 'OpenMeld', seat: 0, melds: [h('3R', '3R')] }),
    ).toThrow(RuleError)
  })
})

// ── DrawFromDiscard sets tookFromLeft on turn ─────────────────────────────────

describe('DrawFromDiscard — sets tookFromLeft', () => {
  it('sets tookFromLeft=true after drawing from left discard', () => {
    let s = start101()
    // seat 0 discards a tile to give seat 1 something to draw
    s = reduce(s, { type: 'Discard', seat: 0, tile: s.players[0]!.rack[0]! })
    // seat 1 draws from discard (left = seat 0)
    const s2 = reduce(s, { type: 'DrawFromDiscard', seat: 1 })
    expect((s2.turn as { tookFromLeft?: boolean }).tookFromLeft).toBe(true)
  })

  it('tookFromLeft is reset (absent/false) after a stock draw', () => {
    let s = start101()
    s = reduce(s, { type: 'Discard', seat: 0, tile: s.players[0]!.rack[0]! })
    const s2 = reduce(s, { type: 'DrawFromStock', seat: 1 })
    expect((s2.turn as { tookFromLeft?: boolean }).tookFromLeft).toBeFalsy()
  })

  it('tookFromLeft is reset after the player discards', () => {
    let s = start101()
    s = reduce(s, { type: 'Discard', seat: 0, tile: s.players[0]!.rack[0]! })
    // Seat 1 is a çift-declarer, so it may take the floor and still discard
    // (deferred işlek) — a non-çift taker would have to open or return first.
    s = { ...s, players: s.players.map((p) => (p.seat === 1 ? { ...p, declaredCift: true } : p)) }
    let s2 = reduce(s, { type: 'DrawFromDiscard', seat: 1 })
    s2 = reduce(s2, { type: 'Discard', seat: 1, tile: s2.players[1]!.rack[0]! })
    // Turn advances to seat 2 with tookFromLeft cleared
    expect((s2.turn as { tookFromLeft?: boolean }).tookFromLeft).toBeFalsy()
  })
})

// ── DEFERRED işlek penalty for a çift-declarer (PO 2026-06-21) ────────────────
//
// A seri taker MUST open the same turn they take the floor, so their işlek penalty
// always lands on that turn (covered above). A çift-declarer is special: they may
// take the floor, DEFER (discard without opening), and only open on a LATER turn.
// The penalty must still reach the fed (left) neighbour — it just lands when they
// finally open, not when they took the tile. The take records `pendingIslekSeat`;
// the eventual open consumes it.

describe('DEFERRED işlek penalty — çift-declarer takes floor, opens later', () => {
  const fivePairs = () => [h('3R', '3R'), h('6K', '6K'), h('8M', '8M'), h('11S', '11S'), h('13R', '13R')]

  it('taking + DEFERRING (discard, no open) records pendingIslekSeat but no penalty yet', () => {
    const base = start101()
    const s: GameState = {
      ...base,
      okey: tileFromString('5S'),
      // Floor-take this turn, çift-declarer, has NOT opened.
      turn: { seat: 1, phase: 'DISCARD', tookFromLeft: true, floorTileTaken: tileFromString('9K') },
      players: base.players.map((p) =>
        p.seat === 1 ? { ...p, hasOpened: false, declaredCift: true, rack: h('9K', '2M', '3M') } : p,
      ),
    }
    const after = reduce(s, { type: 'Discard', seat: 1, tile: tileFromString('2M') })
    // No penalty has landed yet — it is only "pending".
    expect((after.penaltiesApplied ?? []).filter((x) => x.type === 'islek')).toHaveLength(0)
    // The fed (left) neighbour is remembered so the penalty can land on the open.
    expect(after.players[1]!.pendingIslekSeat).toBe(0) // leftSeat(1, 4) = 0
  })

  it('opening (çift) on a LATER turn applies the deferred penalty to the fed seat and clears it', () => {
    const base = start101()
    const pairs = fivePairs()
    const rack = [...pairs.flat(), tileFromString('2M')] // +filler so a tile remains after the open
    const s: GameState = {
      ...base,
      okey: tileFromString('5S'),
      turn: { seat: 1, phase: 'DISCARD' }, // NOT a floor-take this turn — the take was earlier
      players: base.players.map((p) =>
        p.seat === 1
          ? { ...p, hasOpened: false, declaredCift: true, pendingIslekSeat: 0, rack }
          : p,
      ),
    }
    const opened = reduce(s, { type: 'OpenMeld', seat: 1, melds: pairs })
    const islek = (opened.penaltiesApplied ?? []).filter((x) => x.type === 'islek')
    expect(islek).toHaveLength(1)
    expect(islek[0]!.seat).toBe(0) // the seat whose discard was taken earlier
    // The pending marker is consumed so it can't double-apply.
    expect(opened.players[1]!.pendingIslekSeat).toBeUndefined()
  })

  it('end-to-end: take floor → defer → open çift later → left neighbour gets +101', () => {
    const base = start101()
    const pairs = fivePairs()
    // seat 1 will end up holding the 5 pairs once it picks up seat 0's discard.
    // Start it one tile short of the 9K it takes from the floor.
    const rackBeforeTake = [...pairs.flat(), tileFromString('2M')] // 11 tiles; takes 9K → 12, discards → 11
    let s: GameState = {
      ...base,
      okey: tileFromString('5S'),
      turn: { seat: 0, phase: 'DISCARD' },
      stock: base.stock,
      players: base.players.map((p) => {
        if (p.seat === 0) return { ...p, rack: [...p.rack, tileFromString('9K')] }
        if (p.seat === 1) return { ...p, hasOpened: false, declaredCift: true, rack: rackBeforeTake }
        return p
      }),
    }
    // seat 0 discards the 9K; seat 1 takes it from the floor (left neighbour = seat 0).
    s = reduce(s, { type: 'Discard', seat: 0, tile: tileFromString('9K') })
    s = reduce(s, { type: 'DrawFromDiscard', seat: 1 })
    expect((s.turn as { tookFromLeft?: boolean }).tookFromLeft).toBe(true)
    // seat 1 DEFERS: discards the filler without opening.
    s = reduce(s, { type: 'Discard', seat: 1, tile: tileFromString('2M') })
    expect(s.players[1]!.pendingIslekSeat).toBe(0)
    expect((s.penaltiesApplied ?? []).filter((x) => x.type === 'islek')).toHaveLength(0)
    // Later, seat 1's turn comes round again and it opens çift.
    s = { ...s, turn: { seat: 1, phase: 'DISCARD' } }
    s = reduce(s, { type: 'OpenMeld', seat: 1, melds: pairs })
    const islek = (s.penaltiesApplied ?? []).filter((x) => x.type === 'islek')
    expect(islek).toHaveLength(1)
    expect(islek[0]!.seat).toBe(0)
    expect(s.players[1]!.pendingIslekSeat).toBeUndefined()
  })
})

// ── Discard auto-finish: winType derives from the opening route ────────────────
describe('Discard auto-finish (101) — winType derives from openRoute', () => {
  function finishState(route: 'cift' | 'seri'): GameState {
    const okey = tileFromString('7M')
    const finishing = tileFromString('3K')
    const players = [0, 1, 2, 3].map((seat) => ({
      seat,
      rack: seat === 0 ? [finishing] : ([] as Tile[]),
      discard: [] as Tile[],
      hasOpened: seat === 0,
      isOut: false,
      declaredCift: route === 'cift' && seat === 0,
      openedValue: 0,
      openRoute: seat === 0 ? route : undefined,
    }))
    return {
      gameId: 'g', config: KLASIK_101, rngSeed: 1, handNo: 1,
      stock: h('5R'), indicator: tileFromString('6M'), okey,
      turn: { seat: 0, phase: 'DISCARD' },
      players, scores: [0, 0, 0, 0], status: 'PLAYING',
      tableMelds: [], rizikoActive: false, penaltiesApplied: [],
    }
  }

  it('çift-route finisher (empty rack) → winType "pairs" (gets the ×2 cift multiplier)', () => {
    const after = reduce(finishState('cift'), { type: 'Discard', seat: 0, tile: tileFromString('3K') })
    expect(after.status).toBe('ENDED')
    expect(after.terminal?.reason).toBe('win')
    expect(after.terminal?.winnerSeat).toBe(0)
    expect(after.terminal?.winType).toBe('pairs')
  })

  it('seri-route finisher (empty rack) → winType "perOnly"', () => {
    const after = reduce(finishState('seri'), { type: 'Discard', seat: 0, tile: tileFromString('3K') })
    expect(after.terminal?.winType).toBe('perOnly')
  })
})
