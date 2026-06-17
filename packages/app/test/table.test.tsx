// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Table } from '../src/components/Table'
import { LocalAdapter } from '../src/adapter/LocalAdapter'

describe('Table', () => {
  it('renders 3 opponent seats, stock count, and the gösterge', () => {
    const a = new LocalAdapter({ seed: 5, humanSeat: 0 })
    const view = a.getHumanView()
    render(<Table view={view}><div data-testid="bottom">rack</div></Table>)
    expect(screen.getAllByTestId('seat')).toHaveLength(3)
    expect(screen.getByTestId('stock-count').textContent).toContain(String(view.stockCount))
    expect(screen.getByTestId('gosterge')).toBeInTheDocument()
    expect(screen.getByTestId('bottom')).toBeInTheDocument()
  })
})
