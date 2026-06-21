// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GameScreen from '../src/screens/GameScreen'
import { LocalAdapter } from '../src/adapter/LocalAdapter'

describe('arrange UI buttons', () => {
  it('İpucu selects a tile (gives it the sel class)', async () => {
    const adapter = new LocalAdapter({ seed: 9, humanSeat: 0 })
    render(<GameScreen adapter={adapter} />)

    // Wait for DISCARD phase tiles to be visible
    await waitFor(() => expect(screen.getAllByTestId('tile').length).toBeGreaterThanOrEqual(15))

    // Click İpucu (use first match in case of multiple matches)
    const hintBtns = screen.getAllByRole('button', { name: /İpucu/i })
    fireEvent.click(hintBtns[0]!)

    // Some tile should now have class "sel"
    await waitFor(() => {
      const tiles = screen.getAllByTestId('tile')
      const selected = tiles.filter(t => t.classList.contains('sel'))
      expect(selected.length).toBeGreaterThan(0)
    })
  })

  it('Seri Diz (arrange) reorders tiles (same multiset, possibly different sequence)', async () => {
    const adapter = new LocalAdapter({ seed: 9, humanSeat: 0 })
    render(<GameScreen adapter={adapter} />)

    // Wait for DISCARD phase tiles to be visible
    await waitFor(() => expect(screen.getAllByTestId('tile').length).toBeGreaterThanOrEqual(15))

    // Capture aria-labels before
    const before = screen.getAllByTestId('tile').map(t => t.getAttribute('aria-label'))

    // Click the arrange button (renamed "Sırala" → "↺ Seri Diz")
    const arrangeBtns = screen.getAllByRole('button', { name: /Seri Diz/i })
    fireEvent.click(arrangeBtns[0]!)

    // After arrange, tiles should be a permutation of the same multiset
    await waitFor(() => {
      const after = screen.getAllByTestId('tile').map(t => t.getAttribute('aria-label'))
      // Same length
      expect(after.length).toBe(before.length)
      // Same multiset
      const sortedBefore = [...before].sort()
      const sortedAfter = [...after].sort()
      expect(sortedAfter).toEqual(sortedBefore)
    })
  })
})
