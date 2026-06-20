// @vitest-environment jsdom
// P0-1: rejected actions surface a toast instead of being silently swallowed.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import GameScreen from '../src/screens/GameScreen'
import { KLASIK_101, tileFromString, type PlayerView, type GameEvent } from '@cs-okey/engine'
import type { Adapter } from '../src/adapter/Adapter'

// Çifte Git asks for confirmation (binding) — auto-confirm so the dispatch fires.
beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => cleanup())

function makeRejectingAdapter(view: PlayerView, reason: 'not-your-turn' | 'illegal-move') {
  const dispatch = vi.fn().mockResolvedValue({ accepted: false, reason })
  const adapter = {
    subscribe(onView: (v: PlayerView) => void, onStatus: (s: string) => void) {
      onStatus('connected')
      onView(view)
      return () => {}
    },
    dispatch,
    currentVersion: () => view.version,
    getMatch: () => ({ handNo: 1, totalHands: 11, standings: [0, 0, 0, 0], over: false }),
    nextHand: vi.fn(),
    getHistory: () => [],
    // 101 DISCARD phase, not yet declared çift → DeclareCift is legal (button enabled)
    legalMoves: (): GameEvent['type'][] => ['Discard', 'OpenMeld', 'DeclareWin', 'DeclareCift'],
  } as unknown as Adapter
  return { adapter, dispatch }
}

function discardPhase101View(): PlayerView {
  return {
    seat: 0,
    config: KLASIK_101,
    handNo: 1,
    you: { seat: 0, rack: [tileFromString('5R')], discard: [], hasOpened: false, isOut: false, declaredCift: false },
    opponents: [
      { seat: 1, rackCount: 21, discardCount: 0, hasOpened: false },
      { seat: 2, rackCount: 21, discardCount: 0, hasOpened: false },
      { seat: 3, rackCount: 21, discardCount: 0, hasOpened: false },
    ],
    stockCount: 60,
    indicator: tileFromString('6M'),
    okey: tileFromString('7M'),
    turn: { seat: 0, phase: 'DISCARD' },
    scores: [0, 0, 0, 0],
    status: 'PLAYING',
    tableMelds: [],
    rizikoActive: false,
    version: 1,
  }
}

describe('rejection toast (P0-1)', () => {
  it('shows a Turkish toast when a dispatched action is rejected', async () => {
    const { adapter, dispatch } = makeRejectingAdapter(discardPhase101View(), 'not-your-turn')
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)

    const btn = await screen.findByRole('button', { name: /çifte git/i })
    fireEvent.click(btn)

    expect(dispatch).toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByTestId('reject-toast').textContent).toBe('Sıra sende değil')
    })
  })

  it('maps illegal-move to its message', async () => {
    const { adapter } = makeRejectingAdapter(discardPhase101View(), 'illegal-move')
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)

    fireEvent.click(await screen.findByRole('button', { name: /çifte git/i }))
    await waitFor(() => {
      expect(screen.getByTestId('reject-toast').textContent).toBe('Geçersiz hamle')
    })
  })
})
