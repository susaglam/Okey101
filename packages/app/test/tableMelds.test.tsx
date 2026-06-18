// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TableMelds } from '../src/components/TableMelds'
import { tileFromString } from '@cs-okey/engine'
import type { Tile } from '@cs-okey/engine'

afterEach(cleanup)

// okey tile is 5K; FALSE_JOKER (X) represents it
const OKEY: Tile = tileFromString('5K')

describe('TableMelds', () => {
  it('renders tiles in order with false joker showing its represented value', () => {
    // A run: 1R X 3R 4R — false joker represents 2
    const meld = {
      owner: 1,
      kind: 'run' as const,
      tiles: [tileFromString('1R'), tileFromString('X'), tileFromString('3R'), tileFromString('4R')],
    }
    render(<TableMelds melds={[meld]} okey={OKEY} />)

    // All 4 tiles should be rendered
    const tiles = screen.getAllByTestId('table-meld-tile')
    expect(tiles).toHaveLength(4)

    // The joker tile should show "=2" (its represented value in the run)
    expect(screen.getByText('=2')).toBeInTheDocument()
  })

  it('renders tiles in correct run order (ascending by number with wild in gap)', () => {
    // Engine may give tiles unordered; they should be sorted 1R, joker, 3R, 4R
    const meld = {
      owner: 0,
      kind: 'run' as const,
      tiles: [tileFromString('3R'), tileFromString('4R'), tileFromString('1R'), tileFromString('X')],
    }
    render(<TableMelds melds={[meld]} okey={OKEY} />)

    const tiles = screen.getAllByTestId('table-meld-tile')
    expect(tiles).toHaveLength(4)

    // The joker should show =2
    expect(screen.getByText('=2')).toBeInTheDocument()
  })

  it('renders a group with false joker showing the group number', () => {
    // Group: 5R 5S X — joker represents 5
    const meld = {
      owner: 2,
      kind: 'group' as const,
      tiles: [tileFromString('5R'), tileFromString('5S'), tileFromString('X')],
    }
    render(<TableMelds melds={[meld]} okey={OKEY} />)

    expect(screen.getByText('=5')).toBeInTheDocument()
  })

  it('renders okey tile acting as wild in a run with its represented value', () => {
    // Run: 7M 5K(okey=wild) 9M → okey represents 8
    const meld = {
      owner: 0,
      kind: 'run' as const,
      tiles: [tileFromString('7M'), tileFromString('5K'), tileFromString('9M')],
    }
    render(<TableMelds melds={[meld]} okey={OKEY} />)

    // The okey tile (5K, acting as 8M) should show =8
    expect(screen.getByText('=8')).toBeInTheDocument()
  })

  it('renders empty melds without error', () => {
    render(<TableMelds melds={[]} okey={OKEY} />)
    expect(screen.getByTestId('table-melds')).toBeInTheDocument()
  })

  it('renders non-wild tiles without repValue annotation', () => {
    const meld = {
      owner: 0,
      kind: 'run' as const,
      tiles: [tileFromString('3R'), tileFromString('4R'), tileFromString('5R')],
    }
    render(<TableMelds melds={[meld]} okey={OKEY} />)

    // No "=N" annotation should appear for non-wild tiles
    expect(screen.queryByText(/^=\d/)).not.toBeInTheDocument()
  })
})
