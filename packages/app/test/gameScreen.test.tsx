// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GameScreen from '../src/screens/GameScreen'
import { LocalAdapter } from '../src/adapter/LocalAdapter'

describe('GameScreen', () => {
  it('lets the human discard a selected tile and bots respond', async () => {
    const adapter = new LocalAdapter({ seed: 9, humanSeat: 0 })
    render(<GameScreen adapter={adapter} />)
    // starter is in DISCARD phase with 15 tiles
    const tiles = screen.getAllByTestId('tile')
    expect(tiles.length).toBeGreaterThanOrEqual(15)
    fireEvent.click(tiles[0]!) // select first rack tile
    fireEvent.click(screen.getByRole('button', { name: /taş at/i }))
    // after dispatch, either it's the human's draw turn again or the hand ended
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /stoktan çek/i }) ||
        screen.queryByText(/bitti|berabere/i)
      ).toBeTruthy()
    })
  })
})
