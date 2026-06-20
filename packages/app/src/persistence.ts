// packages/app/src/persistence.ts

export interface SaveData {
  version: number
  variantId: 'klasik' | 'yuzbir'
  state: unknown
  standings: number[]
  scoredHandNo: number
  savedAt: number
  /** Master RNG seed (== state.rngSeed). Persisted so bot RNG continues
   * deterministically on resume. Optional for back-compat with older saves. */
  seed?: number
}

const SAVE_KEY = 'cs-okey-savegame'

export function saveGame(data: SaveData): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch {
    // Quota exceeded or other storage error — save is best-effort
  }
}

export function loadGame(): SaveData | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    return parsed as SaveData
  } catch {
    return null
  }
}

export function clearGame(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // Best-effort
  }
}

/**
 * Structural guard for a resumed game. `loadGame` is intentionally lenient (it
 * only checks JSON shape), so this validates that `save.state` actually looks
 * like a GameState before we trust it — a malformed/partial save would otherwise
 * make redactFor/runBots throw synchronously during render. Never throws.
 */
export function isResumableSave(save: SaveData | null): boolean {
  if (!save) return false
  const s = save.state as Record<string, unknown> | null
  if (typeof s !== 'object' || s === null) return false
  if (typeof s.gameId !== 'string') return false
  // config is spread into the PlayerView (view.ts) and drives GameScreen logic.
  if (typeof s.config !== 'object' || s.config === null) return false
  if (!Array.isArray(s.players) || s.players.length < 2) return false
  for (const p of s.players) {
    if (typeof p !== 'object' || p === null) return false
    const pp = p as Record<string, unknown>
    if (typeof pp.seat !== 'number') return false
    if (!Array.isArray(pp.rack) || !Array.isArray(pp.discard)) return false
    if (typeof pp.hasOpened !== 'boolean' || typeof pp.isOut !== 'boolean') return false
  }
  if (!Array.isArray(s.stock)) return false
  // scores is sliced unconditionally in redactFor — a missing/non-array value
  // would throw synchronously during render.
  if (!Array.isArray(s.scores)) return false
  const turn = s.turn as Record<string, unknown> | null
  if (typeof turn !== 'object' || turn === null) return false
  if (typeof turn.seat !== 'number' || typeof turn.phase !== 'string') return false
  if (typeof s.status !== 'string') return false
  if (typeof s.rngSeed !== 'number') return false
  if (typeof s.handNo !== 'number') return false
  return true
}

export function hasSavedGame(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(SAVE_KEY) !== null
  } catch {
    return false
  }
}
