// @vitest-environment jsdom
// Full React-flow repro for "score table lags one hand behind".
// Render the real GameScreen with a real LocalAdapter, drive hand 1 to its end
// through adapter.dispatch (which fires the subscribe → setHistory), then open
// the 📊 modal and assert it shows the finished hand (not the empty state).
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react'
import GameScreen from '../src/screens/GameScreen'
import { LocalAdapter } from '../src/adapter/LocalAdapter'
import { KLASIK, KLASIK_101 } from '@cs-okey/engine'

afterEach(() => cleanup())

describe.each([
  ['KLASIK', KLASIK],
  ['101', KLASIK_101],
])('score modal reflects finished hands immediately (%s)', (_label, variant) => {
  it('shows hand 1 in the table as soon as hand 1 has ended', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const a = new LocalAdapter({ seed: 7, humanSeat: 0, variant, matchHands: 5 })
    render(<GameScreen adapter={a as unknown as Parameters<typeof GameScreen>[0]['adapter']} />)

    // Drive hand 1 to completion (stock will exhaust → hand ENDED) via the adapter.
    let guard = 0
    await act(async () => {
      while (a.getHumanView().status !== 'ENDED' && guard++ < 8000) {
        const v = a.getHumanView()
        if (v.turn.seat !== 0) break
        const ev = v.turn.phase === 'DRAW'
          ? { type: 'DrawFromStock' as const, seat: 0 }
          : { type: 'Discard' as const, seat: 0, tile: v.you.rack[0]! }
        const r = await a.dispatch({ ...ev, expectedVersion: a.currentVersion() })
        if (!r.accepted) break
      }
    })

    expect(a.getHumanView().status).toBe('ENDED')
    expect(a.getHistory().length).toBe(1)

    // USER'S EXACT FLOW: skip the countdown ("Şimdi geç") to deal hand 2, THEN open the modal.
    const nextBtn = await screen.findByRole('button', { name: /şimdi geç/i })
    await act(async () => { fireEvent.click(nextBtn) })

    // Open the score modal (📊).
    const scoreBtn = screen.getByRole('button', { name: /skor/i })
    await act(async () => { fireEvent.click(scoreBtn) })

    // It must NOT show the empty state — the finished hand 1 should still be present.
    await waitFor(() => {
      expect(screen.queryByText(/henüz biten el yok/i)).toBeNull()
      expect(screen.getByTestId('score-table')).toBeTruthy()
    })
  })
})
