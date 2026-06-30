// packages/app/src/auth.ts
//
// LOCAL-FIRST identity / user-group / feature-flag layer. There is NO backend yet:
// accounts, groups and the current session all live in localStorage, and the
// "password hash" is a non-cryptographic digest (it only avoids storing plaintext —
// it is NOT secure). The whole module is a single seam: when a server arrives, swap
// these functions for API calls and the rest of the app (login screen, gating,
// admin panel) keeps working unchanged.

// ─── Feature flags (gateable advantages) ──────────────────────────────────────

/** A player-facing assist that a user group may grant or withhold. Extensible. */
export type Feature = 'islekMarkers' | 'hint' | 'dragAssists' | 'okeyHelper'

export const FEATURES: { id: Feature; label: string; desc: string }[] = [
  { id: 'islekMarkers', label: 'İşlek işaretleri', desc: 'Yere açınca eldeki işlenebilir taşların kırmızı nokta işareti' },
  { id: 'hint', label: 'İpucu', desc: '💡 İpucu — atılacak taşı öneren düğme' },
  { id: 'dragAssists', label: 'Sürükle yardımları', desc: 'Sürüklerken yeşil hedef çerçeveleri (oto-İşle herkeste açık)' },
  { id: 'okeyHelper', label: 'Okey vurgusu', desc: 'Eldeki okey arkası dönük (kapalı) gösterilir, kolayca fark edilir. Kapalıysa kendi renk/sayısıyla görünür' },
]
export const FEATURE_IDS: Feature[] = FEATURES.map((f) => f.id)

const allFeatures = (on: boolean): Record<Feature, boolean> =>
  Object.fromEntries(FEATURE_IDS.map((f) => [f, on])) as Record<Feature, boolean>

// ─── Data shapes ──────────────────────────────────────────────────────────────

export interface UserGroup {
  id: string
  name: string
  features: Record<Feature, boolean>
  /** Grants access to the admin panel. */
  isAdmin?: boolean
  /** Built-in groups cannot be deleted (but their features stay editable). */
  builtin?: boolean
}

export interface UserAccount {
  id: string
  username: string
  email?: string
  /** Non-secure local digest of the password — replace with real auth + a server. */
  passwordHash: string
  groupId: string
  createdAt: number
}

/** The resolved current player (registered account OR an ephemeral guest). */
export interface CurrentUser {
  id: string
  name: string
  kind: 'guest' | 'registered'
  group: UserGroup
  isAdmin: boolean
}

// ─── Seed data (the PO-selected gated features) ───────────────────────────────
// Seed: the three selected assists are OFF for guests, ON for normal/premium/admin.
// The whole matrix is fully editable from the admin panel afterwards.

const SEED_GROUPS: UserGroup[] = [
  { id: 'guest', name: 'Misafir', features: allFeatures(false), builtin: true },
  { id: 'normal', name: 'Normal', features: allFeatures(true), builtin: true },
  { id: 'premium', name: 'Premium', features: allFeatures(true), builtin: true },
  { id: 'admin', name: 'Yönetici', features: allFeatures(true), isAdmin: true, builtin: true },
]

const GUEST_GROUP: UserGroup = SEED_GROUPS[0]!

// ─── localStorage plumbing ────────────────────────────────────────────────────

const USERS_KEY = 'cs-okey-users'
const GROUPS_KEY = 'cs-okey-groups'
const SESSION_KEY = 'cs-okey-session'

const hasLS = () => typeof localStorage !== 'undefined'

function readJson<T>(key: string, fallback: T): T {
  if (!hasLS()) return fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (!hasLS()) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // best-effort
  }
}

/** Stable id; crypto.randomUUID with a fallback for old/test environments. */
function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch { /* fall through */ }
  return 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36)
}

/** Non-cryptographic digest — local-only, NOT secure. */
function hashPassword(pw: string): string {
  let h = 5381
  for (let i = 0; i < pw.length; i++) h = ((h << 5) + h + pw.charCodeAt(i)) | 0
  return 'h' + (h >>> 0).toString(36)
}

