// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TileView } from '../src/components/Tile'
import { tileFromString } from '@cs-okey/engine'

describe('TileView', () => {
  it('renders number and color label', () => {
    render(<TileView tile={tileFromString('7M')} />)
    expect(screen.getByLabelText('7M')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })
  it('renders ♣ for a false joker', () => {
    render(<TileView tile={tileFromString('X')} />)
    expect(screen.getByText('♣')).toBeInTheDocument()
  })
})
