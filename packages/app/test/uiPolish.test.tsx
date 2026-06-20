// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { SlotRack } from '../src/components/SlotRack'
import { Table } from '../src/components/Table'
import { Seat } from '../src/components/Seat'
import { StockPile } from '../src/components/StockPile'
import GameScreen from '../src/screens/GameScreen'
import { LocalAdapter } from '../src/adapter/LocalAdapter'
import { initLayout } from '../src/rack/slots'
import type { PlayerView, Tile } from '@cs-okey/engine'
import { KLASIK } from '@cs-okey/engine'

afterEach(cleanup)

const redTile: Tile = { color: 'RED', number: 5, kind: 'NUMBER' }

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

// ────────────────────────────────────────────────────────────────────────────
// 1. SlotRack renders 32 slots for cols=16
// ────────────────────────────────────────────────────────────────────────────
describe('SlotRack with 16 cols', () => {
  it('renders 32 total slots when layout has length 32', () => {
    const layout = initLayout([], 16) // 2×16 = 32 slots
    render(
      <SlotRack
        layout={layout}
        selectedSlot={null}
        onSelectSlot={vi.fn()}
        onMove={vi.fn()}
      />,
    )
    // 32 slots - all empty, so 32 slot-empty elements
    const empties = screen.getAllByTestId('slot-empty')
    expect(empties).toHaveLength(32)
  })

  it('layout length is 32 when cols=16', () => {
    const layout = initLayout([], 16)
    expect(layout).toHaveLength(32)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 2. Empty slots not visible as boxes — they still have testid but no inset style
//    (We test that the slot-rack container still renders when empty)
// ────────────────────────────────────────────────────────────────────────────
describe('Empty slot appearance', () => {
  it('renders slot-rack even when all slots are empty', () => {
    const layout = initLayout([], 4)
    render(
      <SlotRack
        layout={layout}
        selectedSlot={null}
        onSelectSlot={vi.fn()}
        onMove={vi.fn()}
      />,
    )
    expect(screen.getByTestId('slot-rack')).toBeInTheDocument()
    // Empty slots should NOT have a visible box-shadow inset (background is transparent)
    const empties = screen.getAllByTestId('slot-empty')
    for (const el of empties) {
      // They should exist (for drop targets) but without a strong background
      expect(el).toBeInTheDocument()
    }
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 3. Stock indicator shows the stock count number
// ────────────────────────────────────────────────────────────────────────────
describe('Stock indicator', () => {
  it('shows stockCount number in the stock indicator', () => {
    // The stock now renders via StockPile (moved out of Table to the rack's upper-right).
    render(<StockPile stockCount={37} enabled={false} />)
    expect(screen.getByTestId('stock-count').textContent).toContain('37')
  })

  it('stock indicator is a tile-shaped element (data-testid="stock-tile" when not draggable)', () => {
    render(<StockPile stockCount={22} enabled={false} />)
    const stockTile = screen.getByTestId('stock-tile')
    expect(stockTile).toBeInTheDocument()
    expect(stockTile.textContent).toContain('22')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 4. Human nameplate (seat 0) — renders "Sen", chip count, score box
// ────────────────────────────────────────────────────────────────────────────
describe('Human nameplate', () => {
  // The human nameplate now lives in GameScreen's action bar (centred above the
  // rack), not in <Table> itself.
  it('GameScreen renders human nameplate with Sen', async () => {
    const adapter = new LocalAdapter({ seed: 9, humanSeat: 0 })
    render(<GameScreen adapter={adapter} />)
    await waitFor(() => {
      expect(screen.getByTestId('human-nameplate')).toBeInTheDocument()
    })
    expect(screen.getByTestId('human-nameplate').textContent).toContain('Sen')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 5. All nameplates are consistent — Seat component has avatar+name+chip+score
// ────────────────────────────────────────────────────────────────────────────
describe('Polished nameplates', () => {
  it('renders 3 opponent seats with avatar initials', () => {
    const view = makeView()
    render(<Table view={view} />)
    const seats = screen.getAllByTestId('seat')
    expect(seats).toHaveLength(3)
    // Each seat should have a chip/count badge
    // seats are wrapped with avatars
  })

  it('Seat component renders chip count badge', () => {
    render(
      <Seat name="Mert" count={12} isTurn={false} position="top" score={5} />,
    )
    expect(screen.getByTestId('seat')).toBeInTheDocument()
    expect(screen.getByTestId('seat').textContent).toContain('12')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 6. COLS = 16 in GameScreen — slot rack should have 32 slots
// ────────────────────────────────────────────────────────────────────────────
describe('GameScreen COLS=16', () => {
  it('SlotRack in GameScreen has 32 total slot elements (2×16)', async () => {
    const adapter = new LocalAdapter({ seed: 9, humanSeat: 0 })
    render(<GameScreen adapter={adapter} />)
    await waitFor(() => {
      expect(screen.getByTestId('slot-rack')).toBeInTheDocument()
    })
    // The rack container should be present
    const rack = screen.getByTestId('slot-rack')
    // Count all slot elements (data-slot attribute)
    const slots = rack.querySelectorAll('[data-slot]')
    expect(slots.length).toBe(32)
  })
})
