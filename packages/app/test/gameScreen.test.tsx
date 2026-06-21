// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import GameScreen from '../src/screens/GameScreen'
import { LocalAdapter } from '../src/adapter/LocalAdapter'

describe('GameScreen', () => {
  it('renders SlotRack (slot-rack testid) instead of old rack', async () => {
    const adapter = new LocalAdapter({ seed: 9, humanSeat: 0 })
    render(<GameScreen adapter={adapter} />)
    await waitFor(() => {
      const racks = screen.getAllByTestId('slot-rack')
      expect(racks.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('has at least 15 tiles in slot rack for Klasik starter', async () => {
    const adapter = new LocalAdapter({ seed: 9, humanSeat: 0 })
    render(<GameScreen adapter={adapter} />)
    await waitFor(() => {
      const tiles = screen.getAllByTestId('tile')
      expect(tiles.length).toBeGreaterThanOrEqual(15)
    })
  })

  it('does NOT render a "Taş At" button', async () => {
    const adapter = new LocalAdapter({ seed: 9, humanSeat: 0 })
    render(<GameScreen adapter={adapter} />)
    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /taş at/i })).toHaveLength(0)
    })
  })

  it('does NOT render an "Elimi Aç" / "Bitir" button', async () => {
    const adapter = new LocalAdapter({ seed: 9, humanSeat: 0 })
    render(<GameScreen adapter={adapter} />)
    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /elimi aç/i })).toHaveLength(0)
      expect(screen.queryAllByRole('button', { name: /bitir/i })).toHaveLength(0)
    })
  })

  it('renders a discard drop-zone (data-testid="discard-zone")', async () => {
    const adapter = new LocalAdapter({ seed: 9, humanSeat: 0 })
    render(<GameScreen adapter={adapter} />)
    await waitFor(() => {
      const zones = screen.getAllByTestId('discard-zone')
      expect(zones.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('still renders the arrange (Seri Diz) button during human turn', async () => {
    const adapter = new LocalAdapter({ seed: 9, humanSeat: 0 })
    render(<GameScreen adapter={adapter} />)
    // seed 9 starts the human in DISCARD phase — the arrange button (renamed
    // "Sırala" → "↺ Seri Diz") should be visible whenever it is the human's turn.
    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: /seri diz/i })
      expect(buttons.length).toBeGreaterThanOrEqual(1)
    })
  })
})
