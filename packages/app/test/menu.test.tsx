// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import Menu from '../src/screens/Menu'

afterEach(() => cleanup())

describe('Menu variant select', () => {
  it('renders Klasik and 101 variant options', () => {
    const onStart = vi.fn()
    render(<Menu onStart={onStart} onHelp={() => {}} />)
    expect(screen.getByRole('button', { name: /klasik/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /101/i })).toBeTruthy()
  })

  it('default (no selection change) → clicking OYNA calls onStart with "klasik"', () => {
    const onStart = vi.fn<[variant: 'klasik' | 'yuzbir'], void>()
    render(<Menu onStart={onStart} onHelp={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^oyna/i }))
    expect(onStart).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledWith('klasik')
  })

  it('clicking "101" then OYNA calls onStart with "yuzbir"', () => {
    const onStart = vi.fn<[variant: 'klasik' | 'yuzbir'], void>()
    render(<Menu onStart={onStart} onHelp={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /101/i }))
    fireEvent.click(screen.getByRole('button', { name: /^oyna/i }))
    expect(onStart).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledWith('yuzbir')
  })

  it('clicking "Klasik" after "101" then OYNA calls onStart with "klasik"', () => {
    const onStart = vi.fn<[variant: 'klasik' | 'yuzbir'], void>()
    render(<Menu onStart={onStart} onHelp={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /101/i }))
    fireEvent.click(screen.getByRole('button', { name: /klasik/i }))
    fireEvent.click(screen.getByRole('button', { name: /^oyna/i }))
    expect(onStart).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledWith('klasik')
  })
})
