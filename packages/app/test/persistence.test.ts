// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { saveGame, loadGame, clearGame, hasSavedGame, isResumableSave } from '../src/persistence'
import type { SaveData } from '../src/persistence'
import { LocalAdapter } from '../src/adapter/LocalAdapter'
import { KLASIK_101 } from '@cs-okey/engine'

// Drive one legal human step (draw or discard rack[0]) — used to compare bot RNG continuity.
async function step(adapter: LocalAdapter): Promise<void> {
  const v = adapter.getHumanView()
  if (v.status !== 'PLAYING' || v.turn.seat !== 0) return
  if (v.turn.phase === 'DRAW') {
    await adapter.dispatch({ type: 'DrawFromStock', seat: 0, expectedVersion: adapter.currentVersion() })
  } else {
    const t = v.you.rack[0]!
    await adapter.dispatch({ type: 'Discard', seat: 0, tile: t, expectedVersion: adapter.currentVersion() })
  }
}

const SAMPLE_SAVE: SaveData = {
  version: 3,
  variantId: 'yuzbir',
  state: { handNo: 1, status: 'PLAYING', someField: 'value' },
  standings: [0, 10, 5, 2],
  scoredHandNo: 0,
  savedAt: 0,
}

beforeEach(() => {
  // Ensure clean localStorage state before each test
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('persistence', () => {
  describe('saveGame / loadGame round-trip', () => {
    it('saves and reloads a SaveData correctly', () => {
      saveGame(SAMPLE_SAVE)
      const loaded = loadGame('yuzbir')
      expect(loaded).not.toBeNull()
      expect(loaded!.version).toBe(3)
      expect(loaded!.variantId).toBe('yuzbir')
      expect(loaded!.standings).toEqual([0, 10, 5, 2])
      expect(loaded!.scoredHandNo).toBe(0)
    })

    it('round-trips all fields faithfully', () => {
      saveGame(SAMPLE_SAVE)
      const loaded = loadGame('yuzbir')
      expect(loaded).toEqual(SAMPLE_SAVE)
    })
  })

  describe('loadGame returns null', () => {
    it('returns null when nothing is saved', () => {
      expect(loadGame('yuzbir')).toBeNull()
    })

    it('returns null when the stored JSON is corrupt', () => {
      localStorage.setItem('cs-okey-savegame-yuzbir', '{not valid json}}}')
      expect(loadGame('yuzbir')).toBeNull()
    })

    it('returns null when the stored value is not an object', () => {
      localStorage.setItem('cs-okey-savegame-yuzbir', '"just a string"')
      expect(loadGame('yuzbir')).toBeNull()
    })
  })

  describe('clearGame', () => {
    it('removes the save so loadGame returns null', () => {
      saveGame(SAMPLE_SAVE)
      expect(hasSavedGame('yuzbir')).toBe(true)
      clearGame('yuzbir')
      expect(loadGame('yuzbir')).toBeNull()
      expect(hasSavedGame('yuzbir')).toBe(false)
    })

    it('is safe to call when nothing is saved', () => {
      expect(() => clearGame('yuzbir')).not.toThrow()
    })
  })

  describe('hasSavedGame', () => {
    it('returns false when nothing is saved', () => {
      expect(hasSavedGame('yuzbir')).toBe(false)
    })

    it('returns true after a save', () => {
      saveGame(SAMPLE_SAVE)
      expect(hasSavedGame('yuzbir')).toBe(true)
    })

    it('returns false after clear', () => {
      saveGame(SAMPLE_SAVE)
      clearGame('yuzbir')
      expect(hasSavedGame('yuzbir')).toBe(false)
    })
  })
})

describe('LocalAdapter snapshot/resume', () => {
  it('snapshot() returns a SaveData with the right variantId for KLASIK_101', async () => {
    const a = new LocalAdapter({ seed: 0, humanSeat: 0, variant: KLASIK_101 })
    a.subscribe(() => {}, () => {})
    const tile = a.getHumanView().you.rack[0]!
    await a.dispatch({ type: 'Discard', seat: 0, tile, expectedVersion: a.currentVersion() })
    const snap = a.snapshot()
    expect(snap.variantId).toBe('yuzbir')
    expect(snap.version).toBeGreaterThan(0)
    expect(snap.standings).toBeInstanceOf(Array)
    expect(snap.standings).toHaveLength(4)
  })

  it('snapshot() returns variantId "klasik" for the default KLASIK variant', async () => {
    const a = new LocalAdapter({ seed: 0, humanSeat: 0 })
    a.subscribe(() => {}, () => {})
    const snap = a.snapshot()
    expect(snap.variantId).toBe('klasik')
  })

  it('resume: adapter B built with resumeFrom snapshot matches adapter A view', async () => {
    const a = new LocalAdapter({ seed: 0, humanSeat: 0, variant: KLASIK_101 })
    a.subscribe(() => {}, () => {})

    // Make a move so the state is non-initial
    const tile = a.getHumanView().you.rack[0]!
    await a.dispatch({ type: 'Discard', seat: 0, tile, expectedVersion: a.currentVersion() })

    const snapshot = a.snapshot()
    const aView = a.getHumanView()

    // Build adapter B from the snapshot
    const b = new LocalAdapter({ seed: 0, humanSeat: 0, resumeFrom: snapshot })
    b.subscribe(() => {}, () => {})
    const bView = b.getHumanView()

    // Views should match
    expect(bView.you.rack).toEqual(aView.you.rack)
    expect(bView.turn).toEqual(aView.turn)
    expect(bView.handNo).toEqual(aView.handNo)
    expect(bView.status).toEqual(aView.status)
    expect(b.getMatch().standings).toEqual(a.getMatch().standings)
  })

  describe('isResumableSave (structural guard)', () => {
    it('rejects a partial/malformed state', () => {
      expect(isResumableSave(SAMPLE_SAVE)).toBe(false) // state has no players/stock/turn
      expect(isResumableSave(null)).toBe(false)
      expect(isResumableSave({ ...SAMPLE_SAVE, state: { players: 'nope' } })).toBe(false)
    })

    it('accepts a real adapter snapshot', () => {
      const a = new LocalAdapter({ seed: 5, humanSeat: 0, variant: KLASIK_101 })
      a.subscribe(() => {}, () => {})
      expect(isResumableSave(a.snapshot())).toBe(true)
    })

    it('rejects a save missing fields that redactFor/GameScreen access (scores, config, gameId)', () => {
      const a = new LocalAdapter({ seed: 5, humanSeat: 0, variant: KLASIK_101 })
      a.subscribe(() => {}, () => {})
      const good = a.snapshot()
      const drop = (key: string): SaveData => {
        const st = { ...(good.state as Record<string, unknown>) }
        delete st[key]
        return { ...good, state: st }
      }
      // These all pass the basic players/stock/turn checks but would crash on resume.
      expect(isResumableSave(drop('scores'))).toBe(false)
      expect(isResumableSave(drop('config'))).toBe(false)
      expect(isResumableSave(drop('gameId'))).toBe(false)
    })
  })

  describe('resume seed continuity', () => {
    it('snapshot persists the master seed', () => {
      const a = new LocalAdapter({ seed: 42, humanSeat: 0, variant: KLASIK_101 })
      a.subscribe(() => {}, () => {})
      expect(a.snapshot().seed).toBe(42)
    })

    it('resume restores the seed from the snapshot, ignoring opts.seed (bot RNG continuity)', async () => {
      const a = new LocalAdapter({ seed: 42, humanSeat: 0, variant: KLASIK_101 })
      a.subscribe(() => {}, () => {})
      const snap = a.snapshot()

      // Two resumes with DIFFERENT opts.seed must behave identically, because the
      // seed comes from the snapshot (42), not opts.seed (999 / 111).
      const b = new LocalAdapter({ seed: 999, humanSeat: 0, resumeFrom: snap })
      const c = new LocalAdapter({ seed: 111, humanSeat: 0, resumeFrom: snap })
      b.subscribe(() => {}, () => {})
      c.subscribe(() => {}, () => {})
      for (let i = 0; i < 4; i++) { await step(b); await step(c) }
      expect(b.getHumanView().opponents).toEqual(c.getHumanView().opponents)
      expect(b.getHumanView().turn).toEqual(c.getHumanView().turn)
    })

    it('resume falls back to state.rngSeed when the save has no seed (old save)', async () => {
      const a = new LocalAdapter({ seed: 7, humanSeat: 0, variant: KLASIK_101 })
      a.subscribe(() => {}, () => {})
      const snap = a.snapshot()
      const legacy = { ...snap, seed: undefined } // simulate a pre-seed save
      const b = new LocalAdapter({ seed: 999, humanSeat: 0, resumeFrom: legacy })
      b.subscribe(() => {}, () => {})
      // state.rngSeed === 7 (CreateGame seed) → continues like the original, not seed 999
      const ref = new LocalAdapter({ seed: 7, humanSeat: 0, resumeFrom: snap })
      ref.subscribe(() => {}, () => {})
      for (let i = 0; i < 4; i++) { await step(b); await step(ref) }
      expect(b.getHumanView().opponents).toEqual(ref.getHumanView().opponents)
    })
  })

  it('auto-saves after dispatch: hasSavedGame is true (klasik adapter)', async () => {
    const a = new LocalAdapter({ seed: 0, humanSeat: 0 }) // KLASIK
    a.subscribe(() => {}, () => {})
    expect(hasSavedGame('klasik')).toBe(false)
    const tile = a.getHumanView().you.rack[0]!
    await a.dispatch({ type: 'Discard', seat: 0, tile, expectedVersion: a.currentVersion() })
    expect(hasSavedGame('klasik')).toBe(true)
  })

  it('clears save when match is over', async () => {
    // Use a 1-hand klasik match and drive it to completion
    const a = new LocalAdapter({ seed: 1, humanSeat: 0, matchHands: 1 })
    a.subscribe(() => {}, () => {})

    // Drive until hand ends
    let iterations = 0
    while (a.getHumanView().status !== 'ENDED' && iterations++ < 2000) {
      const view = a.getHumanView()
      if (view.status === 'ENDED') break
      const turn = view.turn
      if (turn.seat !== 0) break
      const phase = turn.phase
      if (phase === 'DRAW') {
        const res = await a.dispatch({ type: 'DrawFromStock', seat: 0, expectedVersion: a.currentVersion() })
        if (!res.accepted) break
      } else {
        const rack = a.getHumanView().you.rack
        if (rack.length === 0) break
        const tile = rack[0]!
        const res = await a.dispatch({ type: 'Discard', seat: 0, tile, expectedVersion: a.currentVersion() })
        if (!res.accepted) break
      }
    }

    // If the match is over, save should be cleared (KLASIK adapter)
    if (a.getMatch().over) {
      expect(hasSavedGame('klasik')).toBe(false)
    }
  })
})
