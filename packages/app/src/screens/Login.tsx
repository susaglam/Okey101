import { useState } from 'react'
import { register, login, loginAsGuest } from '../auth'

/**
 * Entry gate shown when nobody is signed in. A guest can play immediately (fixed
 * "Misafir" name, no advantages); registering (username + password, optional email)
 * creates a "normal" account that unlocks the gated assists and lets you keep a name.
 */
export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    const r = tab === 'login' ? login(username, password) : register(username, password, email)
    if (r.ok) onAuthed()
    else setError(r.error ?? 'Bir hata oluştu.')
  }

  const guest = () => { loginAsGuest(); onAuthed() }

  const field: React.CSSProperties = {
    padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.25)',
    background: 'rgba(0,0,0,.25)', color: 'inherit', fontSize: 15, width: '100%', boxSizing: 'border-box',
  }

  return (
    <div className="menu" style={{ maxWidth: 360, margin: '0 auto' }}>
      <h1>♣ CS OKEY</h1>

      <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        {(['login', 'register'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => { setTab(t); setError(null) }}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', fontWeight: 700,
              border: 'none', color: tab === t ? '#3a2400' : 'inherit',
              background: tab === t ? 'linear-gradient(180deg,#f0b53e,#d2811a)' : 'rgba(255,255,255,.1)',
            }}
          >
            {t === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); submit() }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}
      >
        <input
          style={field} placeholder="Kullanıcı adı" autoFocus aria-label="Kullanıcı adı"
          value={username} onChange={(e) => setUsername(e.target.value)}
        />
        {tab === 'register' && (
          <input
            style={field} placeholder="E-posta (opsiyonel)" type="email" aria-label="E-posta"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        )}
        <input
          style={field} placeholder="Şifre" type="password" aria-label="Şifre"
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
        {error && <span style={{ color: '#f08a8a', fontSize: 13 }}>{error}</span>}
        <button
          type="submit"
          style={{
            padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 15,
            background: 'linear-gradient(180deg,#f0b53e,#d2811a)', color: '#3a2400',
          }}
        >
          {tab === 'login' ? 'Giriş Yap' : 'Kayıt Ol ve Oyna'}
        </button>
      </form>

      <div style={{ fontSize: 12, opacity: 0.6, margin: '2px 0' }}>— veya —</div>
      <button onClick={guest} style={{ width: '100%' }}>👤 Misafir Olarak Oyna</button>
      <p style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', marginTop: 4 }}>
        Misafirler oynayabilir; isim değiştirmek ve avantajlı yardımları görmek için üye olun.
      </p>
    </div>
  )
}
