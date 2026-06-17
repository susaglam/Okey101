import { describe, it, expect } from 'vitest'
import { makeRng, shuffle, deriveSeed } from '../src/rng'

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = [makeRng(123)(), makeRng(123)(), makeRng(123)()]
    const b = [makeRng(123)(), makeRng(123)(), makeRng(123)()]
    expect(a).toEqual(b)
  })
  it('shuffle with same seed gives same order; different seed differs', () => {
    const base = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(shuffle(base, makeRng(42))).toEqual(shuffle(base, makeRng(42)))
    expect(shuffle(base, makeRng(42))).not.toEqual(shuffle(base, makeRng(43)))
  })
  it('shuffle does not mutate input and preserves multiset', () => {
    const base = [1, 2, 3, 4, 5]
    const out = shuffle(base, makeRng(7))
    expect(base).toEqual([1, 2, 3, 4, 5])
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5])
  })
  it('deriveSeed is stable and label-sensitive', () => {
    expect(deriveSeed(999, 'bot:0')).toBe(deriveSeed(999, 'bot:0'))
    expect(deriveSeed(999, 'bot:0')).not.toBe(deriveSeed(999, 'bot:1'))
  })
})
