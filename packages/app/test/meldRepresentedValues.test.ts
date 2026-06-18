import { describe, it, expect } from 'vitest'
import { meldRepresentedValues, orderMeldForDisplay } from '../src/rack/slots'
import { tileFromString } from '@cs-okey/engine'

const OKEY = tileFromString('5K')  // okey tile; FALSE_JOKER (X) represents 5K
const OKEY8K = tileFromString('8K') // okey tile for false-joker tests; FALSE_JOKER (X) represents 8K

describe('meldRepresentedValues', () => {
  // ── FALSE_JOKER = FIXED concrete tile (value always = okey.number) ────────────

  it('false joker in run [6K, 7K, X] with okey=8K → reps [6,7,8] (X always = 8)', () => {
    // FALSE_JOKER is concrete 8K: it must represent 8, never be re-assigned to a gap number
    const meld = [tileFromString('6K'), tileFromString('7K'), tileFromString('X')]
    const ordered = orderMeldForDisplay(meld, OKEY8K)
    const reps = meldRepresentedValues(ordered, OKEY8K)
    expect(reps).toEqual([6, 7, 8])
  })

  it('false joker in run [9K, 10K, X] with okey=8K → reps [8,9,10] (X at position 8 before reals)', () => {
    // FALSE_JOKER=8K concrete; run is 8-9-10 black; X sits at the 8 position (front)
    const meld = [tileFromString('9K'), tileFromString('10K'), tileFromString('X')]
    const ordered = orderMeldForDisplay(meld, OKEY8K)
    const reps = meldRepresentedValues(ordered, OKEY8K)
    expect(reps).toEqual([8, 9, 10])
  })

  it('false joker in group [8R, 8M, X] with okey=8K → reps [8,8,8] (X = 8, same number)', () => {
    // FALSE_JOKER is concrete 8K; group of 8s; every slot = 8
    const meld = [tileFromString('8R'), tileFromString('8M'), tileFromString('X')]
    const ordered = orderMeldForDisplay(meld, OKEY8K)
    const reps = meldRepresentedValues(ordered, OKEY8K)
    expect(reps).toEqual([8, 8, 8])
  })

  // ── Real okey-tile wild = gap-filler (value = run slot position) ─────────────

  it('run [1R, X(FALSE_JOKER=5K), 3R, 4R] with okey=5K — X is BLACK 5, run is RED: falls back to group ordering, reps same number', () => {
    // This meld is engine-invalid (false joker color BLACK != run color RED).
    // After fix: false joker goes to realPairs as BLACK tile, sameColor=false → group fallback.
    // Reals: 1R,3R,4R (RED) + X(=5K BLACK) — sameColor false, sameNumber false → group fallback.
    // groupNumber = firstNum of firstReal after sort = depends on implementation.
    // Just verify it does not crash and that X's represented value equals okey.number (5).
    const meld = [tileFromString('1R'), tileFromString('X'), tileFromString('3R'), tileFromString('4R')]
    const ordered = orderMeldForDisplay(meld, OKEY)
    const reps = meldRepresentedValues(ordered, OKEY)
    // X (FALSE_JOKER) must always represent okey.number = 5, not any other value
    const xIdx = ordered.findIndex((t) => t.kind === 'FALSE_JOKER')
    expect(reps[xIdx]).toBe(5)
  })

  it('run with okey-tile as wild [7M, 5K(okey-tile), 9M] with okey=5K → [7,8,9]', () => {
    // 5K is the real okey tile, acting as gap-filling wild in a blue run 7-_-9
    // The okey tile fills the gap at position 8
    const meld = [tileFromString('7M'), tileFromString('5K'), tileFromString('9M')]
    const ordered = orderMeldForDisplay(meld, OKEY)
    const reps = meldRepresentedValues(ordered, OKEY)
    expect(reps).toEqual([7, 8, 9])
  })

  it('group [5R, 5S, X(FALSE_JOKER)] with okey=5K → [5, 5, 5]', () => {
    // FALSE_JOKER is concrete 5K; it IS the group number, so reps = [5,5,5]
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

  it('real-okey wild at end of run extends correctly (uses real okey tile, not false joker)', () => {
    // 7M 8M 9M 5K: 5K is real okey (gap-filling wild) extending the BLUE run to 10
    const meld = [tileFromString('7M'), tileFromString('8M'), tileFromString('9M'), tileFromString('5K')]
    const ordered = orderMeldForDisplay(meld, OKEY)
    const reps = meldRepresentedValues(ordered, OKEY)
    expect(reps).toEqual([7, 8, 9, 10])
  })

  it('false joker at end of same-color run extends with fixed value', () => {
    // 6K 7K X with okey=8K: X=8K concrete; run 6-7-8; reps [6,7,8]
    const meld = [tileFromString('6K'), tileFromString('7K'), tileFromString('X')]
    const ordered = orderMeldForDisplay(meld, OKEY8K)
    const reps = meldRepresentedValues(ordered, OKEY8K)
    expect(reps).toEqual([6, 7, 8])
  })

  it('all-display-wild meld (two real okey tiles) returns nulls', () => {
    // Only real NUMBER tiles matching okey are display-wilds (gap-fillers).
    // A meld of two real okey tiles has no concrete anchor → indeterminate.
    const meld = [tileFromString('5K'), tileFromString('5K')]
    const reps = meldRepresentedValues(meld, OKEY)
    expect(reps).toEqual([null, null])
  })

  it('false joker is NOT a display-wild: [X, 5K] has one concrete tile, not all-nulls', () => {
    // X (FALSE_JOKER) is concrete 5K; 5K (real okey) is a display-wild.
    // reals = [X(=5K concrete)]; group of 5s → reps = [5, 5]
    const meld = [tileFromString('X'), tileFromString('5K')]
    const reps = meldRepresentedValues(meld, OKEY)
    expect(reps).toEqual([5, 5])
  })
})
