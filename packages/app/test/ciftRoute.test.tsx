// @vitest-environment jsdom
// packages/app/test/ciftRoute.test.tsx
// UI tests for the ÇİFT route feature in GameScreen

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import GameScreen from '../src/screens/GameScreen'
import { KLASIK_101, tileFromString, type PlayerView, type GameEvent } from '@cs-okey/engine'
import type { Adapter } from '../src/adapter/Adapter'

afterEach(() => cleanup())

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
    getHistory: () => [],
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

/** PlayerView for a player who has NOT yet opened — has 5 pairs in rack (can çift-open). */
function makeNotOpenedCiftableView(): PlayerView {
  const okey = tileFromString('1S') // distinct okey not in the pairs
  const rack = [
    tileFromString('3R'), tileFromString('3R'),
    tileFromString('5K'), tileFromString('5K'),
    tileFromString('8M'), tileFromString('8M'),
    tileFromString('11S'), tileFromString('11S'),
    tileFromString('13R'), tileFromString('13R'),
    tileFromString('2K'), tileFromString('4M'), // filler
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
    indicator: tileFromString('13S'),
    okey,
    turn: { seat: 0, phase: 'DISCARD' },
    scores: [0, 0, 0, 0],
    status: 'PLAYING',
    tableMelds: [],
    rizikoActive: false,
    version: 1,
  }
}

/** PlayerView for a player who has NOT yet opened — no pairs in rack (cannot çift-open). */
function makeNotOpenedNoCiftView(): PlayerView {
  const okey = tileFromString('7M')
  const rack = [
    tileFromString('1R'), tileFromString('2K'), tileFromString('3M'), tileFromString('4S'),
    tileFromString('5R'), tileFromString('6K'), tileFromString('8M'), tileFromString('9S'),
    tileFromString('10R'), tileFromString('11K'), tileFromString('12M'), tileFromString('13S'),
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

/** PlayerView for a player who has opened via SERI route. */
function makeSeriOpenedView(): PlayerView {
  const okey = tileFromString('1S')
  const rack = [
    tileFromString('4R'), tileFromString('5R'), tileFromString('6R'), // layable run
    tileFromString('2K'), tileFromString('4M'),
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
      openRoute: 'seri',
    } as PlayerView['you'],
    opponents: [
      { seat: 1, rackCount: 21, discardCount: 0, hasOpened: false },
      { seat: 2, rackCount: 21, discardCount: 0, hasOpened: false },
      { seat: 3, rackCount: 21, discardCount: 0, hasOpened: false },
    ],
    stockCount: 60,
    indicator: tileFromString('13S'),
    okey,
    turn: { seat: 0, phase: 'DISCARD' },
    scores: [0, 0, 0, 0],
    status: 'PLAYING',
    tableMelds: [
      { owner: 0, kind: 'run', tiles: [tileFromString('11R'), tileFromString('12R'), tileFromString('13R')] },
    ],
    rizikoActive: false,
    version: 1,
  }
}

/** PlayerView for a player who has opened via ÇİFT route. */
function makeCiftOpenedView(): PlayerView {
  const okey = tileFromString('1S')
  const rack = [
    tileFromString('6R'), tileFromString('6R'), // layable pair
    tileFromString('2K'), tileFromString('4M'),
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
      openRoute: 'cift',
    } as PlayerView['you'],
    opponents: [
      { seat: 1, rackCount: 21, discardCount: 0, hasOpened: false },
      { seat: 2, rackCount: 21, discardCount: 0, hasOpened: false },
      { seat: 3, rackCount: 21, discardCount: 0, hasOpened: false },
    ],
    stockCount: 60,
    indicator: tileFromString('13S'),
    okey,
    turn: { seat: 0, phase: 'DISCARD' },
    scores: [0, 0, 0, 0],
    status: 'PLAYING',
    tableMelds: [
      { owner: 0, kind: 'pair', tiles: [tileFromString('3R'), tileFromString('3R')] },
      { owner: 0, kind: 'pair', tiles: [tileFromString('5K'), tileFromString('5K')] },
      { owner: 0, kind: 'pair', tiles: [tileFromString('8M'), tileFromString('8M')] },
      { owner: 0, kind: 'pair', tiles: [tileFromString('11S'), tileFromString('11S')] },
      { owner: 0, kind: 'pair', tiles: [tileFromString('13R'), tileFromString('13R')] },
    ] as PlayerView['tableMelds'],
    rizikoActive: false,
    version: 1,
  }
}

