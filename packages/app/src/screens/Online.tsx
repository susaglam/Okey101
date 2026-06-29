// packages/app/src/screens/Online.tsx
// The ONLINE client flow (server-driven): auth via the server, a SHARED lobby, a
// seating room, and the game over the socket. Mounted only when VITE_ONLINE=1, so the
// offline (vs-bots) app + its tests are untouched.
import { useEffect, useMemo, useRef, useState } from 'react'
import GameScreen from './GameScreen'
import { OnlineClient } from '../net/online'
import { OnlineAdapter } from '../adapter/OnlineAdapter'
import { register, login, guest, logout, refresh, type ServerUser } from '../net/authClient'
import { MODES, MODE_ORDER, type GameMode } from '../modes'
import { setHumanName } from '../names'
import type { CurrentUser } from '../auth'

// Adapt the server user to the shape GameScreen's feature-gating expects.
function toCurrentUser(u: ServerUser): CurrentUser {
  return {
    id: u.id, name: u.username, kind: u.groupId === 'guest' ? 'guest' : 'registered',
    isAdmin: u.isAdmin,
    group: { id: u.groupId, name: u.groupId, features: u.features as never },
  }
}

interface PublicSeat { index: number; ready: boolean; occupant: { kind: 'human'; name: string } | { kind: 'bot' } | null }
interface PublicTable { id: string; mode: GameMode; name: string; status: 'waiting' | 'playing' | 'ended'; hostUserId: string | null; seats: PublicSeat[] }

export default function OnlineRoot() {
  const [user, setUser] = useState<ServerUser | null>(null)
  const [booted, setBooted] = useState(false)

  useEffect(() => { void refresh().then((u) => { setUser(u); setBooted(true) }) }, [])
  useEffect(() => { if (user) setHumanName(user.username) }, [user])

  if (!booted) return <div className="menu"><h1>♣ CS OKEY</h1><p>Bağlanıyor…</p></div>
  if (!user) return <OnlineLogin onAuthed={setUser} />
  return <OnlineApp user={user} onLogout={() => { void logout().then(() => setUser(null)) }} />
}

function OnlineLogin({ onAuthed }: { onAuthed: (u: ServerUser) => void }) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [username, setU] = useState(''); const [email, setE] = useState(''); const [password, setP] = useState('')
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true); setError(null)
    const r = tab === 'login' ? await login(username, password, true) : await register(username, password, email, true)
    setBusy(false)
    if (r.ok) onAuthed(r.user); else setError(r.error)
  }
  const asGuest = async () => { setBusy(true); const r = await guest(); setBusy(false); if (r.ok) onAuthed(r.user); else setError(r.error) }
  const field: React.CSSProperties = { padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(0,0,0,.25)', color: 'inherit', fontSize: 15, width: '100%', boxSizing: 'border-box' }

  return (
    <div className="menu">
      <h1>♣ CS OKEY <span style={{ fontSize: 14, opacity: 0.6 }}>online</span></h1>
      <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px', boxSizing: 'border-box' }}>
        <div role="tablist" style={{ display: 'flex', gap: 8 }}>
          {(['login', 'register'] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setError(null) }} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer', color: tab === t ? '#3a2400' : 'inherit', background: tab === t ? 'linear-gradient(180deg,#f0b53e,#d2811a)' : 'rgba(255,255,255,.1)' }}>
              {t === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void submit() }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input style={field} placeholder="Kullanıcı adı" value={username} onChange={(e) => setU(e.target.value)} autoFocus />
          {tab === 'register' && <input style={field} placeholder="E-posta (opsiyonel)" value={email} onChange={(e) => setE(e.target.value)} />}
          <input style={field} type="password" placeholder="Şifre" value={password} onChange={(e) => setP(e.target.value)} />
          {error && <span style={{ color: '#f08a8a', fontSize: 13 }}>{error}</span>}
          <button type="submit" disabled={busy} style={{ padding: '10px 0', borderRadius: 8, border: 'none', fontWeight: 800, cursor: 'pointer', background: 'linear-gradient(180deg,#f0b53e,#d2811a)', color: '#3a2400' }}>
            {tab === 'login' ? 'Giriş Yap' : 'Kayıt Ol ve Oyna'}
          </button>
        </form>
        <div style={{ fontSize: 12, opacity: 0.6 }}>— veya —</div>
        <button onClick={() => void asGuest()} disabled={busy} style={{ width: '100%' }}>👤 Misafir Olarak Oyna</button>
      </div>
    </div>
  )
}

