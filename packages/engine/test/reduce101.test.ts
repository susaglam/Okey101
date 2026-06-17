// packages/engine/test/reduce101.test.ts
import { describe, it, expect } from 'vitest'
import { reduce, RuleError } from '../src/reduce'
import { KLASIK_101, KLASIK } from '../src/config'
import { tileFromString } from '../src/tile'
import type { Tile } from '../src/tile'
import type { GameState } from '../src/state'

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

  it('sets rizikoActive=true when indicator is a false joker', () => {
    // We need to find a seed where the indicator is a FALSE_JOKER.
    // Try many seeds deterministically.
    let rizikoFound = false
    for (let seed = 1; seed <= 500; seed++) {
      const s = start101(seed)
      if (s.indicator?.kind === 'FALSE_JOKER') {
        expect(s.rizikoActive).toBe(true)
        rizikoFound = true
        break
      }
    }
    expect(rizikoFound).toBe(true)
  })

  it('sets rizikoActive=false when indicator is a numbered tile', () => {
    // Find a seed where indicator is NOT a false joker
    for (let seed = 1; seed <= 500; seed++) {
      const s = start101(seed)
      if (s.indicator?.kind === 'NUMBER') {
        expect(s.rizikoActive).toBe(false)
        break
      }
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

  // Klasik still deals 15/14/14/14 (regression guard)
  it('Klasik StartHand still deals 15 to starter and 14 to others', () => {
    let s = reduce(null, { type: 'CreateGame', gameId: 'gk', seed: 99, config: KLASIK })
    s = reduce(s, { type: 'StartHand' })
    expect(s.players[0]!.rack).toHaveLength(15)
    expect(s.players[1]!.rack).toHaveLength(14)
    expect(s.stock).toHaveLength(48) // 106-1-57
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

  it('records işlek penalty against left seat when tookFromLeft=true', () => {
    // Set up: seat 1 took from left (seat 0's discard), now opens
    const base = start101()
    // The "left" of seat 1 is seat 0
    const s: GameState = {
      ...base,
      turn: { seat: 1, phase: 'DISCARD', tookFromLeft: true } as GameState['turn'] & { tookFromLeft: boolean },
      players: base.players.map((p) =>
        p.seat === 1 ? { ...p, rack: bigRackTiles } : p
      ),
    }
    const s2 = reduce(s, { type: 'OpenMeld', seat: 1, melds: bigMelds })
    expect(s2.penaltiesApplied).toBeDefined()
    // Left of seat 1 = seat 0
    const penalty = s2.penaltiesApplied!.find((pe) => pe.seat === 0 && pe.type === 'islek-floor-open')
    expect(penalty).toBeDefined()
  })

  it('does not duplicate işlek penalty within same hand', () => {
    // Apply islek penalty twice: second application should not add a second entry
    const base = start101()
    const s: GameState = {
      ...base,
      turn: { seat: 1, phase: 'DISCARD', tookFromLeft: true } as GameState['turn'] & { tookFromLeft: boolean },
      players: base.players.map((p) =>
        p.seat === 1 ? { ...p, rack: bigRackTiles } : p
      ),
      // Pre-populate the penalty
      penaltiesApplied: [{ seat: 0, type: 'islek-floor-open' }],
    }
    const s2 = reduce(s, { type: 'OpenMeld', seat: 1, melds: bigMelds })
    const count = s2.penaltiesApplied!.filter((pe) => pe.seat === 0 && pe.type === 'islek-floor-open').length
    expect(count).toBe(1)
  })

  it('does NOT record işlek penalty when tookFromLeft is false/absent', () => {
    const base = start101()
    const s: GameState = {
      ...base,
      turn: { seat: 0, phase: 'DISCARD' },
      players: base.players.map((p) =>
        p.seat === 0 ? { ...p, rack: bigRackTiles } : p
      ),
    }
    const s2 = reduce(s, { type: 'OpenMeld', seat: 0, melds: bigMelds })
    expect(s2.penaltiesApplied!.filter((pe) => pe.type === 'islek-floor-open').length).toBe(0)
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
    let s2 = reduce(s, { type: 'DrawFromDiscard', seat: 1 })
    // Now seat 1 should discard
    s2 = reduce(s2, { type: 'Discard', seat: 1, tile: s2.players[1]!.rack[0]! })
    // Turn advances to seat 2
    expect((s2.turn as { tookFromLeft?: boolean }).tookFromLeft).toBeFalsy()
  })
})

// ── çift-declarer deferred işlek penalty ─────────────────────────────────────

describe('çift-declarer deferred işlek penalty', () => {
  const bigRackTiles = [
    ...h('11R', '12R', '13R', '11K', '12K', '13K', '11M', '12M', '13M'),
    ...h('1R', '2R', '3R'),
  ]
  const bigMelds = [
    h('11R', '12R', '13R'),
    h('11K', '12K', '13K'),
    h('11M', '12M', '13M'),
  ]

  it('applies işlek penalty to left neighbour when çift-declarer opens on a later turn (pendingIslekFromSeat path)', () => {
    // Construct a state where seat 1 is a çift-declarer who already took from
    // left (seat 0) on a previous turn (pendingIslekFromSeat=0 set),
    // and it is now seat 1's DISCARD phase on a subsequent turn
    // (tookFromLeft is absent — the turn has advanced past the DrawFromDiscard).
    const base = start101()
    const s: GameState = {
      ...base,
      turn: { seat: 1, phase: 'DISCARD' }, // tookFromLeft intentionally absent (deferred case)
      players: base.players.map((p) => {
        if (p.seat === 1) {
          return {
            ...p,
            rack: bigRackTiles,
            declaredCift: true,
            pendingIslekFromSeat: 0, // left neighbour of seat 1 = seat 0
          }
        }
        return p
      }),
    }

    const s2 = reduce(s, { type: 'OpenMeld', seat: 1, melds: bigMelds })

    // Penalty must be recorded against seat 0 (the discarder / left of seat 1)
    const penalty = s2.penaltiesApplied!.find(
      (pe) => pe.seat === 0 && pe.type === 'islek-floor-open'
    )
    expect(penalty).toBeDefined()

    // pendingIslekFromSeat must be cleared on the opening player
    expect(s2.players.find((p) => p.seat === 1)!.pendingIslekFromSeat).toBeUndefined()
  })

  it('sets pendingIslekFromSeat on the çift-declarer when they DrawFromDiscard', () => {
    let s = start101()
    // seat 0 discards so seat 1 has a tile to draw from left
    s = reduce(s, { type: 'Discard', seat: 0, tile: s.players[0]!.rack[0]! })
    // Mark seat 1 as çift-declarer
    s = {
      ...s,
      players: s.players.map((p) =>
        p.seat === 1 ? { ...p, declaredCift: true } : p
      ),
    }
    // seat 1 draws from the left (seat 0) discard pile
    const s2 = reduce(s, { type: 'DrawFromDiscard', seat: 1 })
    // pendingIslekFromSeat should be set to seat 0 (left of seat 1)
    expect(s2.players.find((p) => p.seat === 1)!.pendingIslekFromSeat).toBe(0)
  })

  it('does NOT set pendingIslekFromSeat for non-çift player who DrawFromDiscard', () => {
    let s = start101()
    s = reduce(s, { type: 'Discard', seat: 0, tile: s.players[0]!.rack[0]! })
    // seat 1 is NOT a çift-declarer (default declaredCift=false)
    const s2 = reduce(s, { type: 'DrawFromDiscard', seat: 1 })
    expect(s2.players.find((p) => p.seat === 1)!.pendingIslekFromSeat).toBeUndefined()
  })

  it('deduplicates işlek penalty even when using pendingIslekFromSeat path', () => {
    const base = start101()
    const s: GameState = {
      ...base,
      turn: { seat: 1, phase: 'DISCARD' },
      players: base.players.map((p) => {
        if (p.seat === 1) {
          return {
            ...p,
            rack: bigRackTiles,
            declaredCift: true,
            pendingIslekFromSeat: 0,
          }
        }
        return p
      }),
      // Pre-populate the penalty so it already exists
      penaltiesApplied: [{ seat: 0, type: 'islek-floor-open' }],
    }
    const s2 = reduce(s, { type: 'OpenMeld', seat: 1, melds: bigMelds })
    const count = s2.penaltiesApplied!.filter(
      (pe) => pe.seat === 0 && pe.type === 'islek-floor-open'
    ).length
    expect(count).toBe(1)
  })
})
