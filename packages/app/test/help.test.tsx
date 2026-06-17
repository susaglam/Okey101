// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import App from '../src/App'
import Menu from '../src/screens/Menu'
import Help from '../src/screens/Help'

afterEach(() => cleanup())

describe('Help screen', () => {
  it('renders help content and Geri button when mounted directly', () => {
    const onBack = vi.fn()
    render(<Help onBack={onBack} />)
    expect(screen.getAllByText(/gösterge/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /geri/i })).toBeTruthy()
  })

  it('calls onBack when Geri is clicked', () => {
    const onBack = vi.fn()
    render(<Help onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: /geri/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('Menu calls onHelp when "Nasıl Oynanır?" is clicked', () => {
    const onStart = vi.fn()
    const onHelp = vi.fn()
    render(<Menu onStart={onStart} onHelp={onHelp} />)
    fireEvent.click(screen.getByRole('button', { name: /nasıl oynanır/i }))
    expect(onHelp).toHaveBeenCalledOnce()
  })

  it('App shows help content after clicking "Nasıl Oynanır?" and returns to menu on Geri', () => {
    render(<App />)
    // Menu is visible
    expect(screen.getByRole('button', { name: /^oyna/i })).toBeTruthy()
    // Click Nasıl Oynanır?
    fireEvent.click(screen.getByRole('button', { name: /nasıl oynanır/i }))
    // Help screen content
    expect(screen.getAllByText(/gösterge/i).length).toBeGreaterThan(0)
    // Click Geri
    fireEvent.click(screen.getByRole('button', { name: /geri/i }))
    // Back to menu
    expect(screen.getByRole('button', { name: /^oyna/i })).toBeTruthy()
  })
})
