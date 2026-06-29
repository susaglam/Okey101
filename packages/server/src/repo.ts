// packages/server/src/repo.ts
// Typed data access over SQLite. ALL queries use prepared statements (no string
// interpolation) — the only DB surface the rest of the server uses.
import { db, FEATURE_IDS, type Feature } from './db.ts'
import type { UserGroup, UserAccount, PublicUser } from './types.ts'

// ── row → domain ──────────────────────────────────────────────────────────────
interface GroupRow { id: string; name: string; features: string; is_admin: number; builtin: number }
interface UserRow { id: string; username: string; email: string | null; password_hash: string; group_id: string; created_at: number }

function normFeatures(json: string): Record<Feature, boolean> {
  let parsed: Record<string, unknown> = {}
  try { parsed = JSON.parse(json) as Record<string, unknown> } catch { /* default below */ }
  return Object.fromEntries(FEATURE_IDS.map((f) => [f, parsed[f] === true])) as Record<Feature, boolean>
}
const toGroup = (r: GroupRow): UserGroup =>
  ({ id: r.id, name: r.name, features: normFeatures(r.features), isAdmin: r.is_admin === 1, builtin: r.builtin === 1 })
const toUser = (r: UserRow): UserAccount =>
  ({ id: r.id, username: r.username, email: r.email ?? undefined, groupId: r.group_id, createdAt: r.created_at })

// ── Groups ────────────────────────────────────────────────────────────────────
export function listGroups(): UserGroup[] {
  return (db().prepare('SELECT * FROM groups').all() as GroupRow[]).map(toGroup)
}
export function getGroup(id: string): UserGroup | undefined {
  const r = db().prepare('SELECT * FROM groups WHERE id = ?').get(id) as GroupRow | undefined
  return r ? toGroup(r) : undefined
}
export function upsertGroup(g: UserGroup): void {
  db().prepare(
    `INSERT INTO groups (id, name, features, is_admin, builtin) VALUES (@id, @name, @features, @is_admin, @builtin)
     ON CONFLICT(id) DO UPDATE SET name=@name, features=@features, is_admin=@is_admin`,
  ).run({ id: g.id, name: g.name, features: JSON.stringify(g.features), is_admin: g.isAdmin ? 1 : 0, builtin: g.builtin ? 1 : 0 })
}
export function deleteGroup(id: string): void {
  const tx = db().transaction((gid: string) => {
    db().prepare("UPDATE users SET group_id = 'normal' WHERE group_id = ?").run(gid)
    db().prepare('DELETE FROM groups WHERE id = ? AND builtin = 0').run(gid)
  })
  tx(id)
}

// ── Users ─────────────────────────────────────────────────────────────────────
export function listUsers(): UserAccount[] {
  return (db().prepare('SELECT * FROM users ORDER BY created_at').all() as UserRow[]).map(toUser)
}
export function getUserById(id: string): UserAccount | undefined {
  const r = db().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
  return r ? toUser(r) : undefined
}
/** Internal: includes the password hash (login only). */
export function getUserRowByUsername(username: string): UserRow | undefined {
  return db().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as UserRow | undefined
}
export function usernameTaken(username: string, exceptId?: string): boolean {
  const r = getUserRowByUsername(username)
  return r != null && r.id !== exceptId
}
export function insertUser(u: { id: string; username: string; email?: string; passwordHash: string; groupId: string }): void {
  db().prepare('INSERT INTO users (id, username, email, password_hash, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(u.id, u.username, u.email ?? null, u.passwordHash, u.groupId, Date.now())
}
export function updateUser(id: string, patch: { username?: string; email?: string | null; groupId?: string; passwordHash?: string }): void {
  const cur = db().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
  if (!cur) return
  db().prepare('UPDATE users SET username=?, email=?, group_id=?, password_hash=? WHERE id=?').run(
    patch.username ?? cur.username,
    patch.email !== undefined ? patch.email : cur.email,
    patch.groupId ?? cur.group_id,
    patch.passwordHash ?? cur.password_hash,
    id,
  )
}
export function deleteUser(id: string): void {
  db().prepare('DELETE FROM users WHERE id = ?').run(id)
}

// ── Resolve a user to the client-safe shape (with their group's features) ───────
export function publicUser(u: UserAccount): PublicUser {
  const g = getGroup(u.groupId) ?? getGroup('guest')!
  return { id: u.id, username: u.username, email: u.email, groupId: u.groupId, isAdmin: g.isAdmin, features: g.features }
}
