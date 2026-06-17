// packages/app/test/localAdapter.test.ts
import { describe, it, expect } from 'vitest'
import { LocalAdapter } from '../src/adapter/LocalAdapter'
import type { PlayerView } from '@cs-okey/engine'

describe('LocalAdapter', () => {
  it('starts a hand and pushes the human view at seat 0 on subscribe', () => {
    const a = new LocalAdapter({ seed: 123, humanSeat: 0 })
    let v: PlayerView | null = null
    a.subscribe((view) => { v = view }, () => {})
    expect(v).not.toBeNull()
    expect(v!.seat).toBe(0)
    expect(v!.you.rack.length).toBe(15) // starter holds 15
    expect(v!.turn).toEqual({ seat: 0, phase: 'DISCARD' })
  })
  it('rejects an intent with a stale version', async () => {
    const a = new LocalAdapter({ seed: 123, humanSeat: 0 })
    a.subscribe(() => {}, () => {})
    const tile = a.getHumanView().you.rack[0]!
    const res = await a.dispatch({ type: 'Discard', seat: 0, tile, expectedVersion: -99 })
    expect(res).toEqual({ accepted: false, reason: 'stale-version' })
  })
  it('after the human discards, bots play around and turn returns to the human (or hand ends)', async () => {
    const a = new LocalAdapter({ seed: 123, humanSeat: 0 })
    let last: PlayerView | null = null
    a.subscribe((view) => { last = view }, () => {})
    const tile = a.getHumanView().you.rack[0]!
    const res = await a.dispatch({ type: 'Discard', seat: 0, tile, expectedVersion: a.currentVersion() })
    expect(res.accepted).toBe(true)
    // bots 1,2,3 have moved; it is the human's DRAW turn again, OR the hand ended
    expect(last!.status === 'ENDED' || (last!.turn.seat === 0 && last!.turn.phase === 'DRAW')).toBe(true)
  })
})
