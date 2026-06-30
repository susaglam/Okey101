import { describe, it, expect } from 'vitest'
import { canLayOff } from '../src/meld'
import { KLASIK, KLASIK_101 } from '../src/config'
import { tileFromString } from '../src/tile'
import type { Tile } from '../src/tile'

const h = (...s: string[]) => s.map(tileFromString)
// okey identity used across most cases (a black 5 — distinct from the run tiles),
// so a tile equal to it (5K) acts as the wild on the table.
const W = tileFromString('5K')

describe('canLayOff — a lay-off must NOT change the okey it stands for', () => {
  // The headline PO bug: okey in [10🟡,11🟡,okey] represents 12🟡. Laying 8🟡 would
  // reinterpret it as 9 → must be REJECTED.
  it('REJECTS laying a tile that would shift the okey (8 onto 10-11-okey)', () => {
    expect(canLayOff(h('10S', '11S'), [], W, KLASIK_101)).toBe(false) // (sanity: no tiles)
    expect(canLayOff([...h('10S', '11S'), W], h('8S'), W, KLASIK_101)).toBe(false)
  })

  it('ALLOWS extending the run at the TOP (13 onto 10-11-okey) — okey stays 12', () => {
    expect(canLayOff([...h('10S', '11S'), W], h('13S'), W, KLASIK_101)).toBe(true)
  })

  it('ALLOWS extending the run at the BOTTOM (9 onto 10-11-okey) — okey stays 12', () => {
    expect(canLayOff([...h('10S', '11S'), W], h('9S'), W, KLASIK_101)).toBe(true)
  })

  it('REJECTS a real tile that collides with the okey’s slot (real 12 onto 10-11-okey)', () => {
    // okey = 12🟡 here, so the okey identity is something else (1K) to avoid 12 being wild.
    const okey = tileFromString('1K')
    const meld = [...h('10S', '11S'), tileFromString('1K')] // 1K is the wild → represents 12S
    expect(canLayOff(meld, h('12S'), okey, KLASIK_101)).toBe(false)
  })

  it('GROUP: ALLOWS adding the 4th colour (okey NUMBER preserved)', () => {
    // [7R,7K,wild] (wild=7 of a missing colour) + 7M → 4-group, okey still 7.
    expect(canLayOff([...h('7R', '7K'), W], h('7M'), W, KLASIK_101)).toBe(true)
  })

  it('runs with no okey behave like a normal lay-off', () => {
    expect(canLayOff(h('4R', '5R', '6R'), h('7R'), W, KLASIK_101)).toBe(true)   // extends
    expect(canLayOff(h('4R', '5R', '6R'), h('8R'), W, KLASIK_101)).toBe(false)  // gap (not adjacent)
    expect(canLayOff(h('4R', '5R', '6R'), h('8M'), W, KLASIK_101)).toBe(false)  // wrong colour
  })

  it('never lays off onto a pair / short meld', () => {
    expect(canLayOff([tileFromString('13S'), W], h('13S'), W, KLASIK_101)).toBe(false) // pair target
  })

  it('LAYS the okey itself onto a valid run/group (PO 2026-06-30)', () => {
    expect(canLayOff(h('10S', '11S', '12S'), [W], W, KLASIK_101)).toBe(true) // okey extends the run as 13
    expect(canLayOff(h('5R', '6R', '7R'), [W], W, KLASIK_101)).toBe(true)    // okey extends as 8 (or 4)
    expect(canLayOff(h('7R', '7K', '7M'), [W], W, KLASIK_101)).toBe(true)    // okey completes the 4th colour 7
  })

  it('laying the okey keeps an EXISTING okey on the meld unchanged', () => {
    // [10S,11S,okey(=12)] + another okey → 10-11-12-13; the original okey stays 12.
    expect(canLayOff([...h('10S', '11S'), W], [W], W, KLASIK_101)).toBe(true)
  })

  it('MULTIPLE okeys: extending the end keeps both okey numbers; the wrong end shifts them', () => {
    const meld = [tileFromString('5S'), W, tileFromString('7S'), W] // okeys represent 6S, 8S
    expect(canLayOff(meld, h('9S'), W, KLASIK_101)).toBe(true)  // window 5-9 → okeys stay 6,8
    expect(canLayOff(meld, h('3S'), W, KLASIK_101)).toBe(false) // window 3-7 → okeys become 4,6
  })

  it('Klasik 13→1 wrap: okey in [13,1,okey] is 12; extend down to 11-12-13-1, reject an illegal 2', () => {
    const meld = [tileFromString('13S'), tileFromString('1S'), W] // wrap run 12-13-1, okey = 12S
    expect(canLayOff(meld, h('11S'), W, KLASIK)).toBe(true)  // 11-12-13-1, okey stays 12
    expect(canLayOff(meld, h('2S'), W, KLASIK)).toBe(false)  // 12-13-1-2 is an illegal wrap
  })
})
