import { useState } from 'react'
import { loadSettings, saveSettings } from '../settings'
import { applyTheme } from '../theme/themes'
import { hasSavedGame } from '../persistence'
import { MODES, MODE_ORDER, type GameMode } from '../modes'
import type { TableDescriptor } from '../tables'
import type { CurrentUser } from '../auth'

/**
 * The home screen is a LOBBY: a list of the player's tables (open as many as you
 * like). "Yeni Masa" picks a mode and creates a table; each table keeps its own
 * in-progress game. (Forward-looking toward online: a table is where players will
 * sit; for now you take a seat and bots fill the rest.)
 */
export default function Lobby({
  user, tables, onNewTable, onEnter, onDelete, onHelp, onAdmin, onLogout,
}: {
  user: CurrentUser
  tables: TableDescriptor[]
  onNewTable: (mode: GameMode) => void
  onEnter: (table: TableDescriptor) => void
  onDelete: (table: TableDescriptor) => void
  onHelp: () => void
  onAdmin: () => void
  onLogout: () => void
}) {
  const [theme, setTheme] = useState(() => loadSettings().theme)
  const [picking, setPicking] = useState(false)

  const toggleTheme = () => {
    const next = theme === 'klasik' ? 'gece' : 'klasik'
    saveSettings({ ...loadSettings(), theme: next })
    applyTheme(next)
    setTheme(next)
  }

  const card: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    background: 'rgba(0,0,0,.22)', borderRadius: 12, padding: '12px 16px', boxSizing: 'border-box',
  }
  const badge: React.CSSProperties = {
    fontSize: 12, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
    background: 'linear-gradient(180deg,#f0b53e,#d2811a)', color: '#3a2400', whiteSpace: 'nowrap',
  }

  return (
    <div className="menu">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
        <span style={{ opacity: 0.85 }}>
          👤 <strong>{user.name}</strong>
          {user.kind === 'guest' && <span style={{ opacity: 0.6 }}> (misafir)</span>}
        </span>
        {user.isAdmin && <button onClick={onAdmin} style={{ fontSize: 12, padding: '4px 10px' }}>🛠 Admin</button>}
        <button onClick={onHelp} style={{ fontSize: 12, padding: '4px 10px' }}>Nasıl Oynanır?</button>
        <button onClick={toggleTheme} aria-label="Tema" style={{ fontSize: 16, padding: '4px 10px' }}>{theme === 'klasik' ? '🌙' : '☀'}</button>
        <button onClick={onLogout} style={{ fontSize: 12, padding: '4px 10px' }}>Çıkış</button>
      </div>

      <h1>♣ CS OKEY</h1>

      <div style={{ width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 18 }}>Masalar</strong>
          <button onClick={() => setPicking(true)} style={{ fontSize: 14, padding: '8px 16px' }}>+ Yeni Masa</button>
        </div>

        {tables.length === 0 ? (
          <p style={{ opacity: 0.7, textAlign: 'center', margin: '14px 0' }}>
            Henüz masa yok. <strong>Yeni Masa</strong> ile bir masa aç.
          </p>
        ) : (
          tables.map((t) => (
            <div key={t.id} style={card}>
              <span style={badge}>{MODES[t.mode].title}</span>
              <span style={{ flex: 1, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              <button onClick={() => onEnter(t)} style={{ fontSize: 13, padding: '6px 14px' }}>
                {hasSavedGame(t.id) ? '↻ Devam Et' : '▸ Otur'}
              </button>
              <button
                onClick={() => onDelete(t)}
                aria-label={`${t.name} masasını sil`}
                title="Masayı sil"
                style={{ fontSize: 13, padding: '6px 10px', background: 'rgba(180,60,60,.85)', color: '#fff' }}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {/* Mode picker for a new table */}
      {picking && (
        <div
          role="dialog"
          aria-label="Mod seç"
          onClick={() => setPicking(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--felt, #1c5e3a)', borderRadius: 14, padding: 22, maxWidth: 520 }}>
            <h2 style={{ marginTop: 0, fontSize: 18, textAlign: 'center' }}>Masa modunu seç</h2>
            <div className="variant-cards" role="group" aria-label="Oyun çeşidi">
              {MODE_ORDER.map((id) => {
                const m = MODES[id]
                return (
                  <div className="variant-card" key={id}>
                    <button className="variant-start" onClick={() => { setPicking(false); onNewTable(id) }}>
                      <strong>{m.title}</strong>
                      <span className="variant-sub">{m.subtitle}</span>
                      <span className="variant-cta">Masa Aç ▸</span>
                    </button>
                  </div>
                )
              })}
            </div>
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button onClick={() => setPicking(false)} style={{ fontSize: 13 }}>Vazgeç</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
