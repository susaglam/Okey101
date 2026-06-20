// @vitest-environment jsdom
// A rack tile that can be laid off onto a meld already on the table is marked
// "işlek" with a red dot (data-testid="islek-dot").
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import GameScreen from '../src/screens/GameScreen'
import { KLASIK_101, tileFromString, type PlayerView } from '@cs-okey/engine'
import type { Adapter } from '../src/adapter/Adapter'

afterEach(() => cleanup())

function viewWithTableRun(): PlayerView {
  // Table has the run 4R-5R-6R (opened by seat 1). The human holds 7R (extends it
  // → işlek) plus some non-fitting tiles.
  return {
    seat: 0,
    config: KLASIK_101,
    handNo: 1,
    you: {
      seat: 0,
      rack: [tileFromString('7R'), tileFromString('1K'), tileFromString('9M')],
      discard: [],
      hasOpened: true,
      isOut: false,
      declaredCift: false,
    },
    opponents: [
      { seat: 1, rackCount: 14, discardCount: 0, hasOpened: true },
      { seat: 2, rackCount: 14, discardCount: 0, hasOpened: false },
      { seat: 3, rackCount: 14, discardCount: 0, hasOpened: false },
    ],
    stockCount: 40,
    indicator: tileFromString('6M'),
    okey: tileFromString('7M'),
    turn: { seat: 0, phase: 'DISCARD' },
    scores: [0, 0, 0, 0],
    status: 'PLAYING',
    tableMelds: [{ owner: 1, kind: 'run', tiles: [tileFromString('4R'), tileFromString('5R'), tileFromString('6R')] }],
    rizikoActive: false,
    version: 1,
  }
}

function staticAdapter(view: PlayerView): Adapter {
  return {
    subscribe(onView, onStatus) { onStatus('connected'); onView(view); return () => {} },
    dispatch: async () => ({ accepted: true }),
    currentVersion: () => view.version,
    getMatch: () => ({ handNo: 1, totalHands: 11, standings: [0, 0, 0, 0], over: false }),
    nextHand: () => {},
    getHistory: () => [],
    legalMoves: () => ['Discard', 'LayOff', 'OpenMeld'],
  } as unknown as Adapter
}

describe('işlek (layable) tile marker', () => {
  it('marks a rack tile that extends a table meld with the işlek dot', () => {
    render(<GameScreen adapter={staticAdapter(viewWithTableRun()) as Parameters<typeof GameScreen>[0]['adapter']} />)
    // 7R extends 4R-5R-6R → at least one işlek dot is shown.
    expect(screen.getAllByTestId('islek-dot').length).toBeGreaterThan(0)
  })

  it('shows NO işlek dot when the table has no melds', () => {
    const v = viewWithTableRun()
    v.tableMelds = []
    render(<GameScreen adapter={staticAdapter(v) as Parameters<typeof GameScreen>[0]['adapter']} />)
    expect(screen.queryByTestId('islek-dot')).toBeNull()
  })
})