// ─── Groups ───────────────────────────────────────────────────────────────────

export function loadGroups(): UserGroup[] {
  const stored = readJson<UserGroup[] | null>(GROUPS_KEY, null)
  if (!Array.isArray(stored) || stored.length === 0) {
    writeJson(GROUPS_KEY, SEED_GROUPS)
    return SEED_GROUPS.map((g) => ({ ...g, features: { ...g.features } }))
  }
  // Normalise: ensure every feature key exists on every group (new features default off).
  return stored.map((g) => ({
    ...g,
    features: Object.fromEntries(FEATURE_IDS.map((f) => [f, g.features?.[f] ?? false])) as Record<Feature, boolean>,
  }))
}

export function saveGroups(groups: UserGroup[]): void {
  writeJson(GROUPS_KEY, groups)
}

export function getGroup(id: string): UserGroup {
  return loadGroups().find((g) => g.id === id) ?? GUEST_GROUP
}

// ─── Users ──────────────────────────────────────────────────────────────────

function ensureSeedAdmin(users: UserAccount[]): UserAccount[] {
  if (users.some((u) => u.groupId === 'admin')) return users
  // Seed a local admin so the PO can reach the admin panel. Local-only credentials:
  // username "admin", password "admin" — change/remove once a real backend exists.
  const admin: UserAccount = {
    id: newId(), username: 'admin', passwordHash: hashPassword('admin'),
    groupId: 'admin', createdAt: 0,
  }
  const next = [admin, ...users]
  writeJson(USERS_KEY, next)
  return next
}

export function loadUsers(): UserAccount[] {
  return ensureSeedAdmin(readJson<UserAccount[]>(USERS_KEY, []))
}

export function saveUsers(users: UserAccount[]): void {
  writeJson(USERS_KEY, users)
}

const normUser = (s: string) => s.trim().toLowerCase()

export interface AuthResult { ok: boolean; error?: string; user?: UserAccount }

/** Register a new account (auto-assigned the 'normal' group) and sign in. */
export function register(username: string, password: string, email?: string): AuthResult {
  const name = username.trim()
  if (name.length < 2) return { ok: false, error: 'Kullanıcı adı en az 2 karakter olmalı.' }
  if (password.length < 3) return { ok: false, error: 'Şifre en az 3 karakter olmalı.' }
  const users = loadUsers()
  if (users.some((u) => normUser(u.username) === normUser(name))) {
    return { ok: false, error: 'Bu kullanıcı adı zaten alınmış.' }
  }
  const user: UserAccount = {
    id: newId(), username: name, email: email?.trim() || undefined,
    passwordHash: hashPassword(password), groupId: 'normal', createdAt: Date.now(),
  }
  saveUsers([...users, user])
  setSession(user.id)
  return { ok: true, user }
}

/** Sign in with username + password. */
export function login(username: string, password: string): AuthResult {
  const users = loadUsers()
  const user = users.find((u) => normUser(u.username) === normUser(username))
  if (!user || user.passwordHash !== hashPassword(password)) {
    return { ok: false, error: 'Kullanıcı adı veya şifre hatalı.' }
  }
  setSession(user.id)
  return { ok: true, user }
}

// ─── Session ──────────────────────────────────────────────────────────────────

interface SessionData { userId: string | null }

function setSession(userId: string | null): void {
  writeJson(SESSION_KEY, { userId } satisfies SessionData)
}

/** Sign in as an anonymous guest (no account; name is fixed until they register). */
export function loginAsGuest(): void {
  setSession(null)
}

