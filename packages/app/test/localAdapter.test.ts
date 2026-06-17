// packages/app/test/localAdapter.test.ts
import { describe, it, expect } from 'vitest'
import { LocalAdapter } from '../src/adapter/LocalAdapter'
import { KLASIK_101 } from '@cs-okey/engine'
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

  // --- 101 variant tests ---

  it('101 variant: human view rack has 22 tiles (starter gets 21+1)', () => {
    const a = new LocalAdapter({ seed: 1, humanSeat: 0, variant: KLASIK_101 })
    let v: PlayerView | null = null
    a.subscribe((view) => { v = view }, () => {})
    expect(v).not.toBeNull()
    expect(v!.seat).toBe(0)
    // KLASIK_101: tilesInRack=21, starterExtra=1 → starter gets 22
    expect(v!.you.rack.length).toBe(22)
    expect(v!.config.requiresOpening).toBe(true)
  })

  it('101 variant: getMatch().totalHands === 11 (from KLASIK_101.matchHands)', () => {
    const a = new LocalAdapter({ seed: 1, humanSeat: 0, variant: KLASIK_101 })
    a.subscribe(() => {}, () => {})
    expect(a.getMatch().totalHands).toBe(11)
  })

  it('101 variant: standings accumulate via scoreHand101 when a hand ends (non-finishers pay 202)', async () => {
    // Drive a 101 hand to exhaustion by exhausting the stock.
    // All seats that haven't opened pay 202 each.
    // We verify standings are updated (non-zero) after the hand ends.
    const a = new LocalAdapter({ seed: 1, humanSeat: 0, variant: KLASIK_101 })
    a.subscribe(() => {}, () => {})

    // Drive until hand ends by having human discard each turn until ENDED
    let iterations = 0
    while (a.getHumanView().status !== 'ENDED' && iterations++ < 2000) {
      const view = a.getHumanView()
      if (view.status === 'ENDED') break
      const turn = view.turn
      if (turn.seat !== 0) break // bots failed to advance (shouldn't happen)
      const phase = turn.phase
      if (phase === 'DRAW') {
        const res = await a.dispatch({ type: 'DrawFromStock', seat: 0, expectedVersion: a.currentVersion() })
        if (!res.accepted) break
      } else {
        // DISCARD phase — discard the first tile
        const rack = a.getHumanView().you.rack
        if (rack.length === 0) break
        const tile = rack[0]!
        const res = await a.dispatch({ type: 'Discard', seat: 0, tile, expectedVersion: a.currentVersion() })
        if (!res.accepted) break
      }
    }

    // After the hand ends, standings should be non-zero
    const match = a.getMatch()
    // If status is ENDED, standings must have been updated by scoreHand101
    if (a.getHumanView().status === 'ENDED') {
      const standings = match.standings
      // At least one player should have a non-zero delta (exhaustion: all pay 202)
      const anyNonZero = standings.some((s) => s !== 0)
      expect(anyNonZero).toBe(true)
      // In exhaustion: no finisher, everyone should have paid (≥202 each if no one opened)
      // Verify at least one player has a positive standing (penalty)
      const anyPositive = standings.some((s) => s > 0)
      expect(anyPositive).toBe(true)
    } else {
      // If hand didn't end in 2000 iterations (unexpected), just skip
      // This is a safety net but the test expects the hand to end
      expect(a.getHumanView().status).toBe('ENDED')
    }
  })

  it('klasik default (no variant): deals 15 tiles and uses scoreHand', () => {
    const a = new LocalAdapter({ seed: 1, humanSeat: 0 })
    let v: PlayerView | null = null
    a.subscribe((view) => { v = view }, () => {})
    expect(v!.you.rack.length).toBe(15) // KLASIK starter: 14+1
    expect(a.getMatch().totalHands).toBe(5) // KLASIK.matchHands
    expect(v!.config.scoringModel).toBe('klasik-flat')
  })

  it('matchHands option overrides variant default', () => {
    const a = new LocalAdapter({ seed: 1, humanSeat: 0, variant: KLASIK_101, matchHands: 3 })
    a.subscribe(() => {}, () => {})
    expect(a.getMatch().totalHands).toBe(3)
  })
})
