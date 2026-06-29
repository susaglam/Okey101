// packages/engine/test/integration101.test.ts
// Integration tests for Task 5: 101 finish (must-retain-tile) + draw-exhaustion scoring.
//
// We build GameStates directly rather than driving a full hand so tests are
// deterministic and focused. KLASIK_101 is used throughout. Klasik path is
// guarded by the Klasik-DeclareWin regression test at the bottom.

import { describe, it, expect } from 'vitest'
import { reduce, RuleError } from '../src/reduce'
import { KLASIK_101, KLASIK } from '../src/config'
import { scoreHand101 } from '../src/scoring/yuzbir'
import { tileFromString } from '../src/tile'
import type { Tile } from '../src/tile'
import type { GameState } from '../src/state'

// ── helpers ───────────────────────────────────────────────────────────────────

function h(...strs: string[]): Tile[] {
  return strs.map(tileFromString)
}

/**
 * Build a minimal 101 GameState in PLAYING/DISCARD for the given seat.
 * Gives the seat the tiles in `rack`. Other seats get empty racks.
 * okey defaults to 7M (BLUE 7), indicator to 6M.
 */
function playing101State(
  seat: number,
  rack: Tile[],
  overrides: Partial<GameState> = {},
  playerOverrides: Partial<GameState['players'][number]> = {},
): GameState {
  const okey = tileFromString('7M')
  const indicator = tileFromString('6M')

  const players = [0, 1, 2, 3].map((s) => ({
    seat: s,
    rack: s === seat ? rack : ([] as Tile[]),
    discard: [] as Tile[],
    hasOpened: false,
    isOut: false,
    declaredCift: false,
    openedValue: 0,
    ...(s === seat ? playerOverrides : {}),
  }))

  return {
    gameId: 'g-integration-101',
    config: KLASIK_101,
    rngSeed: 1,
    handNo: 1,
    stock: h('1R', '2R', '3R'), // non-empty by default
    indicator,
    okey,
    turn: { seat, phase: 'DISCARD' },
    players,
    scores: [0, 0, 0, 0],
    status: 'PLAYING',
    tableMelds: [],
    rizikoActive: false,
    penaltiesApplied: [],
    terminal: undefined,
    ...overrides,
  }
}

// ── Test 1: Finish gate — DeclareWin without opening must throw ───────────────

