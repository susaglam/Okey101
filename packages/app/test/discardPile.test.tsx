// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DiscardPile } from '../src/components/DiscardPile'
import type { Tile } from '@cs-okey/engine'

afterEach(cleanup)

const redTile: Tile = { color: 'RED', number: 5, kind: 'NUMBER' }

describe('DiscardPile', () => {
  it('renders count badge', () => {
    render(<DiscardPile count={3} />)
    const pile = screen.getByTestId('discard-pile')
    expect(pile).toBeInTheDocument()
    expect(pile.textContent).toContain('3')
  })

  it('renders top tile when provided', () => {
    render(<DiscardPile topTile={redTile} count={2} />)
    expect(screen.getByTestId('discard-top-tile')).toBeInTheDocument()
  })

  it('renders empty marker when no top tile', () => {
    render(<DiscardPile count={0} />)
    const pile = screen.getByTestId('discard-pile')
    expect(pile).toBeInTheDocument()
    expect(screen.queryByTestId('discard-top-tile')).not.toBeInTheDocument()
  })

  it('does NOT have data-takeable when takeable is false', () => {
    render(<DiscardPile topTile={redTile} count={1} takeable={false} />)
    const pile = screen.getByTestId('discard-pile')
    expect(pile).not.toHaveAttribute('data-takeable', 'true')
  })

  it('adds data-takeable="true" when takeable is true', () => {
    render(<DiscardPile topTile={redTile} count={1} takeable={true} onTake={() => {}} />)
    const pile = screen.getByTestId('discard-pile')
    expect(pile).toHaveAttribute('data-takeable', 'true')
  })

  it('calls onTake when clicked in takeable state', () => {
    const onTake = vi.fn()
    render(<DiscardPile topTile={redTile} count={1} takeable={true} onTake={onTake} />)
    fireEvent.click(screen.getByTestId('discard-pile'))
    expect(onTake).toHaveBeenCalledOnce()
  })

  it('has role=button when takeable', () => {
    render(<DiscardPile topTile={redTile} count={1} takeable={true} onTake={() => {}} />)
    const pile = screen.getByTestId('discard-pile')
    expect(pile).toHaveAttribute('role', 'button')
  })

  it('does not have role=button when not takeable', () => {
    render(<DiscardPile topTile={redTile} count={1} takeable={false} />)
    const pile = screen.getByTestId('discard-pile')
    expect(pile).not.toHaveAttribute('role', 'button')
  })
})
