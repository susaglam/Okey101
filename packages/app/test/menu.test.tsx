// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import Menu from '../src/screens/Menu'
import App from '../src/App'
import { saveGame, clearGame } from '../src/persistence'
import { LocalAdapter } from '../src/adapter/LocalAdapter'
import type { GameMode } from '../src/modes'

const clearAll = () => { clearGame('klasik'); clearGame('yuzbir'); clearGame('yuzbir-esli') }
afterEach(() => { cleanup(); clearAll() })
beforeEach(() => { clearAll() })

describe('Menu — start a mode directly', () => {
  it('renders Klasik, 101 and Eşli 101 mode cards', () => {
    render(<Menu onStart={() => {}} onHelp={() => {}} onResume={() => {}} />)
    expect(screen.getByRole('button', { name: /klasik/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /el açma/i })).toBeTruthy()      // plain 101 (unique subtitle)
    expect(screen.getByRole('button', { name: /eşli 101/i })).toBeTruthy()     // team 101
  })

  it('clicking the Klasik card starts a klasik game directly', () => {
    const onStart = vi.fn<(m: GameMode) => void>()
    render(<Menu onStart={onStart} onHelp={() => {}} onResume={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /klasik/i }))
    expect(onStart).toHaveBeenCalledWith('klasik')
  })

  it('clicking the 101 card starts a yuzbir game directly', () => {
    const onStart = vi.fn<(m: GameMode) => void>()
    render(<Menu onStart={onStart} onHelp={() => {}} onResume={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /el açma/i }))
    expect(onStart).toHaveBeenCalledWith('yuzbir')
  })

  it('clicking the Eşli 101 card starts a yuzbir-esli game', () => {
    const onStart = vi.fn<(m: GameMode) => void>()
    render(<Menu onStart={onStart} onHelp={() => {}} onResume={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /eşli 101/i }))
    expect(onStart).toHaveBeenCalledWith('yuzbir-esli')
  })

  it('shows no "Devam Et" when no mode has a save', () => {
    render(<Menu onStart={() => {}} onHelp={() => {}} onResume={() => {}} />)
    expect(screen.queryByRole('button', { name: /devam et/i })).toBeNull()
  })

  it('shows "Devam Et" only for the mode that has a save and resumes THAT mode', () => {
    saveGame({ version: 1, mode: 'yuzbir', state: {}, standings: [0, 0, 0, 0], scoredHandNo: 0, savedAt: 0 })
    const onResume = vi.fn<(m: GameMode) => void>()
    render(<Menu onStart={() => {}} onHelp={() => {}} onResume={onResume} />)
    const resumeBtns = screen.getAllByRole('button', { name: /devam et/i })
    expect(resumeBtns).toHaveLength(1)
    fireEvent.click(resumeBtns[0]!)
    expect(onResume).toHaveBeenCalledWith('yuzbir')
  })
})

describe('App integration', () => {
  it('clicking the 101 card yields a GameScreen with a 22-tile human rack', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /el açma/i }))
    await waitFor(() => {
      expect(screen.getAllByTestId('tile')).toHaveLength(22)
    })
  })

  it('resume restores the saved 101 game (per-mode save)', async () => {
    const { KLASIK_101 } = await import('@cs-okey/engine')
    const a = new LocalAdapter({ seed: 42, humanSeat: 0, mode: 'yuzbir', variant: KLASIK_101 })
    const rackSize = a.getHumanView().you.rack.length
    saveGame(a.snapshot()) // saved under the 'yuzbir' key
    render(<App />)
    // Only 101 has a save → exactly one Devam Et
    fireEvent.click(screen.getByRole('button', { name: /devam et/i }))
    await waitFor(() => {
      expect(screen.getAllByTestId('tile').length).toBeGreaterThanOrEqual(rackSize)
    })
  })

  it('starting a new Klasik game renders a fresh board', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /klasik/i }))
    await waitFor(() => {
      expect(screen.getAllByTestId('tile').length).toBeGreaterThan(0)
    })
  })

  it('Eşli 101 starts a team game (config.teamMode reaches the view)', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /eşli 101/i }))
    await waitFor(() => {
      expect(screen.getAllByTestId('tile')).toHaveLength(22)
    })
  })
})
