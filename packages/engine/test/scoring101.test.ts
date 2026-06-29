// packages/engine/test/scoring101.test.ts
import { describe, it, expect } from 'vitest'
import { scoreHand101, okeyHeldPenalties, teamScores } from '../src/scoring/yuzbir'
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

  it('opened non-finisher holding false-joker counts it as okey face value (not 101)', () => {
    // okey = 7M (number=7); seat 1: opened, rack = 3K + X(false_joker).
    // False joker is a plain tile fixed to okey's face value: 7.
    // Sum = 3 + 7 = 10
    const okey = tileFromString('7M')
    const s = endedState({
      okey,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: [tileFromString('3K'), tileFromString('X')], hasOpened: true },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(10) // 3 + 7 (okey face value)
  })

  it('opened non-finisher holding false-joker when okey=8K: contributes 8 (not 101)', () => {
    // okey = 8K (number=8); false joker face value = 8
    // seat 1: opened, rack = 5R + X(false_joker). Sum = 5 + 8 = 13
    const okey = tileFromString('8K')
    const indicator = tileFromString('7K')
    const s = endedState({
      okey,
      indicator,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: [tileFromString('5R'), tileFromString('X')], hasOpened: true },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(13) // 5 + 8 (okey face value)
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

  it('non-finishers ARE multiplied by the finish type (okey → everyone ×2)', () => {
    const okey = tileFromString('7M')
    const s = endedState({
      okey,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly', finishingTile: okey },
      players: [
        { rack: [] },
        { rack: h('5R', '6R', '7R'), hasOpened: true }, // sum=18 → ×2 = 36
        { rack: [], hasOpened: false }, // 202 → ×2 = 404
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(36)
    expect(deltas[2]).toBe(404)
  })
})

// ── Çift + okey finish → everyone ×4 ────────────────────────────────────────────

describe('çift + okey finish — multiplier ×4 applies to the whole table', () => {
  it('finisher −404, opened-18 → 72, never-opened → 808', () => {
    const okey = tileFromString('7M')
    const s = endedState({
      okey,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'pairs', finishingTile: okey },
      players: [
        { rack: [] },
        { rack: h('5R', '6R', '7R'), hasOpened: true }, // 18 → ×4 = 72
        { rack: [], hasOpened: false },                  // 202 → ×4 = 808
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[0]).toBe(-404)
    expect(deltas[1]).toBe(72)
    expect(deltas[2]).toBe(808)
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

// ── Çift binding via opening route (opened pairs WITHOUT declaring) ───────────

describe('çift binding via opening route', () => {
  it('opened via pairs (openRoute=cift) pays 2× leftover even without declaredCift', () => {
    // The PO rule: opening çift binds you to çift scoring whether or not you said
    // "çifte gidiyorum". seat 1 opened pairs, leftover 5+6+7=18 → 2×18 = 36.
    const s = endedState({
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: h('5R', '6R', '7R'), hasOpened: true, declaredCift: false, openRoute: 'cift' },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(36) // 2 × 18
  })

  it('opened via pairs + never-finished (openRoute=cift) with riziko: 2×18×2 = 72', () => {
    const s = endedState({
      rizikoActive: true,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: h('5R', '6R', '7R'), hasOpened: true, openRoute: 'cift' },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    expect(scoreHand101(s)[1]).toBe(72)
  })
})

// ── Okey held by an OPENED player → flat +101 (separate, never multiplied) ──────

describe('okey held by an opened player', () => {
  it('opened non-finisher holding okey: leftover×m + a FLAT 101 (çift finish ×2)', () => {
    // çift finish doubles the table (×2). seat 1 opened (non-çift) holds okey + 5R.
    // The okey is NOT part of the ×2 leftover — it is a flat +101 instead:
    //   leftover 5×2 = 10, + okey-held 101 flat = 111  (NOT (5+101)×2 = 212).
    const okey = tileFromString('7M')
    const s = endedState({
      okey,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'pairs' },
      players: [
        { rack: [] },
        { rack: [tileFromString('5R'), okey], hasOpened: true },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    expect(scoreHand101(s)[1]).toBe(111)
  })

  it('opened non-finisher holding okey (normal finish, m=1): still totals 5 + 101 = 106', () => {
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
    expect(scoreHand101(s)[1]).toBe(106)
  })

  it('NOT-opened player holding okey: no okey-held penalty (flat 202 base)', () => {
    const okey = tileFromString('7M')
    const s = endedState({
      okey,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: [tileFromString('5R'), okey], hasOpened: false },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    expect(scoreHand101(s)[1]).toBe(202)
  })
})

// ── okeyHeldPenalties (display + scoring source of truth) ──────────────────────

describe('okeyHeldPenalties', () => {
  it('lists okey-held only for OPENED non-finishers holding the real okey', () => {
    const okey = tileFromString('7M')
    const s = endedState({
      okey,
      terminal: { reason: 'exhausted' },
      players: [
        { rack: [tileFromString('5R'), okey], hasOpened: true },   // opened + okey → yes
        { rack: [okey], hasOpened: false },                         // not opened → no
        { rack: [tileFromString('3K')], hasOpened: true },          // opened, no okey → no
        { rack: [tileFromString('X')], hasOpened: true },           // false joker ≠ okey → no
      ],
    })
    expect(okeyHeldPenalties(s)).toEqual([{ seat: 0, type: 'okey-held' }])
  })

  it('never charges the finisher (empty rack)', () => {
    const okey = tileFromString('7M')
    const s = endedState({
      okey,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [], hasOpened: true },
        { rack: [tileFromString('5R')], hasOpened: true },
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    expect(okeyHeldPenalties(s)).toEqual([])
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

// ── Elden bitme (800) — opened+finished while nobody else opened ───────────────

describe('elden bitme (800) — doubles the table, composes with okey/çift', () => {
  it('plain elden: finisher −202, opened loser ×2, never-opened ×2', () => {
    const s = endedState({
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly', eldenBitme: true },
      players: [
        { rack: [] },                                  // 0 winner → −101 ×2 = −202
        { rack: h('5R', '6R', '7R'), hasOpened: true },// 1 → 18 ×2 = 36
        { rack: [], hasOpened: false },                // 2 → 202 ×2 = 404
        { rack: [], hasOpened: false },
      ],
    })
    const d = scoreHand101(s)
    expect(d[0]).toBe(-202)
    expect(d[1]).toBe(36)
    expect(d[2]).toBe(404)
  })

  it('elden + okey finish → ×4: finisher −404, opened loser ×4', () => {
    const okey = tileFromString('7M')
    const s = endedState({
      okey,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly', finishingTile: okey, eldenBitme: true },
      players: [
        { rack: [] },                                  // −101 ×4 = −404
        { rack: h('5R', '6R', '7R'), hasOpened: true },// 18 ×4 = 72
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    const d = scoreHand101(s)
    expect(d[0]).toBe(-404)
    expect(d[1]).toBe(72)
  })

  it('elden + a çift-declaring loser → that loser pays 2×base ×2 elden = ×4', () => {
    const s = endedState({
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly', eldenBitme: true },
      players: [
        { rack: [] },
        { rack: h('5R', '6R', '7R'), hasOpened: true, declaredCift: true }, // 2×18 ×2 = 72
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    expect(scoreHand101(s)[1]).toBe(72)
  })

  it('flat penalties are NOT doubled by elden bitme', () => {
    const s = endedState({
      penaltiesApplied: [{ seat: 1, type: 'islek-discard' }],
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly', eldenBitme: true },
      players: [
        { rack: [] },
        { rack: h('5R', '6R', '7R'), hasOpened: true }, // 18 ×2 = 36, + flat 101 = 137
        { rack: [], hasOpened: false },
        { rack: [], hasOpened: false },
      ],
    })
    expect(scoreHand101(s)[1]).toBe(137) // 36 + 101 (flat, NOT ×2)
  })

  it('NOT elden (eldenBitme falsey) → normal ×1', () => {
    const s = endedState({
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' }, // no eldenBitme
      players: [
        { rack: [] },
        { rack: h('5R', '6R', '7R'), hasOpened: true }, // 18 ×1
        { rack: [], hasOpened: false },                 // 202 ×1
        { rack: [], hasOpened: false },
      ],
    })
    const d = scoreHand101(s)
    expect(d[0]).toBe(-101)
    expect(d[1]).toBe(18)
    expect(d[2]).toBe(202)
  })

  it('team mode + elden: partner waived, opponents pay ×2', () => {
    const s = endedState({
      config: { ...KLASIK_101, teamMode: true },
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly', eldenBitme: true },
      players: [
        { rack: [] },                                   // 0 winner → −202
        { rack: h('5R', '6R', '7R'), hasOpened: true }, // 1 opponent → 36
        { rack: h('5R', '6R', '7R'), hasOpened: true }, // 2 PARTNER → waived 0
        { rack: [], hasOpened: false },                 // 3 opponent → 404
      ],
    })
    const d = scoreHand101(s)
    expect(d[0]).toBe(-202)
    expect(d[1]).toBe(36)
    expect(d[2]).toBe(0)
    expect(d[3]).toBe(404)
  })
})

// ── Eşli (team) mode — partner waiver + team aggregation ───────────────────────

describe('eşli (team) mode — winner waives their partner’s leftover', () => {
  const TEAM = { ...KLASIK_101, teamMode: true }

  it('winner seat 0 → partner (seat 2) pays NOTHING for leftover; opponents pay normally', () => {
    const s = endedState({
      config: TEAM,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },                                              // 0 winner → −101
        { rack: h('5R', '6R', '7R', '8R', '9R'), hasOpened: true },// 1 opponent → 35
        { rack: h('5R', '6R', '7R', '8R', '9R'), hasOpened: true },// 2 PARTNER → waived 0
        { rack: [], hasOpened: false },                            // 3 opponent → 202
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[0]).toBe(-101)
    expect(deltas[1]).toBe(35)
    expect(deltas[2]).toBe(0)   // partner's 35 waived
    expect(deltas[3]).toBe(202)
  })

  it('a never-opened partner is also fully waived', () => {
    const s = endedState({
      config: TEAM,
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: [], hasOpened: false },  // 1 opponent → 202
        { rack: [], hasOpened: false },  // 2 PARTNER never opened → waived 0 (not 202)
        { rack: [], hasOpened: false },  // 3 opponent → 202
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[2]).toBe(0)
    expect(deltas[1]).toBe(202)
    expect(deltas[3]).toBe(202)
  })

  it('the partner’s FLAT penalties still stick (only the leftover is waived)', () => {
    const okey = tileFromString('7M')
    const s = endedState({
      config: TEAM,
      okey,
      penaltiesApplied: [{ seat: 2, type: 'islek-discard' }],
      terminal: { reason: 'win', winnerSeat: 0, winType: 'perOnly' },
      players: [
        { rack: [] },
        { rack: [], hasOpened: false },
        { rack: [tileFromString('5R'), okey], hasOpened: true }, // 2 PARTNER: 5 + okey-held + işlek
        { rack: [], hasOpened: false },
      ],
    })
    const deltas = scoreHand101(s)
    // leftover (5) waived → 0; but flat işlek (+101) and okey-held (+101) remain.
    expect(deltas[2]).toBe(202)
  })

  it('opponent team finishing waives ITS partner, not ours', () => {
    const s = endedState({
      config: TEAM,
      terminal: { reason: 'win', winnerSeat: 1, winType: 'perOnly' }, // seat 1 wins → partner 3 waived
      players: [
        { rack: h('5R', '6R', '7R'), hasOpened: true }, // 0 (our team) → 18
        { rack: [] },                                    // 1 winner → −101
        { rack: h('5R', '6R', '7R'), hasOpened: true }, // 2 (our team) → 18
        { rack: h('5R', '6R', '7R'), hasOpened: true }, // 3 PARTNER of winner → waived 0
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas[1]).toBe(-101)
    expect(deltas[3]).toBe(0)
    expect(deltas[0]).toBe(18)
    expect(deltas[2]).toBe(18)
  })

  it('NO waiver on exhaustion (nobody finished) — every leftover counts', () => {
    const s = endedState({
      config: TEAM,
      terminal: { reason: 'exhausted' },
      players: [
        { rack: h('5R', '5M'), hasOpened: true }, // 10
        { rack: h('5R', '7R'), hasOpened: true },  // 12
        { rack: h('5R', '6R'), hasOpened: true },  // 11
        { rack: [], hasOpened: false },            // 202
      ],
    })
    const deltas = scoreHand101(s)
    expect(deltas).toEqual([10, 12, 11, 202])
  })

  it('teamScores sums seats 0,2 vs 1,3', () => {
    expect(teamScores([-101, 35, 0, 202])).toEqual([-101, 237])
    expect(teamScores([18, -101, 18, 0])).toEqual([36, -101])
  })
})
