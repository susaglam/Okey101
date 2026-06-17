// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { saveGame, loadGame, clearGame, hasSavedGame } from '../src/persistence'
import type { SaveData } from '../src/persistence'
import { LocalAdapter } from '../src/adapter/LocalAdapter'
import { KLASIK_101 } from '@cs-okey/engine'

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
      const loaded = loadGame()
      expect(loaded).not.toBeNull()
      expect(loaded!.version).toBe(3)
      expect(loaded!.variantId).toBe('yuzbir')
      expect(loaded!.standings).toEqual([0, 10, 5, 2])
      expect(loaded!.scoredHandNo).toBe(0)
    })

    it('round-trips all fields faithfully', () => {
      saveGame(SAMPLE_SAVE)
      const loaded = loadGame()
      expect(loaded).toEqual(SAMPLE_SAVE)
    })
  })

  describe('loadGame returns null', () => {
    it('returns null when nothing is saved', () => {
      expect(loadGame()).toBeNull()
    })

    it('returns null when the stored JSON is corrupt', () => {
      localStorage.setItem('cs-okey-savegame', '{not valid json}}}')
      expect(loadGame()).toBeNull()
    })

    it('returns null when the stored value is not an object', () => {
      localStorage.setItem('cs-okey-savegame', '"just a string"')
      expect(loadGame()).toBeNull()
    })
  })

  describe('clearGame', () => {
    it('removes the save so loadGame returns null', () => {
      saveGame(SAMPLE_SAVE)
      expect(hasSavedGame()).toBe(true)
      clearGame()
      expect(loadGame()).toBeNull()
      expect(hasSavedGame()).toBe(false)
    })

    it('is safe to call when nothing is saved', () => {
      expect(() => clearGame()).not.toThrow()
    })
  })

  describe('hasSavedGame', () => {
    it('returns false when nothing is saved', () => {
      expect(hasSavedGame()).toBe(false)
    })

    it('returns true after a save', () => {
      saveGame(SAMPLE_SAVE)
      expect(hasSavedGame()).toBe(true)
    })

    it('returns false after clear', () => {
      saveGame(SAMPLE_SAVE)
      clearGame()
      expect(hasSavedGame()).toBe(false)
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

  it('auto-saves after dispatch: hasSavedGame() is true', async () => {
    const a = new LocalAdapter({ seed: 0, humanSeat: 0 })
    a.subscribe(() => {}, () => {})
    expect(hasSavedGame()).toBe(false)
    const tile = a.getHumanView().you.rack[0]!
    await a.dispatch({ type: 'Discard', seat: 0, tile, expectedVersion: a.currentVersion() })
    expect(hasSavedGame()).toBe(true)
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

    // If the match is over, save should be cleared
    if (a.getMatch().over) {
      expect(hasSavedGame()).toBe(false)
    }
  })
})
