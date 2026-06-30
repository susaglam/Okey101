import { useEffect, useState, useCallback } from 'react'
import { FEATURES, type Feature } from '../auth'
import {
  listAdminUsers, listAdminGroups, createAdminUser, updateAdminUser, deleteAdminUser,
  createAdminGroup, updateAdminGroup, deleteAdminGroup,
  type AdminGroup, type AdminUser,
} from '../net/adminClient'
import {
  listFeedback, getFeedbackScreenshot, setFeedbackStatus, deleteFeedback, type FeedbackItem,
} from '../net/feedbackClient'

/**
 * SERVER-backed admin panel for the online app (visible only to an isAdmin group).
 * Manage user GROUPS + their per-feature flags, and USER accounts (add / delete /
 * reassign group / reset password) — all via the /admin API. Themed to match the rest
 * of the app (dark felt) rather than rendering as bare HTML.
 */
export default function OnlineAdmin({ onBack }: { onBack: () => void }) {
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [nu, setNu] = useState({ username: '', email: '', password: '', groupId: 'normal' })
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [shot, setShot] = useState<string | null>(null) // viewing a screenshot

  const reload = useCallback(async () => {
    const [g, u, fb] = await Promise.all([listAdminGroups(), listAdminUsers(), listFeedback()])
    setGroups(g.groups ?? [])
    setUsers(u.users ?? [])
    setFeedback(fb.items ?? [])
  }, [])
  useEffect(() => { void reload() }, [reload])

  // ── themed styles (dark felt) ───────────────────────────────────────────────
  const cell: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,.14)', textAlign: 'left', fontSize: 13 }
  const input: React.CSSProperties = { padding: '7px 9px', borderRadius: 8, border: '1px solid rgba(255,255,255,.28)', background: 'rgba(0,0,0,.32)', color: '#fff7e9', fontSize: 13 }
  const btn: React.CSSProperties = { background: 'linear-gradient(180deg,#f0b53e,#d2811a)', color: '#3a2400', border: 'none', borderRadius: 8, padding: '6px 13px', fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 0 #9a5e12' }
  const btnGhost: React.CSSProperties = { background: 'rgba(255,255,255,.12)', color: '#fff7e9', border: '1px solid rgba(255,255,255,.25)', borderRadius: 8, padding: '5px 11px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }
  const btnDanger: React.CSSProperties = { background: 'rgba(190,45,45,.9)', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 11px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }

  const toggleFeature = async (g: AdminGroup, f: Feature, on: boolean) => {
    setErr(null)
    const r = await updateAdminGroup(g.id, { features: { ...g.features, [f]: on } })
    if (r.error) setErr(r.error); else await reload()
  }
  const addGroup = async () => {
    if (!newGroupName.trim()) return
    const r = await createAdminGroup({ name: newGroupName.trim() })
    if (r.error) setErr(r.error); else { setNewGroupName(''); await reload() }
  }
  const delGroup = async (g: AdminGroup) => {
    const r = await deleteAdminGroup(g.id)
    if (r.error) setErr(r.error); else { setErr(null); await reload() }
  }
  const addUser = async () => {
    setErr(null); setNotice(null)
    if (nu.username.trim().length < 2) { setErr('Kullanıcı adı en az 2 karakter.'); return }
    const r = await createAdminUser({ username: nu.username.trim(), password: nu.password || undefined, email: nu.email || undefined, groupId: nu.groupId })
    if (r.error) { setErr(r.error); return }
    if (r.tempPassword) setNotice(`"${nu.username.trim()}" eklendi. Geçici şifre: ${r.tempPassword} (bir kez gösteriliyor)`)
    setNu({ username: '', email: '', password: '', groupId: 'normal' })
    await reload()
  }
  const setUserGroup = async (u: AdminUser, groupId: string) => { await updateAdminUser(u.id, { groupId }); await reload() }
  const delUser = async (u: AdminUser) => { if (window.confirm(`"${u.username}" silinsin mi?`)) { await deleteAdminUser(u.id); await reload() } }
  const resetPassword = async (u: AdminUser) => {
    const pw = window.prompt(`"${u.username}" için yeni şifre (en az 6 karakter):`)
    if (!pw) return
    if (pw.length < 6) { setErr('Şifre en az 6 karakter.'); return }
    const r = await updateAdminUser(u.id, { password: pw })
    if (r.error) setErr(r.error); else setNotice(`"${u.username}" şifresi güncellendi.`)
  }
  const viewShot = async (id: string) => { const r = await getFeedbackScreenshot(id); if (r.feedback?.screenshot) setShot(r.feedback.screenshot) }
  const toggleStatus = async (f: FeedbackItem) => { await setFeedbackStatus(f.id, f.status === 'open' ? 'resolved' : 'open'); await reload() }
  const removeFeedback = async (f: FeedbackItem) => { if (window.confirm('Geri bildirim silinsin mi?')) { await deleteFeedback(f.id); await reload() } }
  const fmtDate = (ms: number) => new Date(ms).toLocaleString('tr-TR')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--felt, #157a40)', color: '#fff7e9', fontFamily: 'system-ui', overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '22px 18px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 26, textShadow: '0 2px 6px rgba(0,0,0,.4)' }}>🛠 Yönetim</h1>
          <button onClick={onBack} style={btnGhost}>← Lobi</button>
        </div>
        {err && <p style={{ color: '#ffb4b4', background: 'rgba(190,45,45,.25)', padding: '8px 12px', borderRadius: 8 }}>{err}</p>}
        {notice && <p style={{ color: '#9be8a8', background: 'rgba(60,160,80,.22)', padding: '8px 12px', borderRadius: 8, wordBreak: 'break-all' }}>{notice}</p>}

        {/* ── Groups × Features matrix ───────────────────────────────────────── */}
        <h2 style={{ fontSize: 18 }}>Kullanıcı Grupları & Özellikler</h2>
        <div style={{ overflowX: 'auto', background: 'rgba(0,0,0,.18)', borderRadius: 10, padding: 6 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 6 }}>
            <thead>
              <tr>
                <th style={cell}>Grup</th>
                {FEATURES.map((f) => <th key={f.id} style={{ ...cell, textAlign: 'center' }} title={f.desc}>{f.label}</th>)}
                <th style={{ ...cell, textAlign: 'center' }}>Admin</th>
                <th style={cell}></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td style={cell}><strong>{g.name}</strong>{g.builtin && <span style={{ opacity: 0.5, fontSize: 11 }}> (yerleşik)</span>}</td>
                  {FEATURES.map((f) => (
                    <td key={f.id} style={{ ...cell, textAlign: 'center' }}>
                      <input type="checkbox" style={{ width: 16, height: 16, cursor: 'pointer' }} checked={g.features[f.id] === true} onChange={(e) => void toggleFeature(g, f.id, e.target.checked)} />
                    </td>
                  ))}
                  <td style={{ ...cell, textAlign: 'center', color: '#ffd27a' }}>{g.isAdmin ? '✓' : ''}</td>
                  <td style={cell}>{!g.builtin && <button onClick={() => void delGroup(g)} style={btnDanger}>Sil</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, margin: '12px 0 26px' }}>
          <input style={input} placeholder="Yeni grup adı" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
          <button onClick={() => void addGroup()} style={btn}>+ Grup Ekle</button>
        </div>

        {/* ── Users ──────────────────────────────────────────────────────────── */}
        <h2 style={{ fontSize: 18 }}>Kullanıcılar</h2>
        <div style={{ overflowX: 'auto', background: 'rgba(0,0,0,.18)', borderRadius: 10, padding: 6 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 6 }}>
            <thead>
              <tr>
                <th style={cell}>Kullanıcı</th>
                <th style={cell}>E-posta</th>
                <th style={cell}>Grup</th>
                <th style={cell}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={cell}>{u.username}</td>
                  <td style={{ ...cell, opacity: 0.7 }}>{u.email ?? '—'}</td>
                  <td style={cell}>
                    <select value={u.groupId} onChange={(e) => void setUserGroup(u, e.target.value)} style={input}>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </td>
                  <td style={{ ...cell, display: 'flex', gap: 6 }}>
                    <button onClick={() => void resetPassword(u)} style={btnGhost}>Şifre</button>
                    <button onClick={() => void delUser(u)} style={btnDanger}>Sil</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <input style={input} placeholder="Kullanıcı adı" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} />
          <input style={input} placeholder="E-posta" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
          <input style={input} placeholder="Şifre (boşsa rastgele)" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
          <select style={input} value={nu.groupId} onChange={(e) => setNu({ ...nu, groupId: e.target.value })}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button onClick={() => void addUser()} style={btn}>+ Kullanıcı Ekle</button>
        </div>

        {/* ── Feedback (bug reports + suggestions) ──────────────────────────── */}
        <h2 style={{ fontSize: 18, marginTop: 30 }}>Geri Bildirimler ({feedback.length})</h2>
        {feedback.length === 0 ? (
          <p style={{ opacity: 0.7 }}>Henüz geri bildirim yok.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {feedback.map((f) => (
              <div key={f.id} style={{ background: 'rgba(0,0,0,.2)', borderRadius: 10, padding: '10px 12px', opacity: f.status === 'resolved' ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                  <span style={{ fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: f.kind === 'bug' ? 'rgba(200,70,50,.9)' : 'rgba(240,181,62,.95)', color: f.kind === 'bug' ? '#fff' : '#3a2400' }}>
                    {f.kind === 'bug' ? '🐞 Hata' : '💡 Öneri'}{f.category ? ` · ${f.category}` : ''}
                  </span>
                  <span style={{ opacity: 0.85 }}>👤 {f.username ?? 'bilinmiyor'}</span>
                  <span style={{ opacity: 0.6 }}>{fmtDate(f.createdAt)}</span>
                  {f.status === 'resolved' && <span style={{ color: '#9be8a8' }}>✓ çözüldü</span>}
                  <span style={{ flex: 1 }} />
                  {f.hasScreenshot && <button onClick={() => void viewShot(f.id)} style={btnGhost}>🖼 Ekran</button>}
                  <button onClick={() => void toggleStatus(f)} style={btnGhost}>{f.status === 'open' ? 'Çözüldü' : 'Aç'}</button>
                  <button onClick={() => void removeFeedback(f)} style={btnDanger}>Sil</button>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 14, whiteSpace: 'pre-wrap' }}>{f.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {shot && (
        <div onClick={() => setShot(null)} style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <img src={shot} alt="ekran görüntüsü" style={{ maxWidth: '95%', maxHeight: '92%', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,.6)' }} />
        </div>
      )}
    </div>
  )
}
