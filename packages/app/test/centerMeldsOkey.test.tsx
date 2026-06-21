// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { tileFromString } from '@cs-okey/engine'
import type { Tile } from '@cs-okey/engine'
import { CenterMelds } from '../src/components/CenterMelds'

afterEach(cleanup)

const h = (...s: string[]) => s.map(tileFromString)
type Meld = { owner: number; kind: 'run' | 'group' | 'pair'; tiles: Tile[] }

function renderMelds(melds: Meld[], okey: Tile) {
  render(
    <DndContext>
      <CenterMelds melds={melds} okey={okey} seriOpenValue={0} pairOpenCount={0} />
    </DndContext>,
  )
}

describe('CenterMelds — okey laid on the table is blank + a "stands-in-for" badge', () => {
  const okey = tileFromString('7M') // blue 7

  it('a RUN okey shows face-down (data-okey) with the represented number badge', () => {
    // 9R (okey=10R) 11R — the okey fills the 10 slot.
    renderMelds([{ owner: 0, kind: 'run', tiles: h('9R', '7M', '11R') }], okey)
    const el = screen.getByLabelText('okey = 10')
    expect(el.getAttribute('data-okey')).toBe('true') // blank face-down tile
    expect(el.textContent).toBe('10')                  // badge = represented number
    // It does NOT show the okey's own face value (7).
    expect(el.textContent).not.toContain('7')
  })

  it('a GROUP okey shows the group number it stands in for', () => {
    // 5R 5K 5S + okey → okey is the missing BLUE 5.
    renderMelds([{ owner: 0, kind: 'group', tiles: h('5R', '5K', '5S', '7M') }], okey)
    const el = screen.getByLabelText('okey = 5')
    expect(el.getAttribute('data-okey')).toBe('true')
    expect(el.textContent).toBe('5')
  })
})
