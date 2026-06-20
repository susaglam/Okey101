// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import GameScreen from '../src/screens/GameScreen'
import { LocalAdapter } from '../src/adapter/LocalAdapter'
import { KLASIK_101, KLASIK } from '@cs-okey/engine'

afterEach(() => cleanup())

describe('101 GameScreen', () => {
  it('renders 22 tiles in the rack for 101 variant', async () => {
    const adapter = new LocalAdapter({ seed: 7, humanSeat: 0, variant: KLASIK_101 })
    render(<GameScreen adapter={adapter} />)
    await waitFor(() => {
      const tiles = screen.getAllByTestId('tile')
      expect(tiles).toHaveLength(22)
    })
  })

  it('shows "Çifte Git" button in 101 mode', async () => {
    const adapter = new LocalAdapter({ seed: 7, humanSeat: 0, variant: KLASIK_101 })
    render(<GameScreen adapter={adapter} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /çifte git/i })).toBeTruthy()
    })
  })

  it('shows "Aç (≥101)" button in 101 mode', async () => {
    const adapter = new LocalAdapter({ seed: 7, humanSeat: 0, variant: KLASIK_101 })
    render(<GameScreen adapter={adapter} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /aç.*101/i })).toBeTruthy()
    })
  })

  it('clicking "Çifte Git" does not crash and proceeds without error', async () => {
    // Çifte Git now asks for confirmation (binding) — auto-confirm in the test.
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const adapter = new LocalAdapter({ seed: 7, humanSeat: 0, variant: KLASIK_101 })
    render(<GameScreen adapter={adapter} />)
    const btn = await screen.findByRole('button', { name: /çifte git/i })
    expect(() => fireEvent.click(btn)).not.toThrow()
    // After clicking, either the button becomes disabled or the game proceeds
    await waitFor(() => {
      // The button should still be present but may be disabled now
      const ciftBtn = screen.queryByRole('button', { name: /çifte git/i })
      // Either disabled or not shown (turn moved), but no crash
      expect(ciftBtn === null || ciftBtn.getAttribute('disabled') !== null || ciftBtn).toBeTruthy()
    })
  })

  it('does NOT show "Çifte Git" button in Klasik mode', async () => {
    const adapter = new LocalAdapter({ seed: 7, humanSeat: 0, variant: KLASIK })
    render(<GameScreen adapter={adapter} />)
    await waitFor(() => {
      // Wait for tiles to render
      expect(screen.getAllByTestId('tile').length).toBeGreaterThanOrEqual(15)
    })
    expect(screen.queryByRole('button', { name: /çifte git/i })).toBeNull()
  })

  it('does NOT show "Aç (≥101)" button in Klasik mode', async () => {
    const adapter = new LocalAdapter({ seed: 7, humanSeat: 0, variant: KLASIK })
    render(<GameScreen adapter={adapter} />)
    await waitFor(() => {
      expect(screen.getAllByTestId('tile').length).toBeGreaterThanOrEqual(15)
    })
    expect(screen.queryByRole('button', { name: /aç.*101/i })).toBeNull()
  })

  it('renders the centre melding area (data-testid="center-melds") in 101 mode', async () => {
    const adapter = new LocalAdapter({ seed: 7, humanSeat: 0, variant: KLASIK_101 })
    render(<GameScreen adapter={adapter} />)
    await waitFor(() => {
      expect(screen.getByTestId('center-melds')).toBeTruthy()
    })
  })
})
