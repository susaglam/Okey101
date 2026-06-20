// packages/engine/test/ciftRoute.test.ts
// TDD tests for the ÇİFT route feature:
//   - findPairOpening: find 5 identical pairs for initial çift open
//   - findLayablePairs: find additional pairs post-opening
//   - OpenMeld route detection: sets openRoute on first open
//   - OpenMeld already-opened: çift player can only lay pairs, seri player can only lay runs/groups

import { describe, it, expect } from 'vitest'
import { reduce, RuleError } from '../src/reduce'
import { KLASIK_101 } from '../src/config'
import { tileFromString } from '../src/tile'
import { findPairOpening, findLayablePairs } from '../src/open'
import type { Tile } from '../src/tile'
import type { GameState } from '../src/state'

function h(...strs: string[]): Tile[] {
  return strs.map(tileFromString)
}

/** Bootstrap a 101 game state at seat 0, DISCARD phase, with the given rack. */
function stateWithRack(seat: number, tiles: Tile[], okeyOverride?: Tile): GameState {
  let s = reduce(null, { type: 'CreateGame', gameId: 'g-cift', seed: 1, config: KLASIK_101 })
  s = reduce(s, { type: 'StartHand' })
  const okey = okeyOverride ?? s.okey!
  return {
    ...s,
    okey,
    turn: { seat, phase: 'DISCARD' },
    status: 'PLAYING',
    players: s.players.map((p) =>
      p.seat === seat ? { ...p, rack: tiles } : p
    ),
  }
}

// ── findPairOpening ──────────────────────────────────────────────────────────

describe('findPairOpening', () => {
  const okey = tileFromString('7M') // 7 BLUE = okey (wild)

  it('returns 5 pairs when the rack has exactly 5 identical pairs', () => {
    const rack = [
      ...h('3R', '3R'),
      ...h('5K', '5K'),
      ...h('8M', '8M'),
      ...h('11S', '11S'),
      ...h('13R', '13R'),
      ...h('1K', '2K', '4S'),  // filler
    ]
    const result = findPairOpening(rack, okey, KLASIK_101)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(5)
    // Each returned meld must be a valid pair
    for (const pair of result!) {
      expect(pair.length).toBe(2)
      expect(pair[0]!.number).toBe(pair[1]!.number)
      expect(pair[0]!.color).toBe(pair[1]!.color)
    }
  })

  it('returns null when rack has only 4 pairs', () => {
    const rack = [
      ...h('3R', '3R'),
      ...h('5K', '5K'),
      ...h('8M', '8M'),
      ...h('11S', '11S'),
      ...h('1K', '2K', '4S'),  // filler, no 5th pair
    ]
    const result = findPairOpening(rack, okey, KLASIK_101)
    expect(result).toBeNull()
  })

  it('returns null when rack has no pairs at all', () => {
    const rack = h('1R', '2K', '3M', '4S', '5R', '6K', '7S', '8R', '9K', '10M')
    const result = findPairOpening(rack, okey, KLASIK_101)
    expect(result).toBeNull()
  })

  it('treats the okey (wild) as a usable pair member', () => {
    // 7M is okey/wild. Four real pairs + a lone 9R + the wild okey → the okey
    // completes the fifth pair (okey + 9R). "Okey her yerde kullanılır", çift dahil.
    const rack = [
      ...h('7M'),         // the wild okey
      ...h('9R'),         // lone single the okey completes
      ...h('3R', '3R'),
      ...h('5K', '5K'),
      ...h('8M', '8M'),
      ...h('11S', '11S'),
    ]
    const result = findPairOpening(rack, okey, KLASIK_101)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(5)
  })

  it('returns null when pairsOpenCount is not satisfied (e.g. only 5 pairs but config requires more)', () => {
    // Default KLASIK_101 requires 5 pairs — this should pass
    const rack = [
      ...h('3R', '3R'),
      ...h('5K', '5K'),
      ...h('8M', '8M'),
      ...h('11S', '11S'),
      ...h('13R', '13R'),
    ]
    const cfg5 = { ...KLASIK_101, pairsOpenCount: 5 }
    expect(findPairOpening(rack, okey, cfg5)).not.toBeNull()

    // If config requires 6 pairs, 5 is not enough
    const cfg6 = { ...KLASIK_101, pairsOpenCount: 6 }
    expect(findPairOpening(rack, okey, cfg6)).toBeNull()
  })
})

