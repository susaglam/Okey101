// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import Menu from '../src/screens/Menu'
import App from '../src/App'

afterEach(() => cleanup())

describe('Menu variant select', () => {
  it('renders Klasik and 101 variant options', () => {
    const onStart = vi.fn()
    render(<Menu onStart={onStart} onHelp={() => {}} />)
    expect(screen.getByRole('button', { name: /klasik/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /101/i })).toBeTruthy()
  })

  it('default (no selection change) → clicking OYNA calls onStart with "klasik"', () => {
    const onStart = vi.fn<(variant: 'klasik' | 'yuzbir') => void>()
    render(<Menu onStart={onStart} onHelp={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^oyna/i }))
    expect(onStart).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledWith('klasik')
  })

  it('clicking "101" then OYNA calls onStart with "yuzbir"', () => {
    const onStart = vi.fn<(variant: 'klasik' | 'yuzbir') => void>()
    render(<Menu onStart={onStart} onHelp={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /101/i }))
    fireEvent.click(screen.getByRole('button', { name: /^oyna/i }))
    expect(onStart).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledWith('yuzbir')
  })

  it('clicking "Klasik" after "101" then OYNA calls onStart with "klasik"', () => {
    const onStart = vi.fn<(variant: 'klasik' | 'yuzbir') => void>()
    render(<Menu onStart={onStart} onHelp={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /101/i }))
    fireEvent.click(screen.getByRole('button', { name: /klasik/i }))
    fireEvent.click(screen.getByRole('button', { name: /^oyna/i }))
    expect(onStart).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledWith('klasik')
  })
})

describe('App integration', () => {
  it('starting 101 yields a GameScreen whose human rack has 22 tiles', async () => {
    render(<App />)
    // Select 101 variant and start game
    fireEvent.click(screen.getByRole('button', { name: /101/i }))
    fireEvent.click(screen.getByRole('button', { name: /^oyna/i }))
    // Wait for GameScreen to render tiles
    await waitFor(() => {
      const tiles = screen.getAllByTestId('tile')
      expect(tiles).toHaveLength(22)
    })
  })
})
