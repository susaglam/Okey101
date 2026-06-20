import { describe, it, expect } from 'vitest'
import { tileFromString, openingValue, isValidMeldSet } from '@cs-okey/engine'
import { parseMeldSegments } from '../src/rack/slots'
import type { SlotLayout } from '../src/rack/slots'

const COLS = 16
const okey = tileFromString('5K') // okey is BLACK 5; real 5K tiles are wild, ♣(X) = fixed black 5
const h = (s: string) => tileFromString(s)

// Build a 2*COLS layout from a back-row and front-row list of tile codes (null = gap).
function layoutOf(back: (string | null)[], front: (string | null)[]): SlotLayout {
  const layout: SlotLayout = new Array<ReturnType<typeof h> | null>(2 * COLS).fill(null)
  for (let i = 0; i < back.length && i < COLS; i++) layout[i] = back[i] ? h(back[i]!) : null
  for (let i = 0; i < front.length && i < COLS; i++) layout[COLS + i] = front[i] ? h(front[i]!) : null
  return layout
}

describe('parseMeldSegments — player rack arrangement drives opening value', () => {
  it('splits contiguous tiles by gaps and by the row boundary', () => {
    const layout = layoutOf(
      ['4K', 'X', '6K', null, '7R', '7S', '7M'],
      ['9M', '10M', '5K'],
    )
    const segs = parseMeldSegments(layout)
    expect(segs.map((s) => s.length)).toEqual([3, 3, 3]) // [4K X 6K] [7R 7S 7M] [9M 10M 5K]
  })

  it("values the player's arrangement (okey used as blue-11) at 112 — the reported bug", () => {
    // Player arranged: [4K ♣ 6K]=15, [7R 7S 7M]=21, [10R 11R 12R 13R]=46, [9M 10M okey→11]=30
    const layout = layoutOf(
      ['4K', 'X', '6K', null, '7R', '7S', '7M', null, '10R', '11R', '12R', '13R'],
      ['9M', '10M', '5K'],
    )
    const segs = parseMeldSegments(layout)
    const valid = segs.filter((s) => s.length >= 3 && isValidMeldSet([s], okey, { runWrap13to1: false } as never))
    expect(valid.length).toBe(4)
    // openingValue must read the okey as blue-11 (its slot in the run), giving 30 for that meld
    expect(openingValue(valid, okey)).toBe(112)
  })

  it('excludes leftover singles/pairs that are not valid runs/groups from the seri total', () => {
    const layout = layoutOf(
      ['10R', '11R', '12R', '13R', null, '1S', '2S'], // a 4-run (46) + a loose 2-tile leftover
      [],
    )
    const segs = parseMeldSegments(layout)
    const valid = segs.filter((s) => s.length >= 3 && isValidMeldSet([s], okey, { runWrap13to1: false } as never))
    expect(valid.length).toBe(1)
    expect(openingValue(valid, okey)).toBe(46)
  })
})
