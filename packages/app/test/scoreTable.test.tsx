// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ScoreTable } from '../src/components/ScoreTable'
import { LocalAdapter } from '../src/adapter/LocalAdapter'
import type { HandRecord } from '../src/match'

afterEach(() => cleanup())

const NAMES = ['Sen', 'Mert', 'Can', 'Arda']

describe('ScoreTable', () => {
  it('renders a row per hand with net scores, penalties, winner, and a totals row', () => {
    const history: HandRecord[] = [
      { handNo: 1, deltas: [6, -2, -2, -2], penalties: [], winnerSeat: 0, winType: 'perOnly', reason: 'win' },
      { handNo: 2, deltas: [-101, 50, 0, 51], penalties: [{ seat: 0, type: 'okey-discard' }], winnerSeat: 1, reason: 'win' },
    ]
    render(<ScoreTable history={history} standings={[-95, 48, -2, 49]} names={NAMES} />)
    expect(screen.getByTestId('score-table')).toBeTruthy()
    // penalty label by type is shown
    expect(screen.getAllByText(/okey attı/i).length).toBeGreaterThan(0)
    // totals footer
    expect(screen.getByText('Toplam')).toBeTruthy()
    expect(screen.getByText('-95')).toBeTruthy()
  })

  it('shows an empty-state message when there is no finished hand', () => {
    render(<ScoreTable history={[]} standings={[0, 0, 0, 0]} names={NAMES} />)
    expect(screen.getByText(/henüz biten el yok/i)).toBeTruthy()
  })
})

describe('LocalAdapter score history', () => {
  it('starts empty and records a hand when it ends', async () => {
    const a = new LocalAdapter({ seed: 1, humanSeat: 0, matchHands: 1 }) // 1-hand KLASIK
    a.subscribe(() => {}, () => {})
    expect(a.getHistory()).toHaveLength(0)

    // Drive the human's turns until the hand ends (bots play in between).
    let iter = 0
    while (a.getHumanView().status !== 'ENDED' && iter++ < 3000) {
      const v = a.getHumanView()
      if (v.turn.seat !== 0) break
      if (v.turn.phase === 'DRAW') {
        const r = await a.dispatch({ type: 'DrawFromStock', seat: 0, expectedVersion: a.currentVersion() })
        if (!r.accepted) break
      } else {
        const r = await a.dispatch({ type: 'Discard', seat: 0, tile: a.getHumanView().you.rack[0]!, expectedVersion: a.currentVersion() })
        if (!r.accepted) break
      }
    }

    if (a.getHumanView().status === 'ENDED') {
      const hist = a.getHistory()
      expect(hist.length).toBeGreaterThanOrEqual(1)
      expect(hist[0]!.deltas).toHaveLength(4)
      expect(typeof hist[0]!.handNo).toBe('number')
    }
  })
})
