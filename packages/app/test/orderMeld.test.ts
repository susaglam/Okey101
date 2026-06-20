import { describe, it, expect } from 'vitest'
import { orderMeldForDisplay } from '../src/rack/slots'
import { tileFromString, tileToString } from '@cs-okey/engine'

const h = (...s: string[]) => s.map(tileFromString)
const OKEY = tileFromString('5K') // okey is 5K; false jokers (X) represent it
const OKEY8K = tileFromString('8K') // okey is 8K; false joker (X) represents 8K (BLACK 8)

describe('orderMeldForDisplay', () => {
  it('places a real-okey wild in its gap position within a run (7 _ 9 10)', () => {
    // engine returns reals first then wild: [7M,9M,10M,5K]; 5K is real okey → gap-filler
    const out = orderMeldForDisplay(h('7M', '9M', '10M', '5K'), OKEY)
    expect(out.map(tileToString)).toEqual(['7M', '5K', '9M', '10M'])
  })

  it('places a real-okey wild gap for 1 _ 3 4 (yellow)', () => {
    // 5K is the real okey tile → gap-filling wild; YELLOW run 1-2-_-4
    // Note: 5K is BLACK but it is wild and fills a gap in the YELLOW run
    const out = orderMeldForDisplay(h('1S', '2S', '4S', '5K'), OKEY)
    expect(out.map(tileToString)).toEqual(['1S', '2S', '5K', '4S'])
  })

  it('appends a real-okey wild to extend the run end', () => {
    // 5K is real okey → gap-filler; blue run 7-8-9-_ → extends to 10
    const out = orderMeldForDisplay(h('7M', '8M', '9M', '5K'), OKEY)
    expect(out.map(tileToString)).toEqual(['7M', '8M', '9M', '5K'])
  })

  it('orders a group by colour (RED, YELLOW, BLUE, BLACK), wilds last', () => {
    const out = orderMeldForDisplay(h('9M', '9S', '9R', 'X'), OKEY)
    expect(out.map(tileToString)).toEqual(['9R', '9S', '9M', 'X'])
  })

  it('leaves a wild-free run ascending', () => {
    const out = orderMeldForDisplay(h('10R', '11R', '12R', '13R'), OKEY)
    expect(out.map(tileToString)).toEqual(['10R', '11R', '12R', '13R'])
  })

  it('okey-tile as gap-filling wild fills a gap in a blue run 7-_-9', () => {
    // a real okey tile (5K) acting as gap-filling wild in a BLUE run 7-_-9
    // (the okey tile fills the gap for number 8 in the blue run)
    const out = orderMeldForDisplay(h('7M', '9M', '5K'), OKEY)
    expect(out.map(tileToString)).toEqual(['7M', '5K', '9M'])
  })

  // ── FALSE_JOKER: fixed concrete tile (not a gap-filler) ──────────────────────

  it('false joker (okey=8K) sits at its fixed position 8 in a black run 6-7-X', () => {
    // engine might return [6K, 7K, X]; false joker = concrete 8K → sits at position 8 (end)
    const out = orderMeldForDisplay(h('6K', '7K', 'X'), OKEY8K)
    expect(out.map(tileToString)).toEqual(['6K', '7K', 'X'])
  })

  it('false joker (okey=8K) sits at its fixed position 8 when engine puts it first [X, 6K, 7K]', () => {
    // input [X, 6K, 7K]; false joker is concrete 8K → sorted ascending: 6K,7K,X(=8K)
    const out = orderMeldForDisplay(h('X', '6K', '7K'), OKEY8K)
    expect(out.map(tileToString)).toEqual(['6K', '7K', 'X'])
  })

  it('false joker (okey=8K) sits at position 8 with gap-filling real-okey wild [6K, 8K, X]', () => {
    // 8K is the real okey → gap-filling wild; X is false joker → fixed at 8
    // meld: 6K (real), 8K (real-okey wild), X (false joker, concrete 8K)
    // reals (non-wild): 6K + X(=8K concrete) → black run 6,8; real-okey fills gap at 7
    // ordered: 6K, 8K(wild fills gap 7), X(=8 sits at its fixed position)
    // So the run covers 6-7-8: 6K real, 8K wild fills gap 7, X at 8
    const out = orderMeldForDisplay(h('6K', '8K', 'X'), OKEY8K)
    expect(out.map(tileToString)).toEqual(['6K', '8K', 'X'])
  })

  // ── 13→1 WRAP runs (Klasik) ──────────────────────────────────────────────────

  it('orders a 13→1 wrap run as 11,12,13,1 with the okey filling the 12 slot', () => {
    // okey is 5K (wild). Yellow wrap run 11-12-13-1 with 5K used as 12.
    // Engine/arrange may hand tiles in any order; display must read 11,12,13,1.
    const out = orderMeldForDisplay(h('1S', '5K', '11S', '13S'), OKEY)
    expect(out.map(tileToString)).toEqual(['11S', '5K', '13S', '1S'])
  })

  it('orders a wrap run 12,13,1 (no wild) correctly', () => {
    const out = orderMeldForDisplay(h('1S', '12S', '13S'), OKEY)
    expect(out.map(tileToString)).toEqual(['12S', '13S', '1S'])
  })

  it('false joker (okey=8K) in group sits at fixed slot (group of 8s)', () => {
    // group: [8R, 8M, X(=8K concrete)] → X is 8K, a normal group member
    // reals: 8R, 8M, X(=8K) — same number=8, distinct colors RED/BLUE/BLACK
    // order by color: RED=0, BLUE=2, BLACK=3 → 8R, 8M, X
    const out = orderMeldForDisplay(h('8R', '8M', 'X'), OKEY8K)
    expect(out.map(tileToString)).toEqual(['8R', '8M', 'X'])
  })
})
