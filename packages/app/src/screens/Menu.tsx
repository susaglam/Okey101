import { useState } from 'react'
import { loadSettings, saveSettings } from '../settings'
import { applyTheme } from '../theme/themes'

type Variant = 'klasik' | 'yuzbir'

/**
 * Each variant is its own card: the big button starts a NEW game of that variant,
 * and (when a save exists) a "Devam Et" button under it resumes that variant's
 * own game. No separate OYNA button, no shared/ambiguous continue.
 */
export default function Menu({
  onStart,
  onHelp,
  onResume,
  hasKlasikSave,
  has101Save,
}: {
  onStart: (variant: Variant) => void
  onHelp: () => void
  onResume: (variant: Variant) => void
  hasKlasikSave: boolean
  has101Save: boolean
}) {
  const [theme, setTheme] = useState(() => loadSettings().theme)

  const toggleTheme = () => {
    const next = theme === 'klasik' ? 'gece' : 'klasik'
    const s = loadSettings()
    saveSettings({ ...s, theme: next })
    applyTheme(next)
    setTheme(next)
  }

  const VariantCard = ({ variant, title, subtitle, hasSave }: {
    variant: Variant; title: string; subtitle: string; hasSave: boolean
  }) => (
    <div className="variant-card">
      <button className="variant-start" onClick={() => onStart(variant)}>
        <strong>{title}</strong>
        <span className="variant-sub">{subtitle}</span>
        <span className="variant-cta">Yeni Oyun ▸</span>
      </button>
      {hasSave && (
        <button className="variant-resume" onClick={() => onResume(variant)}>
          ↻ Devam Et
        </button>
      )}
    </div>
  )

  return (
    <div className="menu">
      <h1>♣ CS OKEY</h1>
      <p style={{ opacity: 0.7, marginTop: -8, fontSize: 14 }}>Bir oyun seç ve başla</p>

      <div className="variant-cards" role="group" aria-label="Oyun çeşidi">
        <VariantCard variant="klasik" title="Klasik" subtitle="Per + 7 çift" hasSave={hasKlasikSave} />
        <VariantCard variant="yuzbir" title="101" subtitle="El açma ≥101" hasSave={has101Save} />
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
