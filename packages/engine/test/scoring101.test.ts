// packages/engine/test/scoring101.test.ts
import { describe, it, expect } from 'vitest'
import { scoreHand101 } from '../src/scoring/yuzbir'
import type { GameState } from '../src/state'
import { KLASIK_101 } from '../src/config'
import { tileFromString } from '../src/tile'
import type { Tile } from '../src/tile'

// ── helpers ───────────────────────────────────────────────────────────────────

function h(...strs: string[]): Tile[] {
  return strs.map(tileFromString)
}

/** Build a minimal ended GameState for 101 scoring tests. */
function endedState(overrides: Partial<GameState> & {
  players?: Partial<GameState['players'][number]>[]
}): GameState {
  const okey = tileFromString('7M')
  const indicator = tileFromString('6M')

  const defaultPlayers = [0, 1, 2, 3].map((seat) => ({
    seat,
    rack: [] as Tile[],
    discard: [] as Tile[],
    hasOpened: false,
    isOut: false,
    declaredCift: false,
    openedValue: 0,
  }))

  // Merge player overrides
  const players = defaultPlayers.map((p, i) => {
    const over = overrides.players?.[i]
    if (over) return { ...p, ...over }
    return p
  })

  const { players: _playerOverrides, ...rest } = overrides

  return {
    gameId: 'g',
    config: KLASIK_101,
    rngSeed: 1,
    handNo: 1,
    stock: [],
    indicator,
    okey,
    turn: { seat: 0, phase: 'DISCARD' },
    players,
    scores: [0, 0, 0, 0],
    status: 'ENDED',
    tableMelds: [],
    rizikoActive: false,
    penaltiesApplied: [],
    terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
    ...rest,
  }
}

// ── Normal finish (no multipliers) ────────────────────────────────────────────

