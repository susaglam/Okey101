// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../src/App'

describe('app smoke', () => {
  it('renders the menu with the variant cards', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /klasik/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /el açma/i })).toBeTruthy()   // plain 101 (unique subtitle)
    expect(screen.getByRole('button', { name: /eşli 101/i })).toBeTruthy()
  })
})
