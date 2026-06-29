// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import App from '../src/App'
import { signInGuest } from './_helpers'

afterEach(() => cleanup())

describe('app smoke', () => {
  it('renders the lobby with a "Yeni Masa" action', () => {
    signInGuest()
    render(<App />)
    expect(screen.getByText('Masalar')).toBeTruthy()
    expect(screen.getByRole('button', { name: /yeni masa/i })).toBeTruthy()
  })

  it('the "Yeni Masa" picker offers all three modes', () => {
    signInGuest()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /yeni masa/i }))
    expect(screen.getByRole('button', { name: /klasik/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /el açma/i })).toBeTruthy()   // plain 101
    expect(screen.getByRole('button', { name: /eşli 101/i })).toBeTruthy()
  })
})
