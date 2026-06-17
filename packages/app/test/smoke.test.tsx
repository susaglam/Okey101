// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../src/App'

describe('app smoke', () => {
  it('renders the menu with an Oyna button', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /^oyna/i })).toBeTruthy()
  })
})
