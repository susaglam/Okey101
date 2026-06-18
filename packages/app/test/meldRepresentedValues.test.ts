import { describe, it, expect } from 'vitest'
import { meldRepresentedValues, orderMeldForDisplay } from '../src/rack/slots'
import { tileFromString } from '@cs-okey/engine'

const OKEY = tileFromString('5K') // okey tile; FALSE_JOKER (X) represents it

describe('meldRepresentedValues', () => {
  it('run [1R, X(FALSE_JOKER), 3R, 4R] with okey=5K → reps [1,2,3,4]', () => {
    const meld = [tileFromString('1R'), tileFromString('X'), tileFromString('3R'), tileFromString('4R')]
    const ordered = orderMeldForDisplay(meld, OKEY)
    const reps = meldRepresentedValues(ordered, OKEY)
    expect(reps).toEqual([1, 2, 3, 4])
  })

  it('run with okey-tile as wild [7M, 5K(okey-tile), 9M] → [7,8,9]', () => {
    // 5K is the okey tile, acting as wild in a blue run 7-_-9
    const meld = [tileFromString('7M'), tileFromString('5K'), tileFromString('9M')]
    const ordered = orderMeldForDisplay(meld, OKEY)
    const reps = meldRepresentedValues(ordered, OKEY)
    expect(reps).toEqual([7, 8, 9])
  })

  it('group [5R, 5S, X(FALSE_JOKER)] → [5, 5, 5]', () => {
    const meld = [tileFromString('5R'), tileFromString('5S'), tileFromString('X')]
    const ordered = orderMeldForDisplay(meld, OKEY)
    const reps = meldRepresentedValues(ordered, OKEY)
    expect(reps).toEqual([5, 5, 5])
  })

  it('non-wild run returns own numbers', () => {
    const meld = [tileFromString('3R'), tileFromString('4R'), tileFromString('5R')]
    const ordered = orderMeldForDisplay(meld, OKEY)
    const reps = meldRepresentedValues(ordered, OKEY)
    expect(reps).toEqual([3, 4, 5])
  })

  it('non-wild group returns own numbers', () => {
    const meld = [tileFromString('7R'), tileFromString('7M'), tileFromString('7K')]
    const ordered = orderMeldForDisplay(meld, OKEY)
    const reps = meldRepresentedValues(ordered, OKEY)
    expect(reps).toEqual([7, 7, 7])
  })

  it('wild at end of run extends correctly', () => {
    // 7M 8M 9M X → ordered [7M, 8M, 9M, X] (wild extends run to 10)
    const meld = [tileFromString('7M'), tileFromString('8M'), tileFromString('9M'), tileFromString('X')]
    const ordered = orderMeldForDisplay(meld, OKEY)
    const reps = meldRepresentedValues(ordered, OKEY)
    expect(reps).toEqual([7, 8, 9, 10])
  })

  it('all-wild meld returns nulls', () => {
    const meld = [tileFromString('X'), tileFromString('5K')]
    // orderMeldForDisplay with all wilds returns as-is
    const reps = meldRepresentedValues(meld, OKEY)
    expect(reps).toEqual([null, null])
  })
})
