// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TileView } from '../src/components/Tile'
import { tileFromString } from '@cs-okey/engine'

afterEach(cleanup)

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

  it('renders a colorblind glyph (▲) for a blue tile when colorblind=true', () => {
    render(<TileView tile={tileFromString('5M')} colorblind />)
    expect(screen.getByText('▲')).toBeInTheDocument()
  })

  it('renders no colorblind glyph when colorblind is omitted', () => {
    render(<TileView tile={tileFromString('5M')} />)
    expect(screen.queryByText('▲')).not.toBeInTheDocument()
  })

  it('renders =7 corner label on a false joker when repValue=7', () => {
    render(<TileView tile={tileFromString('X')} repValue={7} />)
    expect(screen.getByText('=7')).toBeInTheDocument()
  })

  it('renders no repValue label when repValue is omitted', () => {
    render(<TileView tile={tileFromString('X')} />)
    expect(screen.queryByText(/^=\d/)).not.toBeInTheDocument()
  })
})
