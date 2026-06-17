// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Rack } from '../src/components/Rack'
import { tileFromString } from '@cs-okey/engine'

describe('Rack', () => {
  it('renders all tiles and fires onSelect with the clicked index', () => {
    const tiles = ['1R','2R','3R','4K'].map(tileFromString)
    const onSelect = vi.fn()
    render(<Rack tiles={tiles} selectedIndex={null} onSelect={onSelect} />)
    expect(screen.getAllByTestId('tile')).toHaveLength(4)
    fireEvent.click(screen.getAllByTestId('tile')[2]!)
    expect(onSelect).toHaveBeenCalledWith(2)
  })
})