// ── findLayablePairs ─────────────────────────────────────────────────────────

describe('findLayablePairs', () => {
  const okey = tileFromString('7M')

  it('returns additional pairs found in the rack', () => {
    // Rack has 2 extra pairs
    const rack = [
      ...h('4R', '4R'),
      ...h('9K', '9K'),
      ...h('1M', '2M', '3S'),  // singles, no pair
    ]
    const result = findLayablePairs(rack, okey, KLASIK_101)
    expect(result).not.toBeNull()
    expect(result!.length).toBeGreaterThanOrEqual(1)
    // Each entry must be a 2-tile identical pair
    for (const pair of result!) {
      expect(pair.length).toBe(2)
      expect(pair[0]!.number).toBe(pair[1]!.number)
      expect(pair[0]!.color).toBe(pair[1]!.color)
    }
  })

  it('returns null when rack has no pairs', () => {
    const rack = h('1R', '2K', '3M', '4S', '5R')
    const result = findLayablePairs(rack, okey, KLASIK_101)
    expect(result).toBeNull()
  })

  it('uses the okey (wild) to complete a layable pair', () => {
    // 7M is okey/wild. A lone 1K + the wild okey → the okey completes the pair.
    const rack = [...h('7M'), ...h('1K', '2R', '3S')]
    const result = findLayablePairs(rack, okey, KLASIK_101)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(1)
  })
})

// ── OpenMeld: openRoute detection on first open ──────────────────────────────

