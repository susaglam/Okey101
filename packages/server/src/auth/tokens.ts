// packages/server/src/auth/tokens.ts
// Token crypto: short-lived access JWT (HS256) + opaque random refresh tokens.
// The refresh token is NEVER a JWT and is stored only as a sha256 hash (sessions
// table) — it is meaningless without its DB row, so it is fully revocable.
import jwt from 'jsonwebtoken'
import { randomBytes, createHash } from 'node:crypto'

const isProd = process.env.NODE_ENV === 'production'
const SECRET: string = process.env.JWT_SECRET ?? ''
if (isProd && (!SECRET || SECRET.length < 32)) {
  throw new Error('JWT_SECRET is missing or too short (need ≥32 chars; use `openssl rand -hex 32`).')
}
// Local dev fallback so the server boots without env wiring (NEVER used in prod).
const KEY = SECRET || 'dev-insecure-secret-change-me-0123456789abcdef'

const ACCESS_TTL_SEC = 15 * 60 // 15 minutes

export type UserKind = 'guest' | 'registered'
export interface AccessClaims { sub: string; sid: string; grp: string; kind: UserKind }

export function signAccess(claims: AccessClaims): string {
  return jwt.sign(claims, KEY, { algorithm: 'HS256', expiresIn: ACCESS_TTL_SEC })
}

/** Verify an access JWT. Returns the claims, or null if invalid/expired. */
export function verifyAccess(token: string): AccessClaims | null {
  try {
    const d = jwt.verify(token, KEY, { algorithms: ['HS256'], clockTolerance: 30 })
    if (typeof d !== 'object' || d == null) return null
    const o = d as Record<string, unknown>
    if (typeof o.sub !== 'string' || typeof o.sid !== 'string' || typeof o.grp !== 'string') return null
    return { sub: o.sub, sid: o.sid, grp: o.grp, kind: o.kind === 'guest' ? 'guest' : 'registered' }
  } catch {
    return null
  }
}

/** A fresh opaque refresh token (256-bit) + its storage hash. */
export function newRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url')
  return { raw, hash: hashToken(raw) }
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export const ACCESS_TTL_SECONDS = ACCESS_TTL_SEC