// ── Button visibility: not-yet-opened ────────────────────────────────────────

describe('ÇİFT route UI — not yet opened', () => {
  it('shows "Çift Aç" button when rack has 5 pairs (çift-openable)', async () => {
    const adapter = makeMockAdapter(makeNotOpenedCiftableView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /çift aç/i })).toBeTruthy()
    })
  })

  it('"Çift Aç" button is disabled when rack does NOT have 5 pairs', async () => {
    const adapter = makeMockAdapter(makeNotOpenedNoCiftView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      const btn = screen.queryByRole('button', { name: /çift aç/i })
      // Either hidden or disabled when no pairs available
      if (btn) {
        expect(btn).toHaveAttribute('disabled')
      }
    })
  })

  it('still shows "Aç (≥101)" button when not yet opened (regardless of çift availability)', async () => {
    const adapter = makeMockAdapter(makeNotOpenedCiftableView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /aç.*101/i })).toBeTruthy()
    })
  })
})

// ── Button visibility: seri-opened ───────────────────────────────────────────

describe('ÇİFT route UI — seri-opened player', () => {
  it('shows "Seri Aç" button after seri open', async () => {
    const adapter = makeMockAdapter(makeSeriOpenedView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /seri aç/i })).toBeTruthy()
    })
  })

  it('does NOT show "Çift Aç" button after seri open', async () => {
    const adapter = makeMockAdapter(makeSeriOpenedView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      // "Seri Aç" should appear (confirms render happened)
      expect(screen.getByRole('button', { name: /seri aç/i })).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: /çift aç/i })).toBeNull()
  })

  it('shows "İşle" button after seri open', async () => {
    const adapter = makeMockAdapter(makeSeriOpenedView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      // Turkish İ (U+0130) does not case-fold to ASCII i with regex /i flag
      const btns = screen.getAllByRole('button')
      const isleBtn = btns.find(b => /[İi]şle/u.test(b.textContent ?? ''))
      expect(isleBtn).toBeTruthy()
    })
  })

  it('shows lay-off drop targets on run/group melds after seri open', async () => {
    const adapter = makeMockAdapter(makeSeriOpenedView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      expect(screen.getAllByTestId('layoff-target').length).toBeGreaterThan(0)
    })
  })
})

// ── Button visibility: çift-opened ───────────────────────────────────────────

describe('ÇİFT route UI — çift-opened player', () => {
  it('shows "Çift Aç" button after çift open', async () => {
    const adapter = makeMockAdapter(makeCiftOpenedView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /çift aç/i })).toBeTruthy()
    })
  })

  it('does NOT show "Seri Aç" button after çift open', async () => {
    const adapter = makeMockAdapter(makeCiftOpenedView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      // "Çift Aç" should appear (confirms render happened)
      expect(screen.getByRole('button', { name: /çift aç/i })).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: /seri aç/i })).toBeNull()
  })

  it('shows "İşle" button after çift open', async () => {
    const adapter = makeMockAdapter(makeCiftOpenedView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      // Turkish İ (U+0130) does not case-fold to ASCII i with regex /i flag
      const btns = screen.getAllByRole('button')
      const isleBtn = btns.find(b => /[İi]şle/u.test(b.textContent ?? ''))
      expect(isleBtn).toBeTruthy()
    })
  })

  it('does NOT show "Aç (≥101)" button after çift open (already opened)', async () => {
    const adapter = makeMockAdapter(makeCiftOpenedView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /çift aç/i })).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: /aç.*101/i })).toBeNull()
  })

  it('does NOT show lay-off targets on pair melds (çift route)', async () => {
    const adapter = makeMockAdapter(makeCiftOpenedView())
    render(<GameScreen adapter={adapter as Parameters<typeof GameScreen>[0]['adapter']} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /çift aç/i })).toBeTruthy()
    })
    expect(screen.queryAllByTestId('layoff-target').length).toBe(0)
  })
})
