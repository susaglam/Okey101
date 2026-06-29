// packages/app/src/persistence.ts
import type { HandRecord } from './match'
import { resolveMode, type GameMode } from './modes'

export interface SaveData {
  version: number
  /** Game mode — the save-slot key AND the rules selector. Eşli 101 gets its own
   *  slot distinct from plain 101 (they were colliding before). */
  mode: GameMode
  /** Legacy rules family, kept for back-compat with pre-mode saves. Optional. */
  variantId?: 'klasik' | 'yuzbir'
  state: unknown
  standings: number[]
  scoredHandNo: number
  savedAt: number
  /** Master RNG seed (== state.rngSeed). Persisted so bot RNG continues
   * deterministically on resume. Optional for back-compat with older saves. */
  seed?: number
  /** Per-hand score history for the score table. Optional for back-compat. */
  history?: HandRecord[]
}

export type VariantId = 'klasik' | 'yuzbir'

// One "continue" slot per mode. Klasik & 101 keep their original keys (the mode id
// matches the old variantId), so existing saves load unchanged; Eşli 101 gets a new
// slot. (The lobby will later key by tableId instead.)
const saveKey = (mode: GameMode) => `cs-okey-savegame-${mode}`

/** The mode a (possibly legacy) save belongs to: prefer `mode`, fall back to `variantId`. */
export function saveMode(data: SaveData): GameMode {
  return resolveMode(data.mode ?? data.variantId)
}

export function saveGame(data: SaveData): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(saveKey(saveMode(data)), JSON.stringify(data))
  } catch {
    // Quota exceeded or other storage error — save is best-effort
  }
}

export function loadGame(mode: GameMode): SaveData | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(saveKey(mode))
    if (raw === null) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    return parsed as SaveData
  } catch {
    return null
  }
}

export function clearGame(mode: GameMode): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(saveKey(mode))
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

export function hasSavedGame(mode: GameMode): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(saveKey(mode)) !== null
  } catch {
    return false
  }
}
