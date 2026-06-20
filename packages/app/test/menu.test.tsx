// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import Menu from '../src/screens/Menu'
import App from '../src/App'
import { saveGame, clearGame } from '../src/persistence'
import { LocalAdapter } from '../src/adapter/LocalAdapter'

afterEach(() => { cleanup(); clearGame('klasik'); clearGame('yuzbir') })
beforeEach(() => { clearGame('klasik'); clearGame('yuzbir') })

const noSaves = { hasKlasikSave: false, has101Save: false }

describe('Menu — start a variant directly', () => {
  it('renders Klasik and 101 variant cards', () => {
    render(<Menu onStart={() => {}} onHelp={() => {}} onResume={() => {}} {...noSaves} />)
    expect(screen.getByRole('button', { name: /klasik/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /101/i })).toBeTruthy()
  })

  it('clicking the Klasik card starts a klasik game directly (no OYNA step)', () => {
    const onStart = vi.fn<(v: 'klasik' | 'yuzbir') => void>()
    render(<Menu onStart={onStart} onHelp={() => {}} onResume={() => {}} {...noSaves} />)
    fireEvent.click(screen.getByRole('button', { name: /klasik/i }))
    expect(onStart).toHaveBeenCalledWith('klasik')
  })

  it('clicking the 101 card starts a yuzbir game directly', () => {
    const onStart = vi.fn<(v: 'klasik' | 'yuzbir') => void>()
    render(<Menu onStart={onStart} onHelp={() => {}} onResume={() => {}} {...noSaves} />)
    fireEvent.click(screen.getByRole('button', { name: /101/i }))
    expect(onStart).toHaveBeenCalledWith('yuzbir')
  })

  it('shows no "Devam Et" when neither variant has a save', () => {
    render(<Menu onStart={() => {}} onHelp={() => {}} onResume={() => {}} {...noSaves} />)
    expect(screen.queryByRole('button', { name: /devam et/i })).toBeNull()
  })

  it('shows "Devam Et" only for the variant that has a save and resumes THAT variant', () => {
    const onResume = vi.fn<(v: 'klasik' | 'yuzbir') => void>()
    render(<Menu onStart={() => {}} onHelp={() => {}} onResume={onResume} hasKlasikSave={false} has101Save />)
    const resumeBtns = screen.getAllByRole('button', { name: /devam et/i })
    expect(resumeBtns).toHaveLength(1)
    fireEvent.click(resumeBtns[0]!)
    expect(onResume).toHaveBeenCalledWith('yuzbir')
  })
})

describe('App integration', () => {
  it('clicking the 101 card yields a GameScreen with a 22-tile human rack', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /101/i }))
    await waitFor(() => {
      expect(screen.getAllByTestId('tile')).toHaveLength(22)
    })
  })

  it('resume restores the saved 101 game (per-variant save)', async () => {
    const { KLASIK_101 } = await import('@cs-okey/engine')
    const a = new LocalAdapter({ seed: 42, humanSeat: 0, variant: KLASIK_101 })
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
})