describe('OpenMeld — openRoute detection', () => {
  const bigMelds = [
    h('11R', '12R', '13R'),
    h('11K', '12K', '13K'),
    h('11M', '12M', '13M'),
  ]
  const bigRack = [
    ...h('11R', '12R', '13R', '11K', '12K', '13K', '11M', '12M', '13M'),
    ...h('1R', '2R', '3R'),
  ]

  it('sets openRoute="seri" after opening via the ≥101 run/group route', () => {
    const s = stateWithRack(0, bigRack)
    const s2 = reduce(s, { type: 'OpenMeld', seat: 0, melds: bigMelds })
    expect(s2.players[0]!.openRoute).toBe('seri')
  })

  it('sets openRoute="cift" after opening via the 5-pairs route', () => {
    const okey = tileFromString('1S') // use a distinct okey not in the pairs
    const pairs5: Tile[][] = [
      h('3R', '3R'),
      h('5K', '5K'),
      h('8M', '8M'),
      h('11S', '11S'),
      h('13R', '13R'),
    ]
    const rack = [...pairs5.flat(), tileFromString('2M')] // +filler so the open doesn't empty the rack
    let s = reduce(null, { type: 'CreateGame', gameId: 'g-cift2', seed: 1, config: KLASIK_101 })
    s = reduce(s, { type: 'StartHand' })
    s = {
      ...s,
      okey,
      turn: { seat: 0, phase: 'DISCARD' },
      players: s.players.map((p) => (p.seat === 0 ? { ...p, rack } : p)),
    }
    const s2 = reduce(s, { type: 'OpenMeld', seat: 0, melds: pairs5 })
    expect(s2.players[0]!.openRoute).toBe('cift')
  })

  it('detects a 5-pair open that USES THE OKEY as the çift route (not misread as seri)', () => {
    // Regression: an okey-backed pair (wild + real) must still count as a pair so
    // the open is detected as çift — otherwise the player could then illegally lay runs.
    const okey = tileFromString('1S')
    const pairs5: Tile[][] = [
      [tileFromString('1S'), tileFromString('7M')], // okey (wild) completes the pair
      h('3R', '3R'),
      h('5K', '5K'),
      h('8M', '8M'),
      h('11S', '11S'),
    ]
    const rack = [...pairs5.flat(), tileFromString('2M')]
    let s = reduce(null, { type: 'CreateGame', gameId: 'g-cift-okey', seed: 2, config: KLASIK_101 })
    s = reduce(s, { type: 'StartHand' })
    s = { ...s, okey, turn: { seat: 0, phase: 'DISCARD' }, players: s.players.map((p) => (p.seat === 0 ? { ...p, rack } : p)) }
    const s2 = reduce(s, { type: 'OpenMeld', seat: 0, melds: pairs5 })
    expect(s2.players[0]!.openRoute).toBe('cift')
  })

  it('a çift-route player may NOT lay a new run/group (OpenMeld throws)', () => {
    const okey = tileFromString('1S')
    const run = h('5R', '6R', '7R')
    let s = reduce(null, { type: 'CreateGame', gameId: 'g-cift-run', seed: 3, config: KLASIK_101 })
    s = reduce(s, { type: 'StartHand' })
    s = {
      ...s,
      okey,
      turn: { seat: 0, phase: 'DISCARD' },
      tableMelds: [{ owner: 0, kind: 'pair' as const, tiles: h('4R', '4R') }],
      players: s.players.map((p) => (p.seat === 0
        ? { ...p, hasOpened: true, declaredCift: true, openRoute: 'cift' as const, rack: [...run, tileFromString('9M')] }
        : p)),
    }
    expect(() => reduce(s, { type: 'OpenMeld', seat: 0, melds: [run] })).toThrow(RuleError)
  })

  it('adds pair tableMelds with kind="pair" when opening via çift route', () => {
    const okey = tileFromString('1S')
    const pairs5: Tile[][] = [
      h('3R', '3R'),
      h('5K', '5K'),
      h('8M', '8M'),
      h('11S', '11S'),
      h('13R', '13R'),
    ]
    const rack = [...pairs5.flat(), tileFromString('2M')] // +filler so the open doesn't empty the rack
    let s = reduce(null, { type: 'CreateGame', gameId: 'g-cift3', seed: 1, config: KLASIK_101 })
    s = reduce(s, { type: 'StartHand' })
    s = {
      ...s,
      okey,
      turn: { seat: 0, phase: 'DISCARD' },
      players: s.players.map((p) => (p.seat === 0 ? { ...p, rack } : p)),
    }
    const s2 = reduce(s, { type: 'OpenMeld', seat: 0, melds: pairs5 })
    expect(s2.tableMelds).toBeDefined()
    const pairMelds = s2.tableMelds!.filter((m) => m.kind === 'pair')
    expect(pairMelds.length).toBe(5)
  })
})

// ── OpenMeld: already-opened route restrictions ──────────────────────────────

