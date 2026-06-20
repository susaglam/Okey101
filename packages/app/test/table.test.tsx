// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Table } from '../src/components/Table'
import { LocalAdapter } from '../src/adapter/LocalAdapter'
import type { PlayerView, Tile } from '@cs-okey/engine'
import { KLASIK } from '@cs-okey/engine'

afterEach(cleanup)

const redTile: Tile = { color: 'RED', number: 5, kind: 'NUMBER' }

// Build a minimal PlayerView to test takeable pile behavior
function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  const base: PlayerView = {
    seat: 0,
    config: KLASIK,
    handNo: 1,
    you: {
      seat: 0,
      rack: [],
      discard: [],
      hasOpened: false,
      isOut: false,
    },
    opponents: [
      { seat: 1, rackCount: 14, discardTop: undefined, discardCount: 0, hasOpened: false },
      { seat: 2, rackCount: 14, discardTop: undefined, discardCount: 0, hasOpened: false },
      { seat: 3, rackCount: 14, discardTop: redTile, discardCount: 1, hasOpened: false },
    ],
    stockCount: 44,
    indicator: redTile,
    okey: { color: 'RED', number: 6, kind: 'NUMBER' },
    turn: { seat: 0, phase: 'DRAW' },
    scores: [0, 0, 0, 0],
    status: 'PLAYING',
    tableMelds: [],
    rizikoActive: false,
    version: 1,
  }
  return { ...base, ...overrides }
}

describe('Table', () => {
  it('renders 3 opponent seats and the stock count', () => {
    const a = new LocalAdapter({ seed: 5, humanSeat: 0 })
    const view = a.getHumanView()
    render(<Table view={view}><div data-testid="bottom">rack</div></Table>)
    expect(screen.getAllByTestId('seat')).toHaveLength(3)
    expect(screen.getByTestId('stock-count').textContent).toContain(String(view.stockCount))
    // The gösterge moved out of Table — it now renders next to the human nameplate
    // (in GameScreen), so it is no longer part of the bare Table.
    expect(screen.queryByTestId('gosterge')).toBeNull()
    expect(screen.getByTestId('bottom')).toBeInTheDocument()
  })

  it('renders children at the bottom', () => {
    const a = new LocalAdapter({ seed: 5, humanSeat: 0 })
    const view = a.getHumanView()
    render(<Table view={view}><div data-testid="my-rack">rack</div></Table>)
    expect(screen.getByTestId('my-rack')).toBeInTheDocument()
  })

  it('renders a discard pile for each opponent + human pile', () => {
    const view = makeView()
    render(<Table view={view} />)
    // 3 opponents + 1 human discard = 4 discard piles total
    const piles = screen.getAllByTestId('discard-pile')
    expect(piles.length).toBeGreaterThanOrEqual(3)
  })

  it('marks the left (seat-3) discard pile as takeable on human DRAW turn when non-empty', () => {
    const view = makeView({
      turn: { seat: 0, phase: 'DRAW' },
      opponents: [
        { seat: 1, rackCount: 14, discardTop: undefined, discardCount: 0, hasOpened: false },
        { seat: 2, rackCount: 14, discardTop: undefined, discardCount: 0, hasOpened: false },
        { seat: 3, rackCount: 14, discardTop: redTile, discardCount: 1, hasOpened: false },
      ],
    })
    render(<Table view={view} onTakeDiscard={() => {}} />)
    const piles = screen.getAllByTestId('discard-pile')
    const takeablePiles = piles.filter(el => el.getAttribute('data-takeable') === 'true')
    expect(takeablePiles).toHaveLength(1)
    expect(takeablePiles[0]).toHaveAttribute('data-takeable', 'true')
  })

  it('takeable pile calls onTakeDiscard when clicked', () => {
    const onTake = vi.fn()
    const view = makeView({
      turn: { seat: 0, phase: 'DRAW' },
      opponents: [
        { seat: 1, rackCount: 14, discardTop: undefined, discardCount: 0, hasOpened: false },
        { seat: 2, rackCount: 14, discardTop: undefined, discardCount: 0, hasOpened: false },
        { seat: 3, rackCount: 14, discardTop: redTile, discardCount: 1, hasOpened: false },
      ],
    })
    render(<Table view={view} onTakeDiscard={onTake} />)
    const takeablePile = screen.getAllByTestId('discard-pile').find(el => el.getAttribute('data-takeable') === 'true')
    expect(takeablePile).toBeTruthy()
    fireEvent.click(takeablePile!)
    expect(onTake).toHaveBeenCalledOnce()
  })

  it('does NOT mark any pile as takeable when it is not human DRAW turn', () => {
    const view = makeView({
      turn: { seat: 1, phase: 'DRAW' }, // seat 1's turn, not human
      opponents: [
        { seat: 1, rackCount: 14, discardTop: undefined, discardCount: 0, hasOpened: false },
        { seat: 2, rackCount: 14, discardTop: undefined, discardCount: 0, hasOpened: false },
        { seat: 3, rackCount: 14, discardTop: redTile, discardCount: 1, hasOpened: false },
      ],
    })
    render(<Table view={view} />)
    const piles = screen.getAllByTestId('discard-pile')
    const takeablePiles = piles.filter(el => el.getAttribute('data-takeable') === 'true')
    expect(takeablePiles).toHaveLength(0)
  })

  it('does NOT mark pile as takeable when left opponent discard is empty', () => {
    const view = makeView({
      turn: { seat: 0, phase: 'DRAW' },
      opponents: [
        { seat: 1, rackCount: 14, discardTop: undefined, discardCount: 0, hasOpened: false },
        { seat: 2, rackCount: 14, discardTop: undefined, discardCount: 0, hasOpened: false },
        { seat: 3, rackCount: 14, discardTop: undefined, discardCount: 0, hasOpened: false },
      ],
    })
    render(<Table view={view} />)
    const piles = screen.getAllByTestId('discard-pile')
    const takeablePiles = piles.filter(el => el.getAttribute('data-takeable') === 'true')
    expect(takeablePiles).toHaveLength(0)
  })
})
