// packages/app/src/persistence.ts

export interface SaveData {
  version: number
  variantId: 'klasik' | 'yuzbir'
  state: unknown
  standings: number[]
  scoredHandNo: number
  savedAt: number
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

export function hasSavedGame(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(SAVE_KEY) !== null
  } catch {
    return false
  }
}
