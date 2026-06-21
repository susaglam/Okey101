// packages/engine/test/reduce101.test.ts
import { describe, it, expect } from 'vitest'
import { reduce, RuleError } from '../src/reduce'
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

// ── çift-declarer floor-take carries no penalty ──────────────────────────────

describe('çift-declarer floor-take — no işlek penalty (Kural 11)', () => {
  it('records NO penalty when a çift-declarer who took from the floor opens later', () => {
    const bigRackTiles = [
      ...h('11R', '12R', '13R', '11K', '12K', '13K', '11M', '12M', '13M'),
      ...h('1R', '2R', '3R'),
    ]
    const bigMelds = [
      h('11R', '12R', '13R'),
      h('11K', '12K', '13K'),
      h('11M', '12M', '13M'),
    ]
    const base = start101()
    const s: GameState = {
      ...base,
      turn: { seat: 1, phase: 'DISCARD' },
      players: base.players.map((p) =>
        p.seat === 1 ? { ...p, rack: bigRackTiles, declaredCift: true } : p
      ),
    }
    const s2 = reduce(s, { type: 'OpenMeld', seat: 1, melds: bigMelds })
    expect((s2.penaltiesApplied ?? []).filter((pe) => pe.type === 'islek-floor-open').length).toBe(0)
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
