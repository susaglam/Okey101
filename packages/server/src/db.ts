// packages/server/src/db.ts
// SQLite persistence (synchronous, better-sqlite3). Holds users, groups, lobby
// tables and in-progress games so everything survives a server restart and is
// shared across all connected clients. Local dev uses a file under data/.
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'

// ── Feature flags / seed groups (mirrors the client's auth.ts; will be the single
//    source once the client talks to the server). ──────────────────────────────
export type Feature = 'islekMarkers' | 'hint' | 'dragAssists'
export const FEATURE_IDS: Feature[] = ['islekMarkers', 'hint', 'dragAssists']
const allFeatures = (on: boolean) =>
  Object.fromEntries(FEATURE_IDS.map((f) => [f, on])) as Record<Feature, boolean>

const SEED_GROUPS = [
  { id: 'guest', name: 'Misafir', features: allFeatures(false), is_admin: 0, builtin: 1 },
  { id: 'normal', name: 'Normal', features: allFeatures(true), is_admin: 0, builtin: 1 },
  { id: 'premium', name: 'Premium', features: allFeatures(true), is_admin: 0, builtin: 1 },
  { id: 'admin', name: 'Yönetici', features: allFeatures(true), is_admin: 1, builtin: 1 },
]

// Resolve relative to THIS module (packages/server/src) so the DB lands in
// packages/server/data regardless of the process working directory. The special
// ':memory:' value is passed through verbatim (used by tests) — never resolved.
const HERE = dirname(fileURLToPath(import.meta.url))
function dbPath(): string {
  const env = process.env.CS_OKEY_DB
  if (env === ':memory:') return ':memory:'
  return env ? resolve(env) : resolve(HERE, '../data/cs-okey.sqlite')
}

let _db: Database.Database | null = null

/** Close + forget the singleton (tests only) so the next db() opens a fresh DB. */
export function _closeDbForTests(): void {
  if (_db) { try { _db.close() } catch { /* ignore */ } _db = null }
}

export function db(): Database.Database {
  if (_db) return _db
  const DB_PATH = dbPath()
  if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true })
  const d = new Database(DB_PATH)
  d.pragma('journal_mode = WAL')        // concurrent reads while writing
  d.pragma('synchronous = NORMAL')      // durable across app crashes, much faster (safe with WAL)
  d.pragma('busy_timeout = 5000')       // wait instead of throwing SQLITE_BUSY under contention
  d.pragma('foreign_keys = ON')
  d.exec(SCHEMA)
  seed(d)
  _db = d
  return d
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  features TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  builtin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  group_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY,
  host_user_id TEXT,
  mode TEXT NOT NULL,
  name TEXT NOT NULL,
  access TEXT NOT NULL,
  status TEXT NOT NULL,
  seats TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
  table_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  version INTEGER NOT NULL,
  standings TEXT NOT NULL,
  history TEXT NOT NULL,
  seed INTEGER NOT NULL,
  scored_hand_no INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Refresh-token sessions: the persistence backbone ("oturum kaybolmasın"). One row
-- per issued refresh token; we store only its sha256 hash. family_id ties a login
-- lineage together so a replayed (rotated) token can revoke the whole family.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  refresh_hash TEXT NOT NULL UNIQUE,
  prev_hash TEXT,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  revoked_at INTEGER,
  user_agent TEXT,
  remember INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_family ON sessions (family_id);
`

function seed(d: Database.Database): void {
  const haveGroups = (d.prepare('SELECT COUNT(*) AS n FROM groups').get() as { n: number }).n
  if (haveGroups === 0) {
    const ins = d.prepare('INSERT INTO groups (id, name, features, is_admin, builtin) VALUES (?, ?, ?, ?, ?)')
    for (const g of SEED_GROUPS) ins.run(g.id, g.name, JSON.stringify(g.features), g.is_admin, g.builtin)
  }
  const haveAdmin = (d.prepare("SELECT COUNT(*) AS n FROM users WHERE group_id = 'admin'").get() as { n: number }).n
  if (haveAdmin === 0) {
    // First-boot admin. The password comes from ADMIN_PASSWORD (set it in Coolify);
    // locally it falls back to "admin" with a warning so admin/admin never ships.
    const pw = process.env.ADMIN_PASSWORD ?? 'admin'
    if (!process.env.ADMIN_PASSWORD) {
      console.warn('[seed] ADMIN_PASSWORD not set — seeding admin/admin for LOCAL dev only. Set ADMIN_PASSWORD in production.')
    }
    const cost = Number(process.env.BCRYPT_COST ?? 12)
    d.prepare('INSERT INTO users (id, username, email, password_hash, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('u-admin', process.env.ADMIN_USERNAME ?? 'admin', null, bcrypt.hashSync(pw, cost), 'admin', Date.now())
  }
}
