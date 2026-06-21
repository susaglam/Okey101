export interface Settings {
  theme: 'klasik' | 'gece'
  colorblind: boolean
  repValue: boolean
  sound: boolean
  difficulty: 'easy' | 'medium' | 'hard'
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'klasik',
  colorblind: false,
  repValue: true,
  sound: true,
  difficulty: 'medium',
}

const STORAGE_KEY = 'cs-okey-settings'

export function loadSettings(): Settings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}
