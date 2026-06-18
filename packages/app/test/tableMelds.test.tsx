// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TableMelds } from '../src/components/TableMelds'
import { tileFromString } from '@cs-okey/engine'
import type { Tile } from '@cs-okey/engine'

afterEach(cleanup)

// okey tile is 5K; FALSE_JOKER (X) represents 5K (black 5)
const OKEY: Tile = tileFromString('5K')
// okey tile is 8K; FALSE_JOKER (X) represents 8K (black 8)
const OKEY8K: Tile = tileFromString('8K')

describe('TableMelds', () => {
  it('renders false joker in a same-color run showing its fixed value (=8)', () => {
    // FALSE_JOKER is concrete 8K; run: 6K 7K X → X sits at position 8, shows =8
    const meld = {
      owner: 1,
      kind: 'run' as const,
      tiles: [tileFromString('6K'), tileFromString('7K'), tileFromString('X')],
    }
    render(<TableMelds melds={[meld]} okey={OKEY8K} />)

    // All 3 tiles should be rendered
    const tiles = screen.getAllByTestId('table-meld-tile')
    expect(tiles).toHaveLength(3)

    // The joker tile should show "=8" (its fixed okey.number value, not a gap-derived number)
    expect(screen.getByText('=8')).toBeInTheDocument()
  })

  it('renders false joker before reals in run when its fixed value is lowest (=8)', () => {
    // Run: 9K 10K X — X is concrete 8K; ordered as [X(=8), 9K, 10K]; joker shows =8
    const meld = {
      owner: 0,
      kind: 'run' as const,
      tiles: [tileFromString('9K'), tileFromString('10K'), tileFromString('X')],
    }
    render(<TableMelds melds={[meld]} okey={OKEY8K} />)

    const tiles = screen.getAllByTestId('table-meld-tile')
    expect(tiles).toHaveLength(3)

    // The joker should always show =8 (okey.number), regardless of run position
    expect(screen.getByText('=8')).toBeInTheDocument()
  })

  it('renders a group with false joker showing the group number (=5)', () => {
    // Group: 5R 5S X — X is concrete 5K (okey); represents 5
    const meld = {
      owner: 2,
      kind: 'group' as const,
      tiles: [tileFromString('5R'), tileFromString('5S'), tileFromString('X')],
    }
    render(<TableMelds melds={[meld]} okey={OKEY} />)

    expect(screen.getByText('=5')).toBeInTheDocument()
  })

  it('renders okey tile acting as gap-filling wild in a run with its represented value', () => {
    // Run: 7M 5K(real okey=gap-filling wild) 9M → okey fills gap at 8, shows =8
    const meld = {
      owner: 0,
      kind: 'run' as const,
      tiles: [tileFromString('7M'), tileFromString('5K'), tileFromString('9M')],
    }
    render(<TableMelds melds={[meld]} okey={OKEY} />)

    // The okey tile (5K, gap-filling wild acting as 8M) should show =8
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
