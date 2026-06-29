// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import App from '../src/App'
import Lobby from '../src/screens/Lobby'
import Help from '../src/screens/Help'
import GameScreen from '../src/screens/GameScreen'
import { LocalAdapter } from '../src/adapter/LocalAdapter'
import { KLASIK_101 } from '@cs-okey/engine'
import { TEST_USER, signInGuest } from './_helpers'

afterEach(() => cleanup())

describe('In-game help modal', () => {
  it('opens a help modal with 101 rules from the in-game ? button', async () => {
    const adapter = new LocalAdapter({ seed: 3, humanSeat: 0, variant: KLASIK_101 })
    render(<GameScreen adapter={adapter} />)
    await waitFor(() => expect(screen.getByLabelText('Nasıl Oynanır?')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Nasıl Oynanır?'))
    expect(screen.getByTestId('help-modal')).toBeTruthy()
    // 101-specific content is present (e.g. "El Açma", "İşleme")
    expect(screen.getAllByText(/açma/i).length).toBeGreaterThan(0)
  })
})

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

  it('Lobby calls onHelp when "Nasıl Oynanır?" is clicked', () => {
    const onHelp = vi.fn()
    render(<Lobby user={TEST_USER} tables={[]} onNewTable={() => {}} onEnter={() => {}} onDelete={() => {}} onHelp={onHelp} onAdmin={() => {}} onLogout={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /nasıl oynanır/i }))
    expect(onHelp).toHaveBeenCalledOnce()
  })

  it('App shows help content after clicking "Nasıl Oynanır?" and returns to lobby on Geri', () => {
    signInGuest()
    render(<App />)
    expect(screen.getByText('Masalar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /nasıl oynanır/i }))
    expect(screen.getAllByText(/gösterge/i).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /geri/i }))
    expect(screen.getByText('Masalar')).toBeTruthy()
  })
})
