// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import GameScreen from '../src/screens/GameScreen'
import { KLASIK_101, tileFromString, type PlayerView, type GameEvent } from '@cs-okey/engine'
import type { Adapter } from '../src/adapter/Adapter'

afterEach(() => cleanup())

// Build a PlayerView for a player who has already opened and has a layable meld in rack
function makeOpenedView(): PlayerView {
  const okey = tileFromString('7M')
  // Rack contains 7R,8R,9R (a valid run, no ≥101 needed for post-opening) + junk
  const rack = [
    tileFromString('7R'), tileFromString('8R'), tileFromString('9R'),
    tileFromString('1K'), tileFromString('3M'), tileFromString('5S'),
  ]
  return {
    seat: 0,
    config: KLASIK_101,
    handNo: 1,
    you: {
      seat: 0,
      rack,
      discard: [],
      hasOpened: true,
      isOut: false,
    },
    opponents: [
      { seat: 1, rackCount: 21, discardCount: 0, hasOpened: false },
      { seat: 2, rackCount: 21, discardCount: 0, hasOpened: false },
      { seat: 3, rackCount: 21, discardCount: 0, hasOpened: false },
    ],
    stockCount: 60,
    indicator: tileFromString('6M'),
    okey,
    turn: { seat: 0, phase: 'DISCARD' },
    scores: [0, 0, 0, 0],
    status: 'PLAYING',
    tableMelds: [
      // Player 0 already has a meld on the table (from the opening)
      { owner: 0, kind: 'run', tiles: [tileFromString('11R'), tileFromString('12R'), tileFromString('13R')] },
    ],
    rizikoActive: false,
    version: 1,
  }
}

// Build a PlayerView for a player who has NOT yet opened (no meld laid post-opening possible)
function makeNotOpenedView(): PlayerView {
  const okey = tileFromString('7M')
  const rack = [
    tileFromString('7R'), tileFromString('8R'), tileFromString('9R'),
    tileFromString('1K'), tileFromString('3M'), tileFromString('5S'),
  ]
  return {
    seat: 0,
    config: KLASIK_101,
    handNo: 1,
    you: {
      seat: 0,
      rack,
      discard: [],
      hasOpened: false,
      isOut: false,
    },
    opponents: [
      { seat: 1, rackCount: 21, discardCount: 0, hasOpened: false },
      { seat: 2, rackCount: 21, discardCount: 0, hasOpened: false },
      { seat: 3, rackCount: 21, discardCount: 0, hasOpened: false },
    ],
    stockCount: 60,
    indicator: tileFromString('6M'),
    okey,
    turn: { seat: 0, phase: 'DISCARD' },
    scores: [0, 0, 0, 0],
    status: 'PLAYING',
    tableMelds: [],
    rizikoActive: false,
    version: 1,
  }
}

// Mock adapter that delivers a fixed view
function makeMockAdapter(view: PlayerView): Adapter {
  return {
    subscribe(onView, onStatus) {
      onStatus('connected')
      onView(view)
      return () => {}
    },
    dispatch: vi.fn().mockResolvedValue({ accepted: true }),
    currentVersion: () => view.version,
    getMatch: () => ({ handNo: 1, totalHands: 11, standings: [0, 0, 0, 0], over: false }),
    nextHand: vi.fn(),
    legalMoves: () => mockLegalMoves(view),
  } as unknown as Adapter
}

/** Mirrors engine legalMoves101 but driven by the redacted view (for mock adapters). */
function mockLegalMoves(view: PlayerView): GameEvent['type'][] {
  if (view.status !== 'PLAYING' || view.turn.seat !== view.seat) return []
  if (view.turn.phase === 'DRAW') {
    const moves: GameEvent['type'][] = ['DrawFromStock']
    const leftSeat = (view.seat - 1 + view.config.players) % view.config.players
    const left = view.opponents.find((o) => o.seat === leftSeat)
    if (left && left.discardCount > 0) moves.push('DrawFromDiscard')
    return moves
  }
  const moves: GameEvent['type'][] = ['Discard', 'OpenMeld', 'DeclareWin']
  if (!view.you.declaredCift) moves.push('DeclareCift')
  if (view.you.hasOpened && (view.tableMelds?.length ?? 0) > 0) moves.push('LayOff')
  return moves
}

describe('Seri Aç button (post-opening meld laying)', () => {
  it('shows "Seri Aç" button when player hasOpened and rack has a layable meld', async () => {
    const adapter = makeMockAdapter(makeOpenedView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /seri aç/i })).toBeTruthy()
    })
  })

  it('does NOT show "Aç (≥101)" when player hasOpened (already opened)', async () => {
    const adapter = makeMockAdapter(makeOpenedView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      // After opening, the ≥101 opening button should not appear
      expect(screen.queryByRole('button', { name: /aç.*101/i })).toBeNull()
    })
  })

  it('shows "Aç (≥101)" and NOT "Seri Aç" when player has NOT yet opened', async () => {
    const adapter = makeMockAdapter(makeNotOpenedView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      // Not opened → should show the ≥101 button (possibly disabled if no opening found)
      const acBtn = screen.queryByRole('button', { name: /aç.*101/i })
      expect(acBtn).toBeTruthy()
      // Seri Aç (post-open laying) should NOT appear when not yet opened
      expect(screen.queryByRole('button', { name: /seri aç/i })).toBeNull()
    })
  })
})
