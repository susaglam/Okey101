import { useState } from 'react'
import { loadSettings, saveSettings } from '../settings'
import { applyTheme } from '../theme/themes'
import { hasSavedGame } from '../persistence'
import { MODES, MODE_ORDER, type GameMode } from '../modes'

/**
 * Each MODE is its own card: the big button starts a NEW game of that mode, and
 * (when a save exists) a "Devam Et" button under it resumes that mode's own game.
 * Modes (incl. Eşli 101) come from the shared MODES table — adding a mode there
 * adds a card here automatically.
 */
export default function Menu({
  onStart,
  onHelp,
  onResume,
}: {
  onStart: (mode: GameMode) => void
  onHelp: () => void
  onResume: (mode: GameMode) => void
}) {
  const [theme, setTheme] = useState(() => loadSettings().theme)

  const toggleTheme = () => {
    const next = theme === 'klasik' ? 'gece' : 'klasik'
    const s = loadSettings()
    saveSettings({ ...s, theme: next })
    applyTheme(next)
    setTheme(next)
  }

  return (
    <div className="menu">
      <h1>♣ CS OKEY</h1>
      <p style={{ opacity: 0.7, marginTop: -8, fontSize: 14 }}>Bir oyun seç ve başla</p>

      <div className="variant-cards" role="group" aria-label="Oyun çeşidi">
        {MODE_ORDER.map((id) => {
          const m = MODES[id]
          const hasSave = hasSavedGame(id)
          return (
            <div className="variant-card" key={id}>
              <button className="variant-start" onClick={() => onStart(id)}>
                <strong>{m.title}</strong>
                <span className="variant-sub">{m.subtitle}</span>
                <span className="variant-cta">Yeni Oyun ▸</span>
              </button>
              {hasSave && (
                <button className="variant-resume" onClick={() => onResume(id)}>
                  ↻ Devam Et
                </button>
              )}
            </div>
          )
        })}
      </div>

      <button onClick={onHelp}>Nasıl Oynanır?</button>
      <button
        onClick={toggleTheme}
        aria-label={theme === 'klasik' ? 'Gece moduna geç' : 'Gündüz moduna geç'}
        style={{ fontSize: 22, background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
      >
        {theme === 'klasik' ? '🌙' : '☀'}
      </button>
    </div>
  )
}