describe('normal finish — no multipliers', () => {
  it('finisher gets −101 credit', () => {
    const s = endedState({
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },             // seat 0: winner, empty rack (already finished)
        { rack: h('5R', '6R', '7R', '8R', '9R'), hasOpened: true }, // sum=35
        { rack: [], hasOpened: false }, // never opened → 202
        { rack: [], hasOpened: false }, // never opened → 202
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[0]).toBe(-101)
  })

  it('opened non-finisher pays remaining face-sum', () => {
    // seat 1: opened, rack = 5R+6R+7R+8R+9R = 5+6+7+8+9 = 35
    const s = endedState({
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: h('5R', '6R', '7R', '8R', '9R'), hasOpened: true },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(35)
  })

  it('never-opened non-finisher pays +202', () => {
    const s = endedState({
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(202)
    expect(deltas[2]).toBe(202)
    expect(deltas[3]).toBe(202)
  })

  it('opened non-finisher holding okey counts okey as 101', () => {
    // seat 1: opened, rack = 5R + okey(7M). Sum = 5 + 101 = 106
    const okey = tileFromString('7M')
    const s = endedState({
      okey,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: [tileFromString('5R'), okey], hasOpened: true },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(106) // 5 + 101
  })

  it('opened non-finisher holding false-joker counts it as 101', () => {
    // seat 1: opened, rack = 3K + X(false_joker). Sum = 3 + 101 = 104
    const s = endedState({
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: [tileFromString('3K'), tileFromString('X')], hasOpened: true },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(104) // 3 + 101
  })
})

// ── Okey-finish doubling ───────────────────────────────────────────────────────

describe('okey-finish — finisher ×2', () => {
  it('finisher gets −202 when finishing tile equals okey', () => {
    const okey = tileFromString('7M')
    const s = endedState({
      okey,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly', finishingTile: okey },
      players: [
        { rack: [] },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[0]).toBe(-202)
  })

  it('non-finishers are NOT multiplied by finish-type', () => {
    const okey = tileFromString('7M')
    const s = endedState({
      okey,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly', finishingTile: okey },
      players: [
        { rack: [] },
        { rack: h('5R', '6R', '7R'), hasOpened: true }, // sum=18, no multiplier
        { rack: [], hasOpened: false }, // +202 flat, no multiplier
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(18)
    expect(deltas[2]).toBe(202)
  })
})

// ── Çift finish doubling ───────────────────────────────────────────────────────

describe('çift finish — finisher ×2', () => {
  it('finisher gets −202 when winType is pairs', () => {
    const s = endedState({
      terminal: { reason: 'win', winnerSeat: 0, winType: 'pairs' },
    })
    const deltas = scoreHand101(s)
    expect(deltas[0]).toBe(-202)
  })
})

// ── Both okey-finish AND çift → ×4 ───────────────────────────────────────────

describe('okey-finish + çift both active — finisher ×4', () => {
  it('finisher gets −404 when both okey-finish and pairs', () => {
    const okey = tileFromString('7M')
    const s = endedState({
      okey,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'pairs', finishingTile: okey },
    })
    const deltas = scoreHand101(s)
    expect(deltas[0]).toBe(-404)
  })
})

// ── Riziko ────────────────────────────────────────────────────────────────────

describe('riziko active — doubles the ladder', () => {
  it('normal finish + riziko: finisher −202, never-opened +404', () => {
    const s = endedState({
      rizikoActive: true,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[0]).toBe(-202)
    expect(deltas[1]).toBe(404)
    expect(deltas[2]).toBe(404)
    expect(deltas[3]).toBe(404)
  })

  it('riziko + okey-finish: finisher −404', () => {
    const okey = tileFromString('7M')
    const s = endedState({
      okey,
      rizikoActive: true,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly', finishingTile: okey },
    })
    const deltas = scoreHand101(s)
    expect(deltas[0]).toBe(-404)
  })

  it('riziko + opened non-finisher: sum ×2', () => {
    // seat 1: opened, rack sum = 30. With riziko → 60.
    const s = endedState({
      rizikoActive: true,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: h('5R', '6R', '7R', '12M'), hasOpened: true }, // 5+6+7+12=30
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(60)
  })
})

// ── Flat penalties ─────────────────────────────────────────────────────────────

describe('flat penalties — +101 NOT multiplied', () => {
  it('işlek penalty adds +101 flat to that seat (no-riziko)', () => {
    // seat 1 has sum 30 + işlek penalty → 30 + 101 = 131
    const s = endedState({
      rizikoActive: false,
      penaltiesApplied: [{ seat: 1, type: 'islek-floor-open' }],
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: h('5R', '6R', '7R', '12M'), hasOpened: true }, // sum=30
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(131) // 30 + 101 flat
  })

  it('işlek penalty stays flat +101 even in a riziko round', () => {
    // seat 1: sum=30 → riziko doubles to 60; +101 flat penalty → 161
    const s = endedState({
      rizikoActive: true,
      penaltiesApplied: [{ seat: 1, type: 'islek-floor-open' }],
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: h('5R', '6R', '7R', '12M'), hasOpened: true }, // sum=30
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(161) // 30×2 + 101 flat
  })

  it('multiple penalty entries for same seat accumulate flat', () => {
    // seat 1: sum=10 + 2 flat penalties = 10 + 202 = 212
    const s = endedState({
      penaltiesApplied: [
        { seat: 1, type: 'islek-floor-open' },
        { seat: 1, type: 'okey-discard' },
      ],
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: h('5R', '5M'), hasOpened: true }, // 5+5=10
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(212) // 10 + 101 + 101
  })

  it('flat penalty on the finisher seat is added flat (no ladder multiplication)', () => {
    // seat 0 finishes normally (−101) + flat penalty (+101) → net 0
    const s = endedState({
      penaltiesApplied: [{ seat: 0, type: 'islek-floor-open' }],
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
    })
    const deltas = scoreHand101(s)
    expect(deltas[0]).toBe(0) // −101 + 101 = 0
  })
})

// ── Çift declared, never opened ───────────────────────────────────────────────

describe('çift declared, never opened', () => {
  it('pays +404 (2 × 202 non-opener base)', () => {
    const s = endedState({
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: [], hasOpened: false, declaredCift: true },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(404)
  })

  it('pays +808 with riziko active', () => {
    const s = endedState({
      rizikoActive: true,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: [], hasOpened: false, declaredCift: true },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(808)
  })
})

// ── Çift declared, opened but didn't finish ───────────────────────────────────

describe('çift declared, opened (≥5 pairs laid) but did not finish', () => {
  it('pays 2 × remaining face-sum', () => {
    // seat 1: declaredCift=true, hasOpened=true (laid 5+ pairs), rack remaining sum=18
    const s = endedState({
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: h('5R', '6R', '7R'), hasOpened: true, declaredCift: true }, // 5+6+7=18
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(36) // 2 × 18
  })

  it('çift opened-unfinished with riziko: 2 × remaining × 2', () => {
    // seat 1: declaredCift=true, hasOpened=true, remaining=18 → 2×18=36 ×2 (riziko) = 72
    const s = endedState({
      rizikoActive: true,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: h('5R', '6R', '7R'), hasOpened: true, declaredCift: true }, // sum=18
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(72) // 2 × 18 × 2
  })
})

// ── Exhaustion (no finisher) ───────────────────────────────────────────────────

describe('exhaustion — no finisher credit', () => {
  it('no −101 credit; everyone charged their applicable penalty', () => {
    // seat 0: opened, rack sum=10
    // seat 1: opened, rack sum=20
    // seat 2: never opened → +202
    // seat 3: never opened → +202
    const s = endedState({
      terminal: { reason: 'exhausted' },
      players: [
        { rack: h('5R', '5M'), hasOpened: true },         // 5+5=10
        { rack: h('5R', '7R', '8M'), hasOpened: true },   // 5+7+8=20
        { rack: [], hasOpened: false },                    // +202
        { rack: [], hasOpened: false },                    // +202
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[0]).toBe(10)
    expect(deltas[1]).toBe(20)
    expect(deltas[2]).toBe(202)
    expect(deltas[3]).toBe(202)
  })

  it('exhaustion + riziko: all penalties doubled', () => {
    const s = endedState({
      rizikoActive: true,
      terminal: { reason: 'exhausted' },
      players: [
        { rack: h('5R', '5M'), hasOpened: true },   // 10 × 2 = 20
        { rack: [], hasOpened: false },              // 202 × 2 = 404
        { rack: [], hasOpened: false },              // 202 × 2 = 404
        { rack: [], hasOpened: false },              // 202 × 2 = 404
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[0]).toBe(20)
    expect(deltas[1]).toBe(404)
    expect(deltas[2]).toBe(404)
    expect(deltas[3]).toBe(404)
  })

  it('exhaustion: çift declared never-opened pays 404', () => {
    const s = endedState({
      terminal: { reason: 'exhausted' },
      players: [
        { rack: [], hasOpened: false, declaredCift: true }, // 404
        { rack: [], hasOpened: false },                     // 202
        { rack: [], hasOpened: false },                     // 202
        { rack: [], hasOpened: false },                     // 202
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[0]).toBe(404)
    expect(deltas[1]).toBe(202)
  })

  it('exhaustion + flat penalty: flat still added once', () => {
    const s = endedState({
      terminal: { reason: 'exhausted' },
      penaltiesApplied: [{ seat: 0, type: 'islek-floor-open' }],
      players: [
        { rack: h('5R', '5M'), hasOpened: true }, // 10 + 101 flat = 111
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[0]).toBe(111)
  })
})
