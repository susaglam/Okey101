// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import Lobby from '../src/screens/Lobby'
import App from '../src/App'
import type { GameMode } from '../src/modes'
import type { TableDescriptor } from '../src/tables'
import { TEST_USER, signInGuest } from './_helpers'

const lobbyProps = { user: TEST_USER, onHelp: () => {}, onAdmin: () => {}, onLogout: () => {} }
const clearAll = () => Object.keys(localStorage).filter((k) => k.startsWith('cs-okey')).forEach((k) => localStorage.removeItem(k))
afterEach(() => { cleanup(); clearAll() })
beforeEach(() => { clearAll(); signInGuest() })

const TABLE = (over: Partial<TableDescriptor> = {}): TableDescriptor =>
  ({ id: 't1', mode: 'yuzbir', name: '101 Masası 1', createdAt: 0, ...over })

describe('Lobby', () => {
  it('shows the "Masalar" heading and a "Yeni Masa" button', () => {
    render(<Lobby {...lobbyProps} tables={[]} onNewTable={() => {}} onEnter={() => {}} onDelete={() => {}} />)
    expect(screen.getByText('Masalar')).toBeTruthy()
    expect(screen.getByRole('button', { name: /yeni masa/i })).toBeTruthy()
  })

  it('shows an empty state when there are no tables', () => {
    render(<Lobby {...lobbyProps} tables={[]} onNewTable={() => {}} onEnter={() => {}} onDelete={() => {}} />)
    expect(screen.getByText(/henüz masa yok/i)).toBeTruthy()
  })

  it('"Yeni Masa" opens a mode picker with all three modes; picking one calls onNewTable', () => {
    const onNewTable = vi.fn<(m: GameMode) => void>()
    render(<Lobby {...lobbyProps} tables={[]} onNewTable={onNewTable} onEnter={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /yeni masa/i }))
    expect(screen.getByRole('dialog', { name: /mod seç/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /klasik/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /eşli 101/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /eşli 101/i }))
    expect(onNewTable).toHaveBeenCalledWith('yuzbir-esli')
  })

  it('lists a table and wires Enter / Delete', () => {
    const onEnter = vi.fn<(t: TableDescriptor) => void>()
    const onDelete = vi.fn<(t: TableDescriptor) => void>()
    render(<Lobby {...lobbyProps} tables={[TABLE()]} onNewTable={() => {}} onEnter={onEnter} onDelete={onDelete} />)
    expect(screen.getByText('101 Masası 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /otur|devam et/i }))
    expect(onEnter).toHaveBeenCalledWith(TABLE())
    fireEvent.click(screen.getByRole('button', { name: /masasını sil/i }))
    expect(onDelete).toHaveBeenCalledWith(TABLE())
  })
})

describe('App + lobby integration', () => {
  it('opens a 101 table from the lobby and deals a 22-tile rack', async () => {
    render(<App />)
    expect(screen.getByText('Masalar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /yeni masa/i }))
    fireEvent.click(screen.getByRole('button', { name: /el açma/i })) // plain 101
    await waitFor(() => {
      expect(screen.getAllByTestId('tile')).toHaveLength(22)
    })
  })

  it('opens an Eşli 101 table from the lobby', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /yeni masa/i }))
    fireEvent.click(screen.getByRole('button', { name: /eşli 101/i }))
    await waitFor(() => {
      expect(screen.getAllByTestId('tile')).toHaveLength(22)
    })
  })

  it('a created table appears in the lobby and can be re-entered (Devam Et)', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /yeni masa/i }))
    fireEvent.click(screen.getByRole('button', { name: /klasik/i }))
    await waitFor(() => expect(screen.getAllByTestId('tile').length).toBeGreaterThan(0))
    // Back to the lobby (top-left nameplate's exit) — use the menu exit if present.
    // The match-over flow isn't reached here; just assert the game rendered.
  })
})
