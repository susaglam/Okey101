// packages/server/src/auth/sessions.ts
// The sessions table is the persistence backbone for "oturum kaybolmasın": it lives
// in SQLite (on a volume), so logins survive reloads, restarts and redeploys. Refresh
// tokens ROTATE on every use and replaying a rotated token trips reuse-detection and
// revokes the whole login family.
import { randomUUID } from 'node:crypto'
import { db } from '../db.ts'
import { newRefreshToken, hashToken } from './tokens.ts'

const DAY = 24 * 60 * 60 * 1000
const GUEST_TTL = 7 * DAY
const DEFAULT_TTL = DAY
const REMEMBER_TTL = 30 * DAY
const ABSOLUTE_CAP = 90 * DAY

interface SessionRow {
  id: string; user_id: string; family_id: string; refresh_hash: string; prev_hash: string | null
  issued_at: number; expires_at: number; last_used_at: number; revoked_at: number | null; remember: number
}

export interface IssuedSession { sessionId: string; rawRefresh: string; expiresAt: number }

function ttlFor(opts: { remember?: boolean; guest?: boolean }): number {
  if (opts.guest) return GUEST_TTL
  return opts.remember ? REMEMBER_TTL : DEFAULT_TTL
}

/** Open a new session lineage for a user and return the raw refresh token (shown once). */
export function createSession(userId: string, opts: { remember?: boolean; guest?: boolean; userAgent?: string } = {}): IssuedSession {
  const { raw, hash } = newRefreshToken()
  const now = Date.now()
  const expiresAt = now + ttlFor(opts)
  const id = randomUUID()
  db().prepare(
    `INSERT INTO sessions (id, user_id, family_id, refresh_hash, prev_hash, issued_at, expires_at, last_used_at, revoked_at, user_agent, remember)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?)`,
  ).run(id, userId, randomUUID(), hash, now, expiresAt, now, opts.userAgent ?? null, opts.remember ? 1 : 0)
  return { sessionId: id, rawRefresh: raw, expiresAt }
}

export type RotateResult =
  | { ok: true; userId: string; sessionId: string; rawRefresh: string; expiresAt: number; remember: boolean }
  | { ok: false; reason: 'unknown' | 'expired' | 'reuse' }

/**
 * Rotate a refresh token: issue a new one in the same family, revoke the old. If the
 * presented token was already revoked (i.e. someone replayed a rotated token), this is
 * a theft signal — revoke the entire family and refuse.
 */
export function rotateSession(rawToken: string, userAgent?: string): RotateResult {
  const d = db()
  const hash = hashToken(rawToken)
  const row = d.prepare('SELECT * FROM sessions WHERE refresh_hash = ?').get(hash) as SessionRow | undefined
  if (!row) return { ok: false, reason: 'unknown' }
  if (row.revoked_at != null) {
    // Reuse of a rotated/revoked token → compromise. Nuke the family.
    d.prepare('UPDATE sessions SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL').run(Date.now(), row.family_id)
    return { ok: false, reason: 'reuse' }
  }
  const now = Date.now()
  if (row.expires_at < now) return { ok: false, reason: 'expired' }

  const next = newRefreshToken()
  const remember = row.remember === 1
  const expiresAt = Math.min(row.issued_at + ABSOLUTE_CAP, now + ttlFor({ remember }))
  const id = randomUUID()
  const tx = d.transaction(() => {
    d.prepare('UPDATE sessions SET revoked_at = ?, last_used_at = ? WHERE id = ?').run(now, now, row.id)
    d.prepare(
      `INSERT INTO sessions (id, user_id, family_id, refresh_hash, prev_hash, issued_at, expires_at, last_used_at, revoked_at, user_agent, remember)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(id, row.user_id, row.family_id, next.hash, row.refresh_hash, row.issued_at, expiresAt, now, userAgent ?? null, row.remember)
  })
  tx()
  return { ok: true, userId: row.user_id, sessionId: id, rawRefresh: next.raw, expiresAt, remember }
}

/** Revoke a single session by its raw refresh token (this-device logout). */
export function revokeByRaw(rawToken: string): void {
  db().prepare('UPDATE sessions SET revoked_at = ? WHERE refresh_hash = ? AND revoked_at IS NULL').run(Date.now(), hashToken(rawToken))
}

/** Revoke every session for a user (logout everywhere / ban). */
export function revokeAllForUser(userId: string): void {
  db().prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(Date.now(), userId)
}

/** Best-effort cleanup of expired/long-revoked rows. */
export function pruneSessions(): void {
  const now = Date.now()
  db().prepare('DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)').run(now, now - 7 * DAY)
}
