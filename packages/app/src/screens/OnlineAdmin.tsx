import { useEffect, useState, useCallback } from 'react'
import { FEATURES, type Feature } from '../auth'
import {
  listAdminUsers, listAdminGroups, createAdminUser, updateAdminUser, deleteAdminUser,
  createAdminGroup, updateAdminGroup, deleteAdminGroup,
  type AdminGroup, type AdminUser,
} from '../net/adminClient'

/**
 * SERVER-backed admin panel for the online app (visible only to an isAdmin group).
 * Manage user GROUPS + their per-feature flags, and USER accounts (add / delete /
 * reassign group / reset password) — all via the /admin API. Distinct from the
 * offline Admin.tsx which writes localStorage.
 */
export default function OnlineAdmin({ onBack }: { onBack: () => void }) {
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [nu, setNu] = useState({ username: '', email: '', password: '', groupId: 'normal' })

  const reload = useCallback(async () => {
    const [g, u] = await Promise.all([listAdminGroups(), listAdminUsers()])
    setGroups(g.groups ?? [])
    setUsers(u.users ?? [])
  }, [])
  useEffect(() => { void reload() }, [reload])

  const cell: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,.15)', textAlign: 'left' }
  const input: React.CSSProperties = { padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(0,0,0,.25)', color: 'inherit' }

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
  const delUser = async (u: AdminUser) => { await deleteAdminUser(u.id); await reload() }
  const resetPassword = async (u: AdminUser) => {
    const pw = window.prompt(`"${u.username}" için yeni şifre (en az 6 karakter):`)
    if (!pw) return
    if (pw.length < 6) { setErr('Şifre en az 6 karakter.'); return }
    const r = await updateAdminUser(u.id, { password: pw })
    if (r.error) setErr(r.error); else setNotice(`"${u.username}" şifresi güncellendi.`)
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20, fontFamily: 'system-ui', color: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>🛠 Yönetim</h1>
        <button onClick={onBack}>← Lobi</button>
      </div>
      {err && <p style={{ color: '#f08a8a' }}>{err}</p>}
      {notice && <p style={{ color: '#7BE38B', wordBreak: 'break-all' }}>{notice}</p>}

      {/* ── Groups × Features matrix ───────────────────────────────────────── */}
      <h2 style={{ fontSize: 18 }}>Kullanıcı Grupları & Özellikler</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 10 }}>
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
                    <input type="checkbox" checked={g.features[f.id] === true} onChange={(e) => void toggleFeature(g, f.id, e.target.checked)} />
                  </td>
                ))}
                <td style={{ ...cell, textAlign: 'center', opacity: 0.7 }}>{g.isAdmin ? '✓' : ''}</td>
                <td style={cell}>{!g.builtin && <button onClick={() => void delGroup(g)} style={{ fontSize: 12 }}>Sil</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
        <input style={input} placeholder="Yeni grup adı" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
        <button onClick={() => void addGroup()}>+ Grup Ekle</button>
      </div>

      {/* ── Users ──────────────────────────────────────────────────────────── */}
      <h2 style={{ fontSize: 18 }}>Kullanıcılar</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 10 }}>
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
                  <button onClick={() => void resetPassword(u)} style={{ fontSize: 12 }}>Şifre</button>
                  <button onClick={() => void delUser(u)} style={{ fontSize: 12 }}>Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={input} placeholder="Kullanıcı adı" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} />
        <input style={input} placeholder="E-posta" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
        <input style={input} placeholder="Şifre (boşsa rastgele)" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
        <select style={input} value={nu.groupId} onChange={(e) => setNu({ ...nu, groupId: e.target.value })}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button onClick={() => void addUser()}>+ Kullanıcı Ekle</button>
      </div>
    </div>
  )
}
