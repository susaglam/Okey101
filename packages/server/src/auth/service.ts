// packages/server/src/auth/service.ts
// Auth orchestration: register / login / guest / refresh / logout. Passwords are
// bcrypt-hashed on the SERVER (async, off the event loop). Every success opens a
// rotating session and returns an access JWT + a raw refresh token (the route layer
// puts the refresh token in an httpOnly cookie).
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { getUserRowByUsername, usernameTaken, insertUser, getUserById, publicUser } from '../repo.ts'
import { createSession, rotateSession, revokeByRaw } from './sessions.ts'
import { signAccess, type UserKind } from './tokens.ts'
import type { PublicUser } from '../types.ts'

const COST = Number(process.env.BCRYPT_COST ?? 12)
// Fixed dummy hash so login takes ~the same time whether or not the user exists
// (defeats username enumeration via timing).
const DUMMY_HASH = bcrypt.hashSync('cs-okey-dummy', COST)

const RESERVED = new Set(['admin', 'yonetici', 'yönetici', 'sistem', 'system', 'server', 'bot', 'misafir'])

export interface AuthSuccess { user: PublicUser; accessToken: string; refreshToken: string }
export type AuthResult = { ok: true; data: AuthSuccess } | { ok: false; error: string }
export interface IssueOpts { remember?: boolean; userAgent?: string }

function newId(prefix: string): string {
  return prefix + '-' + randomBytes(8).toString('hex')
}

function kindOf(groupId: string): UserKind {
  return groupId === 'guest' ? 'guest' : 'registered'
}

function issue(userId: string, opts: IssueOpts & { guest?: boolean }): AuthSuccess {
  const user = publicUser(getUserById(userId)!)
  const sess = createSession(userId, { remember: opts.remember, guest: opts.guest, userAgent: opts.userAgent })
  const accessToken = signAccess({ sub: userId, sid: sess.sessionId, grp: user.groupId, kind: kindOf(user.groupId) })
  return { user, accessToken, refreshToken: sess.rawRefresh }
}

export function validateUsername(name: string): string | null {
  const n = name.trim()
  if (n.length < 3 || n.length > 20) return 'Kullanıcı adı 3-20 karakter olmalı.'
  if (!/^[\p{L}\p{N}](?:[\p{L}\p{N}_-]*[\p{L}\p{N}])?$/u.test(n)) return 'Kullanıcı adı harf/rakam ile başlamalı; içinde tek _ veya - olabilir.'
  if (RESERVED.has(n.normalize('NFKC').toLowerCase())) return 'Bu kullanıcı adı ayrılmış.'
  return null
}

export function register(username: string, password: string, email: string | undefined, opts: IssueOpts = {}): AuthResult {
  const name = username.trim()
  const uErr = validateUsername(name)
  if (uErr) return { ok: false, error: uErr }
  if (password.length < 6 || password.length > 100) return { ok: false, error: 'Şifre 6-100 karakter olmalı.' }
  if (usernameTaken(name)) return { ok: false, error: 'Bu kullanıcı adı zaten alınmış.' }
  const id = newId('u')
  insertUser({ id, username: name, email: email?.trim() || undefined, passwordHash: bcrypt.hashSync(password, COST), groupId: 'normal' })
  return { ok: true, data: issue(id, opts) }
}

export function login(username: string, password: string, opts: IssueOpts = {}): AuthResult {
  const row = getUserRowByUsername(username.trim())
  // Always run a compare (real or dummy) so timing doesn't reveal whether the user exists.
  const ok = bcrypt.compareSync(password, row?.password_hash || DUMMY_HASH)
  if (!row || !ok || !row.password_hash) return { ok: false, error: 'Kullanıcı adı veya şifre hatalı.' }
  return { ok: true, data: issue(row.id, opts) }
}

export function guest(opts: IssueOpts = {}): AuthResult {
  // A throwaway guest account so the seat/session machinery is uniform. Display name
  // is "Misafir-XXXX"; group 'guest' (no advantages). Cannot log in (empty hash).
  let username = ''
  for (let i = 0; i < 5; i++) {
    const cand = 'Misafir-' + randomBytes(2).toString('hex')
    if (!usernameTaken(cand)) { username = cand; break }
  }
  if (!username) return { ok: false, error: 'Misafir girişi başarısız, tekrar dene.' }
  const id = newId('g')
  insertUser({ id, username, passwordHash: '', groupId: 'guest' })
  return { ok: true, data: issue(id, { ...opts, guest: true }) }
}

export type RefreshResult = { ok: true; data: AuthSuccess } | { ok: false; reuse: boolean }

export function refresh(rawToken: string, userAgent?: string): RefreshResult {
  const r = rotateSession(rawToken, userAgent)
  if (!r.ok) return { ok: false, reuse: r.reason === 'reuse' }
  const account = getUserById(r.userId)
  if (!account) return { ok: false, reuse: false }
  const user = publicUser(account)
  const accessToken = signAccess({ sub: user.id, sid: r.sessionId, grp: user.groupId, kind: kindOf(user.groupId) })
  return { ok: true, data: { user, accessToken, refreshToken: r.rawRefresh } }
}

export function logout(rawToken: string): void {
  revokeByRaw(rawToken)
}
