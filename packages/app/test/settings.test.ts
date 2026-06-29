// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/settings'
import type { Settings } from '../src/settings'

describe('settings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns defaults when storage is empty', () => {
    const s = loadSettings()
    expect(s).toEqual(DEFAULT_SETTINGS)
  })

  it('returns defaults when storage contains corrupt JSON', () => {
    localStorage.setItem('cs-okey-settings', 'NOT_JSON{{{{')
    const s = loadSettings()
    expect(s).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips a non-default value', () => {
    const custom: Settings = { theme: 'gece', colorblind: true, repValue: false, sound: true, difficulty: 'hard', botNames: ['A', 'B', 'C'] }
    saveSettings(custom)
    const loaded = loadSettings()
    expect(loaded).toEqual(custom)
  })

  it('merges partial stored object over defaults', () => {
    localStorage.setItem('cs-okey-settings', JSON.stringify({ theme: 'gece' }))
    const s = loadSettings()
    expect(s.theme).toBe('gece')
    expect(s.colorblind).toBe(DEFAULT_SETTINGS.colorblind)
    expect(s.repValue).toBe(DEFAULT_SETTINGS.repValue)
  })
})
