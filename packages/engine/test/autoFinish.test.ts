// packages/engine/test/autoFinish.test.ts
// Task 1e: AUTO-FINISH on discard
//
// After removing the discarded tile, the Discard reducer checks if the
// remaining rack is a winning hand (Klasik) or if rack is empty with
// hasOpened=true (101). If so, the game ends immediately with
// terminal.reason='win' instead of advancing the turn.

import { describe, it, expect } from 'vitest'
import { reduce } from '../src/reduce'
import { KLASIK, KLASIK_101 } from '../src/config'
import { tileFromString } from '../src/tile'
import type { Tile } from '../src/tile'
import type { GameState } from '../src/state'

// ── helpers ──────────────────────────────────────────────────────────────────

function h(...strs: string[]): Tile[] {
  return strs.map(tileFromString)
}

/**
 * Build a minimal Klasik GameState in PLAYING/DISCARD for the given seat.
 * okey defaults to 7M, indicator to 6M.
 */
function playingKlasikState(
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
    gameId: 'g-autofinish-klasik',
    config: KLASIK,
    rngSeed: 1,
    handNo: 1,
    stock: h('1R', '2R', '3R'),
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

/**
 * Build a minimal 101 GameState in PLAYING/DISCARD for the given seat.
 * okey defaults to 7M, indicator to 6M.
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
    gameId: 'g-autofinish-101',
    config: KLASIK_101,
    rngSeed: 1,
    handNo: 1,
    stock: h('1R', '2R', '3R'),
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

// ── Klasik: auto-finish on winning discard ────────────────────────────────────

describe('Klasik auto-finish: Discard triggers win when rack becomes winning', () => {
  // Winning rack after discarding the finishing tile:
  // 1R,2R,3R | 4R,5R,6R | 7R,8R,9R (three runs of 3) → 9 tiles, 3 groups = winning
  // rack (10 tiles): 1R,2R,3R,4R,5R,6R,7R,8R,9R + finishTile(10R)
  // okey = 7M (not in this set)

  const winningRemainder = h('1R', '2R', '3R', '4R', '5R', '6R', '7R', '8R', '9R')
  const finishTile = tileFromString('10R')
  const fullRack = [...winningRemainder, finishTile]

  it('ends the game with status=ENDED and terminal.reason=win', () => {
    const state = playingKlasikState(0, fullRack)
    const ended = reduce(state, { type: 'Discard', seat: 0, tile: finishTile })

    expect(ended.status).toBe('ENDED')
    expect(ended.terminal?.reason).toBe('win')
  })

  it('sets terminal.winnerSeat to the acting seat', () => {
    const state = playingKlasikState(2, fullRack)
    const ended = reduce(state, { type: 'Discard', seat: 2, tile: finishTile })

    expect(ended.terminal?.winnerSeat).toBe(2)
  })

  it('sets terminal.winType to a non-nullish value', () => {
    const state = playingKlasikState(0, fullRack)
    const ended = reduce(state, { type: 'Discard', seat: 0, tile: finishTile })

    expect(ended.terminal?.winType).toBeDefined()
  })

  it('sets terminal.finishingTile to the discarded tile', () => {
    const state = playingKlasikState(0, fullRack)
    const ended = reduce(state, { type: 'Discard', seat: 0, tile: finishTile })

    expect(ended.terminal?.finishingTile).toEqual(finishTile)
  })

  it('pushes the finishing tile to the player discard pile', () => {
    const state = playingKlasikState(0, fullRack)
    const ended = reduce(state, { type: 'Discard', seat: 0, tile: finishTile })

    const p0 = ended.players.find((p) => p.seat === 0)!
    expect(p0.discard).toContainEqual(finishTile)
  })

  it('marks the winning player as isOut=true', () => {
    const state = playingKlasikState(0, fullRack)
    const ended = reduce(state, { type: 'Discard', seat: 0, tile: finishTile })

    expect(ended.players.find((p) => p.seat === 0)!.isOut).toBe(true)
  })

  it('does NOT advance the turn (turn remains at winning seat)', () => {
    const state = playingKlasikState(0, fullRack)
    const ended = reduce(state, { type: 'Discard', seat: 0, tile: finishTile })

    // Turn must NOT be advanced to the next seat in DRAW phase
    // (It's fine if turn.seat stays 0 or the turn is not DRAW for seat 1)
    expect(ended.turn.seat).not.toBe(1)
    // OR status is ENDED so the turn doesn't matter — ENDED is the key check
    expect(ended.status).toBe('ENDED')
  })

  it('winType is perOnly for a runs/groups win', () => {
    const state = playingKlasikState(0, fullRack)
    const ended = reduce(state, { type: 'Discard', seat: 0, tile: finishTile })

    expect(ended.terminal?.winType).toBe('perOnly')
  })
})

// ── Klasik: non-winning discard still advances turn normally ──────────────────

describe('Klasik non-winning discard: turn still advances', () => {
  it('advances turn to next seat when discard does not produce a win', () => {
    // Rack with 10 random tiles that are NOT a winning hand after discarding one
    const rack = h('1R', '2R', '4R', '5R', '7R', '8R', '10R', '11R', '1K', '2K')
    const discardTile = tileFromString('2K')
    const state = playingKlasikState(0, rack)

    const next = reduce(state, { type: 'Discard', seat: 0, tile: discardTile })

    expect(next.status).toBe('PLAYING')
    expect(next.turn.seat).toBe(1)
    expect(next.turn.phase).toBe('DRAW')
  })

  it('keeps the game PLAYING when the resulting rack is not winning', () => {
    const rack = h('1R', '2R', '4R', '5R', '7R', '8R', '10R', '11R', '1K', '2K')
    const discardTile = tileFromString('2K')
    const state = playingKlasikState(0, rack)

    const next = reduce(state, { type: 'Discard', seat: 0, tile: discardTile })

    expect(next.status).toBe('PLAYING')
    expect(next.terminal).toBeUndefined()
  })
})

// ── Klasik: pairs win also triggers auto-finish ───────────────────────────────

describe('Klasik auto-finish: pairs win type', () => {
  it('detects a pairs win and ends the game', () => {
    // 7 pairs = 14 tiles: 1R,1R | 2R,2R | 3R,3R | 4R,4R | 5R,5R | 6R,6R | 8R,8R
    // okey=7M (not present), allowPairsWin=true in KLASIK
    // After discarding finishTile, rack has 7 pairs = 14 tiles
    // Wait: Klasik rack starts at 15 (starter gets 15, others 14)
    // In this test we build a custom 15-tile rack: 7 pairs + 1 finishing tile
    const pairs = h('1R', '1R', '2R', '2R', '3R', '3R', '4R', '4R', '5R', '5R', '6R', '6R', '8R', '8R')
    const finishTile = tileFromString('9R')
    const fullRack = [...pairs, finishTile]
    const state = playingKlasikState(0, fullRack)

    const ended = reduce(state, { type: 'Discard', seat: 0, tile: finishTile })

    expect(ended.status).toBe('ENDED')
    expect(ended.terminal?.reason).toBe('win')
    expect(ended.terminal?.winType).toBe('pairs')
  })
})

// ── 101: auto-finish when rack is empty and hasOpened=true ───────────────────

describe('101 auto-finish: empty rack + hasOpened=true after discard → win', () => {
  it('ends the game when discarding the last tile and hasOpened=true', () => {
    // Only 1 tile in rack; after discarding it the rack is empty.
    const lastTile = tileFromString('5R')
    const state = playing101State(0, [lastTile], {}, { hasOpened: true })

    const ended = reduce(state, { type: 'Discard', seat: 0, tile: lastTile })

    expect(ended.status).toBe('ENDED')
    expect(ended.terminal?.reason).toBe('win')
  })

  it('sets terminal.winnerSeat to the acting seat', () => {
    const lastTile = tileFromString('5R')
    const state = playing101State(1, [lastTile], {}, { hasOpened: true })

    const ended = reduce(state, { type: 'Discard', seat: 1, tile: lastTile })

    expect(ended.terminal?.winnerSeat).toBe(1)
  })

  it('sets terminal.winType to perOnly', () => {
    const lastTile = tileFromString('5R')
    const state = playing101State(0, [lastTile], {}, { hasOpened: true })

    const ended = reduce(state, { type: 'Discard', seat: 0, tile: lastTile })

    expect(ended.terminal?.winType).toBe('perOnly')
  })

  it('sets terminal.finishingTile to the discarded tile', () => {
    const lastTile = tileFromString('5R')
    const state = playing101State(0, [lastTile], {}, { hasOpened: true })

    const ended = reduce(state, { type: 'Discard', seat: 0, tile: lastTile })

    expect(ended.terminal?.finishingTile).toEqual(lastTile)
  })

  it('pushes the finishing tile to the player discard pile', () => {
    const lastTile = tileFromString('5R')
    const state = playing101State(0, [lastTile], {}, { hasOpened: true })

    const ended = reduce(state, { type: 'Discard', seat: 0, tile: lastTile })

    expect(ended.players.find((p) => p.seat === 0)!.discard).toContainEqual(lastTile)
  })

  it('marks the winning player as isOut=true', () => {
    const lastTile = tileFromString('5R')
    const state = playing101State(0, [lastTile], {}, { hasOpened: true })

    const ended = reduce(state, { type: 'Discard', seat: 0, tile: lastTile })

    expect(ended.players.find((p) => p.seat === 0)!.isOut).toBe(true)
  })
})

// ── 101: no auto-finish when rack is empty but hasOpened=false ────────────────

describe('101 no auto-finish: empty rack but hasOpened=false', () => {
  it('does NOT end the game when rack becomes empty but player has not opened', () => {
    const lastTile = tileFromString('5R')
    const state = playing101State(0, [lastTile], {}, { hasOpened: false })

    const next = reduce(state, { type: 'Discard', seat: 0, tile: lastTile })

    // Should advance turn normally (not end game)
    expect(next.status).toBe('PLAYING')
    expect(next.turn.seat).toBe(1)
    expect(next.turn.phase).toBe('DRAW')
  })
})

// ── 101: no auto-finish for non-empty rack (even if hasOpened=true) ───────────

describe('101 no auto-finish: rack not empty after discard', () => {
  it('does NOT end the game when there are still tiles left in rack', () => {
    const rack = h('5R', '6R', '7R')
    const discardTile = tileFromString('7R')
    const state = playing101State(0, rack, {}, { hasOpened: true })

    const next = reduce(state, { type: 'Discard', seat: 0, tile: discardTile })

    expect(next.status).toBe('PLAYING')
    expect(next.turn.seat).toBe(1)
    expect(next.turn.phase).toBe('DRAW')
  })
})

// ── 101: normal win via evaluateHand does NOT auto-trigger (101 uses empty-rack path only) ──

describe('101 auto-finish: evaluateHand win does NOT trigger (only empty-rack+hasOpened path)', () => {
  it('does NOT end the game via evaluateHand for 101 — must use empty rack path', () => {
    // In 101, the win condition is rack.length === 0 && hasOpened,
    // NOT evaluateHand. So a winning-by-melds rack that is not empty should not auto-finish.
    const winningRemainder = h('1R', '2R', '3R', '4R', '5R', '6R', '7R', '8R', '9R')
    const finishTile = tileFromString('10R')
    const fullRack = [...winningRemainder, finishTile]
    // hasOpened=true, rack.length after discard = 9 (not 0) → no auto-finish
    const state = playing101State(0, fullRack, {}, { hasOpened: true })

    const next = reduce(state, { type: 'Discard', seat: 0, tile: finishTile })

    // In 101, discarding 10R leaves 9 tiles — not a win by the 101 auto-finish rule
    expect(next.status).toBe('PLAYING')
  })
})

// ── DeclareWin still works (back-compat) ─────────────────────────────────────

describe('DeclareWin back-compat: explicit declare still ends game', () => {
  it('Klasik DeclareWin still works independently of Discard', () => {
    const winningRemainder = h('1R', '2R', '3R', '4R', '5R', '6R', '7R', '8R', '9R')
    const finishTile = tileFromString('10R')
    const fullRack = [...winningRemainder, finishTile]
    const state = playingKlasikState(0, fullRack)

    const ended = reduce(state, { type: 'DeclareWin', seat: 0, discardTile: finishTile })

    expect(ended.status).toBe('ENDED')
    expect(ended.terminal?.reason).toBe('win')
    expect(ended.terminal?.winnerSeat).toBe(0)
  })
})