describe('101 finish gate: must open before declaring win', () => {
  it('throws RuleError when player has NOT opened (hasOpened=false)', () => {
    // Build a winning rack for seat 0: 1R,1K,1M,1S, 2R,2K,2M, 3R,3K,3M, 4R,4K,4M + finishing
    // A clean perOnly win: three runs of 3. 9 tiles in rack after discarding finishing tile.
    // Rack = 1R,2R,3R, 4R,5R,6R, 7R,8R,9R, plus finishing tile 10R (to discard).
    const rack = h('1R', '2R', '3R', '4R', '5R', '6R', '7R', '8R', '9R', '10R')
    const finishTile = tileFromString('10R')

    const state = playing101State(0, rack, {}, { hasOpened: false })

    expect(() =>
      reduce(state, { type: 'DeclareWin', seat: 0, discardTile: finishTile })
    ).toThrow(RuleError)
  })

  it('the RuleError message mentions opening', () => {
    const rack = h('1R', '2R', '3R', '4R', '5R', '6R', '7R', '8R', '9R', '10R')
    const finishTile = tileFromString('10R')
    const state = playing101State(0, rack, {}, { hasOpened: false })

    let caught: Error | null = null
    try {
      reduce(state, { type: 'DeclareWin', seat: 0, discardTile: finishTile })
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeInstanceOf(RuleError)
    expect(caught!.message).toMatch(/open/i)
  })
})

// ── Test 2: Happy finish — hasOpened=true, DeclareWin succeeds ────────────────

describe('101 happy finish: hasOpened=true → win terminal + scoreHand101 credit', () => {
  it('DeclareWin succeeds when hasOpened=true and rack is winning', () => {
    // Rack: 1R,2R,3R | 4R,5R,6R | 7R,8R,9R | + finish tile 10R (to discard)
    const rack = h('1R', '2R', '3R', '4R', '5R', '6R', '7R', '8R', '9R', '10R')
    const finishTile = tileFromString('10R')

    const state = playing101State(0, rack, {}, { hasOpened: true })

    const ended = reduce(state, { type: 'DeclareWin', seat: 0, discardTile: finishTile })

    expect(ended.status).toBe('ENDED')
    expect(ended.terminal?.reason).toBe('win')
    expect(ended.terminal?.winnerSeat).toBe(0)
    expect(ended.terminal?.winType).toBeDefined()
    expect(ended.terminal?.finishingTile).toEqual(finishTile)
  })

  it('scoreHand101 gives the finisher a negative (credit) delta', () => {
    const rack = h('1R', '2R', '3R', '4R', '5R', '6R', '7R', '8R', '9R', '10R')
    const finishTile = tileFromString('10R')

    // Seat 1 has ALSO opened (with a leftover) so this is a NORMAL finish, not
    // "elden bitme" (which fires only when nobody else opened → ×2).
    const base = playing101State(0, rack, {}, { hasOpened: true })
    const state: GameState = {
      ...base,
      players: base.players.map((p) => (p.seat === 1 ? { ...p, hasOpened: true, rack: h('5R', '5K') } : p)),
    }
    const ended = reduce(state, { type: 'DeclareWin', seat: 0, discardTile: finishTile })

    const deltas = scoreHand101(ended)
    expect(deltas[0]).toBeLessThan(0)
    expect(deltas[1]).toBe(10)   // opened, leftover 5+5
    expect(deltas[2]).toBe(202)  // never opened
    expect(deltas[3]).toBe(202)
  })

  it('finisher credit is exactly −101 for a normal perOnly finish', () => {
    const rack = h('1R', '2R', '3R', '4R', '5R', '6R', '7R', '8R', '9R', '10R')
    const finishTile = tileFromString('10R')

    // Seat 1 opened too → NOT elden bitme, so no ×2: a plain perOnly finish.
    const base = playing101State(0, rack, {}, { hasOpened: true })
    const state: GameState = {
      ...base,
      players: base.players.map((p) => (p.seat === 1 ? { ...p, hasOpened: true } : p)),
    }
    const ended = reduce(state, { type: 'DeclareWin', seat: 0, discardTile: finishTile })

    const deltas = scoreHand101(ended)
    // 10R is not the okey (7M), winType 'perOnly', not elden → no multiplier → −101
    expect(deltas[0]).toBe(-101)
  })

  it('a finish where NOBODY else opened is elden bitme → finisher −202', () => {
    const rack = h('1R', '2R', '3R', '4R', '5R', '6R', '7R', '8R', '9R', '10R')
    const finishTile = tileFromString('10R')
    // All opponents still closed → reduce stamps terminal.eldenBitme → ×2.
    const state = playing101State(0, rack, {}, { hasOpened: true })
    const ended = reduce(state, { type: 'DeclareWin', seat: 0, discardTile: finishTile })
    expect(ended.terminal?.eldenBitme).toBe(true)
    expect(scoreHand101(ended)[0]).toBe(-202)
  })
})

// ── Test 3: Draw-exhaustion in 101 → terminal.reason='exhausted' ──────────────

describe('101 draw-exhaustion: empty stock → terminal.reason=exhausted', () => {
  it('DrawFromStock on empty stock in 101 game ends with reason=exhausted', () => {
    // Build a 101 state with stock=[] and it is seat 1's DRAW turn
    const state = playing101State(1, h('5R', '6R'), { stock: [] })
    // Advance turn to seat 1 DRAW
    const drawState: GameState = { ...state, turn: { seat: 1, phase: 'DRAW' } }

    const ended = reduce(drawState, { type: 'DrawFromStock', seat: 1 })

    expect(ended.status).toBe('ENDED')
    expect(ended.terminal?.reason).toBe('exhausted')
  })

  it('scoreHand101 charges everyone their applicable penalty (no −101 credit)', () => {
    // seat 0: opened, rack sum 10 → pays 10
    // seat 1: opened, rack sum 20 → pays 20
    // seat 2: never opened → pays 202
    // seat 3: never opened → pays 202
    const okey = tileFromString('7M')
    const indicator = tileFromString('6M')

    const players: GameState['players'] = [
      { seat: 0, rack: h('5R', '5M'), discard: [], hasOpened: true, isOut: false, declaredCift: false, openedValue: 108 },
      { seat: 1, rack: h('5R', '7R', '8M'), discard: [], hasOpened: true, isOut: false, declaredCift: false, openedValue: 108 },
      { seat: 2, rack: [], discard: [], hasOpened: false, isOut: false, declaredCift: false, openedValue: 0 },
      { seat: 3, rack: [], discard: [], hasOpened: false, isOut: false, declaredCift: false, openedValue: 0 },
    ]

    const exhaustedState: GameState = {
      gameId: 'g-exhaustion',
      config: KLASIK_101,
      rngSeed: 1,
      handNo: 1,
      stock: [],
      indicator,
      okey,
      turn: { seat: 2, phase: 'DRAW' },
      players,
      scores: [0, 0, 0, 0],
      status: 'ENDED',
      tableMelds: [],
      rizikoActive: false,
      penaltiesApplied: [],
      terminal: { reason: 'exhausted' },
    }

    const deltas = scoreHand101(exhaustedState)
    expect(deltas[0]).toBe(10)   // rackSum(5+5=10), opened
    expect(deltas[1]).toBe(20)   // rackSum(5+7+8=20), opened
    expect(deltas[2]).toBe(202)  // never opened
    expect(deltas[3]).toBe(202)  // never opened
    // No negative delta → no finisher credit
    for (const d of deltas) {
      expect(d).toBeGreaterThanOrEqual(0)
    }
  })

  it('DrawFromStock exhaustion drives stock from [] → ENDED, status ENDED', () => {
    const state = playing101State(0, h('5R'), { stock: [] })
    const drawState: GameState = { ...state, turn: { seat: 0, phase: 'DRAW' } }

    const ended = reduce(drawState, { type: 'DrawFromStock', seat: 0 })
    expect(ended.status).toBe('ENDED')
    expect(ended.terminal).toBeDefined()
    expect(ended.terminal!.reason).toBe('exhausted')
  })
})

// ── Klasik regression: DeclareWin still works without hasOpened ───────────────

describe('Klasik DeclareWin regression — hasOpened gate must NOT apply to Klasik', () => {
  it('Klasik DeclareWin succeeds even when hasOpened=false', () => {
    // Klasik has requiresOpening=false, so the hasOpened gate must not fire.
    const okey = tileFromString('8K')
    const indicator = tileFromString('7K')

    // Winning rack: three groups/runs → 1R,2R,3R | 4R,5R,6R | 7R,8R,9R | finish 10R
    // okey is 8K, none of these tiles are okey — clean win.
    const rack = h('1R', '2R', '3R', '4R', '5R', '6R', '7R', '8R', '9R', '10R')
    const finishTile = tileFromString('10R')

    const players: GameState['players'] = [
      { seat: 0, rack, discard: [], hasOpened: false, isOut: false, declaredCift: false, openedValue: 0 },
      { seat: 1, rack: [], discard: [], hasOpened: false, isOut: false, declaredCift: false, openedValue: 0 },
      { seat: 2, rack: [], discard: [], hasOpened: false, isOut: false, declaredCift: false, openedValue: 0 },
      { seat: 3, rack: [], discard: [], hasOpened: false, isOut: false, declaredCift: false, openedValue: 0 },
    ]

    const klasikState: GameState = {
      gameId: 'g-klasik-regression',
      config: KLASIK,
      rngSeed: 1,
      handNo: 1,
      stock: h('5S'),
      indicator,
      okey,
      turn: { seat: 0, phase: 'DISCARD' },
      players,
      scores: [0, 0, 0, 0],
      status: 'PLAYING',
      tableMelds: [],
      rizikoActive: false,
      penaltiesApplied: [],
    }

    // Should NOT throw; Klasik does not require hasOpened
    const ended = reduce(klasikState, { type: 'DeclareWin', seat: 0, discardTile: finishTile })
    expect(ended.status).toBe('ENDED')
    expect(ended.terminal?.reason).toBe('win')
    expect(ended.terminal?.winnerSeat).toBe(0)
  })

  it('Klasik DrawFromStock on empty stock still ends with hand-void (not exhausted)', () => {
    const okey = tileFromString('8K')
    const indicator = tileFromString('7K')

    const players: GameState['players'] = [
      { seat: 0, rack: h('1R'), discard: [], hasOpened: false, isOut: false, declaredCift: false, openedValue: 0 },
      { seat: 1, rack: [], discard: [], hasOpened: false, isOut: false, declaredCift: false, openedValue: 0 },
      { seat: 2, rack: [], discard: [], hasOpened: false, isOut: false, declaredCift: false, openedValue: 0 },
      { seat: 3, rack: [], discard: [], hasOpened: false, isOut: false, declaredCift: false, openedValue: 0 },
    ]

    const klasikState: GameState = {
      gameId: 'g-klasik-void',
      config: KLASIK,
      rngSeed: 1,
      handNo: 1,
      stock: [],
      indicator,
      okey,
      turn: { seat: 0, phase: 'DRAW' },
      players,
      scores: [0, 0, 0, 0],
      status: 'PLAYING',
      tableMelds: [],
      rizikoActive: false,
      penaltiesApplied: [],
    }

    const ended = reduce(klasikState, { type: 'DrawFromStock', seat: 0 })
    expect(ended.status).toBe('ENDED')
    expect(ended.terminal?.reason).toBe('hand-void')
  })
})