describe('OpenMeld — already-opened route restrictions', () => {
  const okey = tileFromString('1S')

  /** Build a state where seat 0 has already opened via çift route */
  function ciftOpenedState(extraRack: Tile[]): GameState {
    const pairs5: Tile[][] = [
      h('3R', '3R'),
      h('5K', '5K'),
      h('8M', '8M'),
      h('11S', '11S'),
      h('13R', '13R'),
    ]
    const rack = [...pairs5.flat(), ...extraRack, tileFromString('2M')] // +filler keeps a finishing tile after laying
    let s = reduce(null, { type: 'CreateGame', gameId: 'g-cift4', seed: 1, config: KLASIK_101 })
    s = reduce(s, { type: 'StartHand' })
    s = {
      ...s,
      okey,
      turn: { seat: 0, phase: 'DISCARD' },
      players: s.players.map((p) => (p.seat === 0 ? { ...p, rack } : p)),
    }
    // Open via çift route
    return reduce(s, { type: 'OpenMeld', seat: 0, melds: pairs5 })
  }

  /** Build a state where seat 0 has already opened via seri route */
  function seriOpenedState(extraRack: Tile[]): GameState {
    const bigMelds = [
      h('11R', '12R', '13R'),
      h('11K', '12K', '13K'),
      h('11M', '12M', '13M'),
    ]
    const bigRack = [
      ...h('11R', '12R', '13R', '11K', '12K', '13K', '11M', '12M', '13M'),
      ...extraRack,
      tileFromString('2M'), // +filler keeps a finishing tile after laying
    ]
    let s = reduce(null, { type: 'CreateGame', gameId: 'g-seri', seed: 1, config: KLASIK_101 })
    s = reduce(s, { type: 'StartHand' })
    s = {
      ...s,
      okey: tileFromString('1S'),
      turn: { seat: 0, phase: 'DISCARD' },
      players: s.players.map((p) => (p.seat === 0 ? { ...p, rack: bigRack } : p)),
    }
    return reduce(s, { type: 'OpenMeld', seat: 0, melds: bigMelds })
  }

  it('çift-opened player CAN lay additional pairs after opening', () => {
    // Extra pair in rack
    const extraPairs: Tile[][] = [h('6R', '6R')]
    const s = ciftOpenedState(extraPairs.flat())
    // Advance turn back to seat 0 for this test
    const s2: GameState = { ...s, turn: { seat: 0, phase: 'DISCARD' } }
    // Should succeed
    expect(() => reduce(s2, { type: 'OpenMeld', seat: 0, melds: extraPairs })).not.toThrow()
  })

  it('çift-opened player CANNOT lay runs/groups after opening', () => {
    const extraRunTiles = h('7R', '8R', '9R')
    const s = ciftOpenedState(extraRunTiles)
    const s2: GameState = { ...s, turn: { seat: 0, phase: 'DISCARD' } }
    expect(() =>
      reduce(s2, { type: 'OpenMeld', seat: 0, melds: [extraRunTiles] })
    ).toThrow(RuleError)
  })

  it('seri-opened player CAN lay additional runs/groups after opening', () => {
    const extraRun = h('4R', '5R', '6R')
    const s = seriOpenedState(extraRun)
    const s2: GameState = { ...s, turn: { seat: 0, phase: 'DISCARD' } }
    expect(() =>
      reduce(s2, { type: 'OpenMeld', seat: 0, melds: [extraRun] })
    ).not.toThrow()
  })

  it('seri-opened player CANNOT lay pairs when NO çift route is open on the table', () => {
    const extraPairTiles = h('6R', '6R')
    const s = seriOpenedState(extraPairTiles) // only seri melds on the table — no pair
    const s2: GameState = { ...s, turn: { seat: 0, phase: 'DISCARD' } }
    expect(() =>
      reduce(s2, { type: 'OpenMeld', seat: 0, melds: [extraPairTiles] })
    ).toThrow(RuleError)
  })

  it('seri-opened player CAN lay pairs once someone has opened a çift route', () => {
    const extraPairTiles = h('6R', '6R')
    const s = seriOpenedState(extraPairTiles)
    // Another player has a pair on the table → the çift route is open for everyone.
    const s2: GameState = {
      ...s,
      turn: { seat: 0, phase: 'DISCARD' },
      tableMelds: [...(s.tableMelds ?? []), { owner: 1, kind: 'pair', tiles: h('9R', '9R') }],
    }
    expect(() =>
      reduce(s2, { type: 'OpenMeld', seat: 0, melds: [extraPairTiles] })
    ).not.toThrow()
  })

  it('çift-opened player additional pairs appear in tableMelds with kind="pair"', () => {
    const extraPairs: Tile[][] = [h('6R', '6R')]
    const s = ciftOpenedState(extraPairs.flat())
    const s2: GameState = { ...s, turn: { seat: 0, phase: 'DISCARD' } }
    const s3 = reduce(s2, { type: 'OpenMeld', seat: 0, melds: extraPairs })
    const newPairs = s3.tableMelds!.filter((m) => m.kind === 'pair' && m.owner === 0)
    expect(newPairs.length).toBe(6) // 5 from initial open + 1 new
  })
})
