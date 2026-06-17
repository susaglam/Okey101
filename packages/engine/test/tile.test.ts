import { describe, it, expect } from 'vitest'
import { tileFromString, tileToString, tilesEqual, fromKotlinShort } from '../src/tile'

describe('tile codec', () => {
  it('round-trips a numbered tile', () => {
    const t = tileFromString('7M')
    expect(t).toEqual({ number: 7, color: 'BLUE', kind: 'NUMBER' })
    expect(tileToString(t)).toBe('7M')
  })
  it('parses false joker as X', () => {
    const t = tileFromString('X')
    expect(t.kind).toBe('FALSE_JOKER')
    expect(tileToString(t)).toBe('X')
  })
  it('is locale-invariant for color letters (Turkish i hazard)', () => {
    expect(tileFromString('1k')).toEqual({ number: 1, color: 'BLACK', kind: 'NUMBER' })
  })
  it('tilesEqual compares by value', () => {
    expect(tilesEqual(tileFromString('5R'), tileFromString('5R'))).toBe(true)
    expect(tilesEqual(tileFromString('5R'), tileFromString('5K'))).toBe(false)
  })
  it('maps legacy Kotlin G(green) to BLUE', () => {
    expect(fromKotlinShort('7G')).toEqual({ number: 7, color: 'BLUE', kind: 'NUMBER' })
  })
})
