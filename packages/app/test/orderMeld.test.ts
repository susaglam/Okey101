import { describe, it, expect } from 'vitest'
import { orderMeldForDisplay } from '../src/rack/slots'
import { tileFromString, tileToString } from '@cs-okey/engine'

const h = (...s: string[]) => s.map(tileFromString)
const OKEY = tileFromString('5K') // okey is 5K; false jokers (X) represent it

describe('orderMeldForDisplay', () => {
  it('places a wild in its gap position within a run (7 _ 9 10)', () => {
    // engine returns reals first then wild: [7M,9M,10M,X]
    const out = orderMeldForDisplay(h('7M', '9M', '10M', 'X'), OKEY)
    expect(out.map(tileToString)).toEqual(['7M', 'X', '9M', '10M'])
  })

  it('places a wild gap for 1 _ 3 4 (yellow)', () => {
    const out = orderMeldForDisplay(h('1S', '2S', '4S', 'X'), OKEY)
    expect(out.map(tileToString)).toEqual(['1S', '2S', 'X', '4S'])
  })

  it('appends an extra wild to extend the run end', () => {
    const out = orderMeldForDisplay(h('7M', '8M', '9M', 'X'), OKEY)
    expect(out.map(tileToString)).toEqual(['7M', '8M', '9M', 'X'])
  })

  it('orders a group by colour (RED, YELLOW, BLUE, BLACK), wilds last', () => {
    const out = orderMeldForDisplay(h('9M', '9S', '9R', 'X'), OKEY)
    expect(out.map(tileToString)).toEqual(['9R', '9S', '9M', 'X'])
  })

  it('leaves a wild-free run ascending', () => {
    const out = orderMeldForDisplay(h('10R', '11R', '12R', '13R'), OKEY)
    expect(out.map(tileToString)).toEqual(['10R', '11R', '12R', '13R'])
  })

  it('handles an okey-tile used as a wild (5K) same as a false joker', () => {
    // a real okey tile (5K) acting as wild in a blue run 7-(8)-9
    const out = orderMeldForDisplay(h('7M', '9M', '5K'), OKEY)
    expect(out.map(tileToString)).toEqual(['7M', '5K', '9M'])
  })
})