export function logout(): void {
  if (hasLS()) try { localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}

/** Is anyone signed in (guest or registered)? Used to gate the login screen. */
export function hasSession(): boolean {
  return hasLS() && localStorage.getItem(SESSION_KEY) !== null
}

const GUEST_USER = (): CurrentUser => ({
  id: 'guest', name: 'Misafir', kind: 'guest', group: getGroup('guest'), isAdmin: false,
})

/** The resolved current player, or null if nobody has entered yet. */
export function currentUser(): CurrentUser | null {
  if (!hasSession()) return null
  const sess = readJson<SessionData>(SESSION_KEY, { userId: null })
  if (sess.userId == null) return GUEST_USER()
  const account = loadUsers().find((u) => u.id === sess.userId)
  if (!account) return GUEST_USER() // account deleted under us → fall back to guest
  const group = getGroup(account.groupId)
  return { id: account.id, name: account.username, kind: 'registered', group, isAdmin: group.isAdmin === true }
}

/** Does the current player's group grant `feature`? Guests (and absent users) → false. */
export function can(feature: Feature, user: CurrentUser | null = currentUser()): boolean {
  return user?.group.features[feature] === true
}

// ─── Admin operations (mutations used by the admin panel) ─────────────────────

export function adminAddUser(username: string, password: string, groupId: string, email?: string): AuthResult {
  const name = username.trim()
  if (name.length < 2) return { ok: false, error: 'Kullanıcı adı en az 2 karakter olmalı.' }
  const users = loadUsers()
  if (users.some((u) => normUser(u.username) === normUser(name))) {
    return { ok: false, error: 'Bu kullanıcı adı zaten alınmış.' }
  }
  const user: UserAccount = {
    id: newId(), username: name, email: email?.trim() || undefined,
    passwordHash: hashPassword(password || 'okey'), groupId, createdAt: Date.now(),
  }
  saveUsers([...users, user])
  return { ok: true, user }
}

export function adminUpdateUser(id: string, patch: Partial<Pick<UserAccount, 'username' | 'email' | 'groupId'>> & { password?: string }): AuthResult {
  const users = loadUsers()
  const idx = users.findIndex((u) => u.id === id)
  if (idx < 0) return { ok: false, error: 'Kullanıcı bulunamadı.' }
  if (patch.username && users.some((u) => u.id !== id && normUser(u.username) === normUser(patch.username!))) {
    return { ok: false, error: 'Bu kullanıcı adı zaten alınmış.' }
  }
  const cur = users[idx]!
  const next: UserAccount = {
    ...cur,
    username: patch.username?.trim() || cur.username,
    email: patch.email !== undefined ? (patch.email.trim() || undefined) : cur.email,
    groupId: patch.groupId ?? cur.groupId,
    passwordHash: patch.password ? hashPassword(patch.password) : cur.passwordHash,
  }
  const copy = [...users]; copy[idx] = next; saveUsers(copy)
  return { ok: true, user: next }
}

export function adminDeleteUser(id: string): void {
  saveUsers(loadUsers().filter((u) => u.id !== id))
}

export function adminUpsertGroup(group: UserGroup): void {
  const groups = loadGroups()
  const idx = groups.findIndex((g) => g.id === group.id)
  if (idx < 0) saveGroups([...groups, group])
  else { const copy = [...groups]; copy[idx] = group; saveGroups(copy) }
}

export function adminAddGroup(name: string): UserGroup {
  const id = 'grp-' + newId().slice(0, 8)
  const group: UserGroup = { id, name: name.trim() || 'Yeni Grup', features: allFeatures(false) }
  adminUpsertGroup(group)
  return group
}

export function adminDeleteGroup(id: string): { ok: boolean; error?: string } {
  const groups = loadGroups()
  const g = groups.find((x) => x.id === id)
  if (!g) return { ok: false, error: 'Grup bulunamadı.' }
  if (g.builtin) return { ok: false, error: 'Yerleşik grup silinemez.' }
  // Reassign any users in this group back to 'normal'.
  const users = loadUsers().map((u) => (u.groupId === id ? { ...u, groupId: 'normal' } : u))
  saveUsers(users)
  saveGroups(groups.filter((x) => x.id !== id))
  return { ok: true }
}

export function adminSetGroupFeature(groupId: string, feature: Feature, on: boolean): void {
  const groups = loadGroups()
  const g = groups.find((x) => x.id === groupId)
  if (!g) return
  adminUpsertGroup({ ...g, features: { ...g.features, [feature]: on } })
}
