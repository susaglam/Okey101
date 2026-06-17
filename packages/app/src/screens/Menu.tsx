import { useState } from 'react'
import { loadSettings, saveSettings } from '../settings'
import { applyTheme } from '../theme/themes'

type Variant = 'klasik' | 'yuzbir'

export default function Menu({ onStart, onHelp }: { onStart: (variant: Variant) => void; onHelp: () => void }) {
  const [theme, setTheme] = useState(() => loadSettings().theme)
  const [variant, setVariant] = useState<Variant>('klasik')

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
      <div className="variant-select" role="group" aria-label="Oyun çeşidi">
        <button
          onClick={() => setVariant('klasik')}
          aria-pressed={variant === 'klasik'}
        >
          Klasik
        </button>
        <button
          onClick={() => setVariant('yuzbir')}
          aria-pressed={variant === 'yuzbir'}
        >
          101
        </button>
      </div>
      <button onClick={() => onStart(variant)}>OYNA ▸</button>
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
