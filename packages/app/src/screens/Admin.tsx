import { useState } from 'react'
import {
  loadGroups, loadUsers, FEATURES,
  adminAddUser, adminUpdateUser, adminDeleteUser,
  adminAddGroup, adminDeleteGroup, adminSetGroupFeature,
  type UserGroup, type UserAccount,
} from '../auth'

/**
 * Admin panel (visible only to a group with isAdmin). Manage user GROUPS and their
 * per-feature flags (the group×feature matrix), and the USER accounts (add / delete /
 * reassign group). All local-first today — every change writes localStorage via the
 * auth admin functions; swap those for a server API later without touching this UI.
 */
export default function Admin({ onBack }: { onBack: () => void }) {
  const [, force] = useState(0)
  const refresh = () => force((n) => n + 1)
  const groups = loadGroups()
  const users = loadUsers()

  const [newGroupName, setNewGroupName] = useState('')
  const [nu, setNu] = useState({ username: '', email: '', password: '', groupId: 'normal' })
  const [err, setErr] = useState<string | null>(null)

  const cell: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,.15)', textAlign: 'left' }
  const input: React.CSSProperties = { padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(0,0,0,.25)', color: 'inherit' }

  const addGroup = () => { if (newGroupName.trim()) { adminAddGroup(newGroupName); setNewGroupName(''); refresh() } }
  const delGroup = (g: UserGroup) => { const r = adminDeleteGroup(g.id); if (!r.ok) setErr(r.error ?? null); else { setErr(null); refresh() } }
  const addUser = () => {
    const r = adminAddUser(nu.username, nu.password, nu.groupId, nu.email)
    if (!r.ok) { setErr(r.error ?? null); return }
    setErr(null); setNu({ username: '', email: '', password: '', groupId: 'normal' }); refresh()
  }
  const setUserGroup = (u: UserAccount, groupId: string) => { adminUpdateUser(u.id, { groupId }); refresh() }
  const delUser = (u: UserAccount) => { adminDeleteUser(u.id); refresh() }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: 20, fontFamily: 'system-ui', color: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>🛠 Admin</h1>
        <button onClick={onBack}>← Menü</button>
      </div>
      {err && <p style={{ color: '#f08a8a' }}>{err}</p>}

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
                    <input
                      type="checkbox"
                      checked={g.features[f.id] === true}
                      onChange={(e) => { adminSetGroupFeature(g.id, f.id, e.target.checked); refresh() }}
                    />
                  </td>
                ))}
                <td style={{ ...cell, textAlign: 'center', opacity: 0.7 }}>{g.isAdmin ? '✓' : ''}</td>
                <td style={cell}>
                  {!g.builtin && <button onClick={() => delGroup(g)} style={{ fontSize: 12 }}>Sil</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
        <input style={input} placeholder="Yeni grup adı" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
        <button onClick={addGroup}>+ Grup Ekle</button>
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
                  <select value={u.groupId} onChange={(e) => setUserGroup(u, e.target.value)} style={input}>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </td>
                <td style={cell}><button onClick={() => delUser(u)} style={{ fontSize: 12 }}>Sil</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={input} placeholder="Kullanıcı adı" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} />
        <input style={input} placeholder="E-posta" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
        <input style={input} placeholder="Şifre" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
        <select style={input} value={nu.groupId} onChange={(e) => setNu({ ...nu, groupId: e.target.value })}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button onClick={addUser}>+ Kullanıcı Ekle</button>
      </div>
    </div>
  )
}
