// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Scoreboard } from '../src/components/Scoreboard'

describe('Scoreboard', () => {
  it('renders all player names with their scores', () => {
    render(
      <Scoreboard
        standings={[6, -2, -2, -2]}
        names={['Sen', 'Ayşe', 'Mert', 'Can']}
        handNo={1}
        totalHands={5}
      />
    )
    // Names may be prefixed with a star symbol when leading, so use regex
    expect(screen.getByText(/Sen/)).toBeTruthy()
    expect(screen.getByText(/Ayşe/)).toBeTruthy()
    expect(screen.getByText(/Mert/)).toBeTruthy()
    expect(screen.getByText(/Can/)).toBeTruthy()
    expect(screen.getByText('6')).toBeTruthy()
    // -2 appears three times; just check at least one is rendered
    expect(screen.getAllByText('-2').length).toBeGreaterThanOrEqual(1)
  })

  it('renders hand number info containing "1" and "5"', () => {
    render(
      <Scoreboard
        standings={[6, -2, -2, -2]}
        names={['Sen', 'Ayşe', 'Mert', 'Can']}
        handNo={1}
        totalHands={5}
      />
    )
    // Should render something like "El 1/5" or "El 1" and "5"
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/El\s*1/)
    expect(text).toMatch(/5/)
  })
})
