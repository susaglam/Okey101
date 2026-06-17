import { useState } from 'react'
import { loadSettings, saveSettings } from '../settings'
import { applyTheme } from '../theme/themes'

export default function Menu({ onStart }: { onStart: () => void }) {
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
      <button onClick={onStart}>OYNA ▸</button>
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