function OnlineApp({ user, onLogout }: { user: ServerUser; onLogout: () => void }) {
  const clientRef = useRef<OnlineClient | null>(null)
  if (!clientRef.current) clientRef.current = new OnlineClient()
  const client = clientRef.current

  const [connected, setConnected] = useState(false)
  const [tables, setTables] = useState<PublicTable[]>([])
  const [table, setTable] = useState<PublicTable | null>(null) // table we're in
  const [picking, setPicking] = useState(false)
  // Host-chosen table settings (frozen at creation).
  const [newHands, setNewHands] = useState(11)
  const [newTurnSecs, setNewTurnSecs] = useState(20)

  useEffect(() => {
    let alive = true
    void client.connect().then(() => { if (alive) setConnected(true) })
    const offLobby = client.on<PublicTable[]>('lobby:tables', (t) => setTables(t))
    const offState = client.on<PublicTable>('table:state', (t) => setTable(t))
    return () => { alive = false; offLobby(); offState(); client.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cu = useMemo(() => toCurrentUser(user), [user])
  const mySeat = table ? table.seats.findIndex((s) => s.occupant?.kind === 'human' && s.occupant.name === user.username) : -1
  const isHost = !!table && table.hostUserId === user.id
  const adapter = useMemo(() => (table && table.status === 'playing' && mySeat >= 0 ? new OnlineAdapter(client, table.id) : null), [client, table?.id, table?.status, mySeat])

  if (!connected) return <div className="menu"><h1>♣ CS OKEY</h1><p>Sunucuya bağlanıyor…</p></div>

  // ── in a PLAYING table we're seated at → the game ──────────────────────────
  if (table && table.status === 'playing' && adapter) {
    return <GameScreen adapter={adapter} user={cu} onExitToMenu={() => setTable(null)} />
  }

  // ── in a table (waiting room) ──────────────────────────────────────────────
  if (table) {
    return (
      <div className="menu">
        <h1>♣ {table.name}</h1>
        <p style={{ opacity: 0.7, marginTop: -8 }}>{MODES[table.mode].title} · {table.status === 'waiting' ? 'Bekleniyor' : table.status}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 420, padding: '0 16px', boxSizing: 'border-box' }}>
          {table.seats.map((s) => {
            const mine = s.occupant?.kind === 'human' && s.occupant.name === user.username
            return (
              <div key={s.index} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,.22)', borderRadius: 10, padding: '10px 14px' }}>
                <span style={{ fontWeight: 800, minWidth: 60 }}>Koltuk {s.index + 1}</span>
                <span style={{ flex: 1 }}>
                  {s.occupant == null ? <em style={{ opacity: 0.6 }}>boş</em> : s.occupant.kind === 'bot' ? '🤖 Bot' : `👤 ${s.occupant.name}`}
                  {mine && <span style={{ color: '#6ee86e' }}> (sen)</span>}
                  {s.occupant?.kind === 'human' && s.ready && <span style={{ color: '#6ee86e' }}> ✓ hazır</span>}
                </span>
                {s.occupant == null && <button onClick={() => void client.sit(table.id, s.index)} style={{ fontSize: 13 }}>Otur</button>}
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {mySeat >= 0 && <button onClick={() => void client.ready(table.id, !table.seats[mySeat]!.ready)}>{table.seats[mySeat]!.ready ? 'Hazır değilim' : 'Hazırım'}</button>}
            {mySeat >= 0 && <button onClick={() => void client.stand(table.id)}>Kalk</button>}
            {isHost && <button onClick={() => void client.start(table.id)} style={{ background: 'linear-gradient(180deg,#6db36d,#3f7a3f)', color: '#07210a' }}>▶ Başlat</button>}
            <button onClick={() => { void client.leave(table.id); setTable(null) }}>← Lobi</button>
          </div>
        </div>
      </div>
    )
  }

  // ── lobby ──────────────────────────────────────────────────────────────────
  return (
    <div className="menu">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
        <span>👤 <strong>{user.username}</strong>{user.groupId === 'guest' && <span style={{ opacity: 0.6 }}> (misafir)</span>}</span>
        <button onClick={onLogout} style={{ fontSize: 12, padding: '4px 10px' }}>Çıkış</button>
      </div>
      <h1>♣ CS OKEY <span style={{ fontSize: 14, opacity: 0.6 }}>online</span></h1>
      <div style={{ width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 18 }}>Masalar</strong>
          <button onClick={() => setPicking(true)} style={{ fontSize: 14, padding: '8px 16px' }}>+ Yeni Masa</button>
        </div>
        {tables.length === 0 ? <p style={{ opacity: 0.7, textAlign: 'center' }}>Açık masa yok. Yeni masa aç.</p> : tables.map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,.22)', borderRadius: 10, padding: '10px 14px' }}>
            <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: 'linear-gradient(180deg,#f0b53e,#d2811a)', color: '#3a2400' }}>{MODES[t.mode].title}</span>
            <span style={{ flex: 1, fontWeight: 700 }}>{t.name}</span>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{t.seats.filter((s) => s.occupant?.kind === 'human').length}/4 · {t.status}</span>
            <button onClick={() => void client.joinTable(t.id)} style={{ fontSize: 13 }}>Katıl</button>
          </div>
        ))}
      </div>
      {picking && (
        <div role="dialog" aria-label="Mod seç" onClick={() => setPicking(false)} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--felt,#1c5e3a)', borderRadius: 14, padding: 22, maxWidth: 440 }}>
            <h2 style={{ marginTop: 0, fontSize: 18, textAlign: 'center' }}>Masa Ayarları</h2>
            {/* Hands + turn time apply to the table being created (host-chosen). */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', margin: '4px 0 16px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 700 }}>
                Kaç el
                <select value={newHands} onChange={(e) => setNewHands(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: 8 }}>
                  {[1, 3, 5, 7, 11].map((n) => <option key={n} value={n}>{n} el</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 700 }}>
                Tur süresi
                <select value={newTurnSecs} onChange={(e) => setNewTurnSecs(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: 8 }}>
                  {[10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} sn</option>)}
                </select>
              </label>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 15, textAlign: 'center', opacity: 0.85 }}>Mod seç ve aç</h3>
            <div className="variant-cards">
              {MODE_ORDER.map((id) => (
                <div className="variant-card" key={id}>
                  <button className="variant-start" onClick={() => { setPicking(false); void client.createTable(id, `${MODES[id].title} Masası`, undefined, { matchHands: newHands, turnSeconds: newTurnSecs }) }}>
                    <strong>{MODES[id].title}</strong><span className="variant-sub">{MODES[id].subtitle}</span><span className="variant-cta">Masa Aç ▸</span>
                  </button>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 14 }}><button onClick={() => setPicking(false)} style={{ fontSize: 13 }}>Vazgeç</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
