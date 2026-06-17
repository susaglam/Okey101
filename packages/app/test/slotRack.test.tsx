// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SlotRack } from '../src/components/SlotRack'
import { tileFromString } from '@cs-okey/engine'
import type { SlotLayout } from '../src/rack/slots'

afterEach(cleanup)

describe('SlotRack', () => {
  // Build a layout: 6 tiles in slots 0-2 and 4-6, slot 3 is a gap (null)
  // layout length = 8 (2 rows × 4 cols)
  function makeLayout(): SlotLayout {
    const layout: SlotLayout = new Array(8).fill(null)
    layout[0] = tileFromString('1R')
    layout[1] = tileFromString('2R')
    layout[2] = tileFromString('3R')
    // slot 3 = null (gap)
    layout[4] = tileFromString('5K')
    layout[5] = tileFromString('6K')
    layout[6] = tileFromString('7K')
    // slot 7 = null
    return layout
  }

  it('renders all non-null tiles', () => {
    const layout = makeLayout()
    render(
      <SlotRack
        layout={layout}
        selectedSlot={null}
        onSelectSlot={vi.fn()}
        onMove={vi.fn()}
      />,
    )
    // 6 non-null tiles
    expect(screen.getAllByTestId('tile')).toHaveLength(6)
  })

  it('renders at least one empty slot gap', () => {
    const layout = makeLayout()
    render(
      <SlotRack
        layout={layout}
        selectedSlot={null}
        onSelectSlot={vi.fn()}
        onMove={vi.fn()}
      />,
    )
    const empties = screen.getAllByTestId('slot-empty')
    expect(empties.length).toBeGreaterThanOrEqual(1)
  })

  it('has the slot-rack container testid', () => {
    const layout = makeLayout()
    render(
      <SlotRack
        layout={layout}
        selectedSlot={null}
        onSelectSlot={vi.fn()}
        onMove={vi.fn()}
      />,
    )
    expect(screen.getByTestId('slot-rack')).toBeInTheDocument()
  })

  it('calls onSelectSlot with the correct slot index when a tile is clicked', () => {
    const layout = makeLayout()
    const onSelectSlot = vi.fn()
    render(
      <SlotRack
        layout={layout}
        selectedSlot={null}
        onSelectSlot={onSelectSlot}
        onMove={vi.fn()}
      />,
    )
    // Tiles are at slots 0,1,2,4,5,6 — click the first tile (slot 0)
    const tiles = screen.getAllByTestId('tile')
    fireEvent.click(tiles[0]!)
    expect(onSelectSlot).toHaveBeenCalledWith(0)
  })

  it('calls onSelectSlot with a later slot index when a tile in row 2 is clicked', () => {
    const layout = makeLayout()
    const onSelectSlot = vi.fn()
    render(
      <SlotRack
        layout={layout}
        selectedSlot={null}
        onSelectSlot={onSelectSlot}
        onMove={vi.fn()}
      />,
    )
    // Tiles rendered in slot order: slot0,slot1,slot2,slot4,slot5,slot6 => tiles[3] = slot 4
    const tiles = screen.getAllByTestId('tile')
    fireEvent.click(tiles[3]!) // slot index 4
    expect(onSelectSlot).toHaveBeenCalledWith(4)
  })

  it('shows the selected tile with sel class when selectedSlot matches', () => {
    const layout = makeLayout()
    render(
      <SlotRack
        layout={layout}
        selectedSlot={1}
        onSelectSlot={vi.fn()}
        onMove={vi.fn()}
      />,
    )
    const tiles = screen.getAllByTestId('tile')
    // slot 1 is the second tile (index 1 in render order)
    expect(tiles[1]).toHaveClass('sel')
    // others should not have sel
    expect(tiles[0]).not.toHaveClass('sel')
  })
})
