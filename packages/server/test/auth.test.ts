import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Set env BEFORE importing the server modules (they read it at load): in-memory DB,
// cheap bcrypt, test logging off.
process.env.NODE_ENV = 'test'
process.env.CS_OKEY_DB = ':memory:'
process.env.BCRYPT_COST = '4'

const { buildApp } = await import('../src/app.ts')
const { _closeDbForTests } = await import('../src/db.ts')
const sessions = await import('../src/auth/sessions.ts')

let app: FastifyInstance
beforeEach(async () => { _closeDbForTests(); app = await buildApp() })
afterEach(async () => { await app.close() })

const register = (username: string, password: string, extra: Record<string, unknown> = {}) =>
  app.inject({ method: 'POST', url: '/auth/register', payload: { username, password, ...extra } })
const rtCookie = (res: Awaited<ReturnType<typeof register>>) => res.cookies.find((c) => c.name === 'csok_rt')

describe('auth HTTP — register / login / guest', () => {
  it('registers a normal user, returns an access token + safe user, sets the refresh cookie', async () => {
    const res = await register('Ayse', 'sifre12')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.accessToken).toBeTruthy()
    expect(body.user.groupId).toBe('normal')
    expect(body.user.isAdmin).toBe(false)
    expect(body.user.features.islekMarkers).toBe(true) // normal sees the assists
    expect(JSON.stringify(body.user)).not.toContain('password') // never leak the hash
    const c = rtCookie(res)
    expect(c?.httpOnly).toBe(true)
    expect(c?.path).toBe('/auth')
  })

  it('rejects a duplicate username and a too-short password', async () => {
    await register('Mehmet', 'sifre12')
    expect((await register('mehmet', 'sifre12')).statusCode).toBe(400) // case-insensitive dupe
    expect((await register('Yeni', '123')).statusCode).toBe(400)        // short password
    expect((await register('ab', 'sifre12')).statusCode).toBe(400)       // short username
  })

  it('login: wrong password 401, correct 200', async () => {
    await register('Veli', 'gizli12')
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'Veli', password: 'nope' } })).statusCode).toBe(401)
    const ok = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'Veli', password: 'gizli12' } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().user.username).toBe('Veli')
  })

  it('guest gets a guest-group session with no advantages', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/guest', payload: {} })
    expect(res.statusCode).toBe(200)
    const u = res.json().user
    expect(u.groupId).toBe('guest')
    expect(u.features.islekMarkers).toBe(false)
    expect(u.username).toMatch(/^Misafir-/)
    expect(rtCookie(res)?.httpOnly).toBe(true)
  })
})

describe('auth HTTP — /me and refresh rotation', () => {
  it('/auth/me needs a valid Bearer token', async () => {
    const reg = await register('Selin', 'sifre12')
    const token = reg.json().accessToken
    expect((await app.inject({ method: 'GET', url: '/auth/me' })).statusCode).toBe(401)
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } })
    expect(me.statusCode).toBe(200)
    expect(me.json().user.username).toBe('Selin')
  })

  it('refresh requires the CSRF header, rotates the token, and trips reuse-detection on replay', async () => {
    const reg = await register('Derya', 'sifre12', { remember: true })
    const oldRt = rtCookie(reg)!.value

    // No CSRF header → 403
    expect((await app.inject({ method: 'POST', url: '/auth/refresh', cookies: { csok_rt: oldRt } })).statusCode).toBe(403)

    // Valid refresh → 200 + a NEW refresh cookie
    const r1 = await app.inject({ method: 'POST', url: '/auth/refresh', cookies: { csok_rt: oldRt }, headers: { 'x-csrf': '1' } })
    expect(r1.statusCode).toBe(200)
    expect(r1.json().accessToken).toBeTruthy()
    const newRt = rtCookie(r1)!.value
    expect(newRt).not.toBe(oldRt)

    // Replaying the OLD (rotated) token → 401 reuse-detected, and it kills the family,
    // so even the freshly-issued token is now revoked.
    const reuse = await app.inject({ method: 'POST', url: '/auth/refresh', cookies: { csok_rt: oldRt }, headers: { 'x-csrf': '1' } })
    expect(reuse.statusCode).toBe(401)
    expect(reuse.json().error).toBe('reuse-detected')
    expect((await app.inject({ method: 'POST', url: '/auth/refresh', cookies: { csok_rt: newRt }, headers: { 'x-csrf': '1' } })).statusCode).toBe(401)
  })

  it('logout revokes the session so its refresh token no longer works', async () => {
    const reg = await register('Kaan', 'sifre12')
    const rt = rtCookie(reg)!.value
    await app.inject({ method: 'POST', url: '/auth/logout', cookies: { csok_rt: rt } })
    expect((await app.inject({ method: 'POST', url: '/auth/refresh', cookies: { csok_rt: rt }, headers: { 'x-csrf': '1' } })).statusCode).toBe(401)
  })
})

describe('admin API gating', () => {
  it('blocks non-admins and allows the seeded admin', async () => {
    // A normal user's token is rejected by /admin.
    const normal = (await register('NormalUser', 'sifre12')).json().accessToken
    expect((await app.inject({ method: 'GET', url: '/admin/users', headers: { authorization: `Bearer ${normal}` } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: '/admin/users' })).statusCode).toBe(401)

    // Seeded admin (admin/admin in test — no ADMIN_PASSWORD) can list + mutate.
    const adminTok = (await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'admin', password: 'admin' } })).json().accessToken
    const groups = await app.inject({ method: 'GET', url: '/admin/groups', headers: { authorization: `Bearer ${adminTok}` } })
    expect(groups.statusCode).toBe(200)
    expect(groups.json().groups.map((g: { id: string }) => g.id)).toContain('premium')
  })

  it('admin can flip a group feature flag', async () => {
    const adminTok = (await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'admin', password: 'admin' } })).json().accessToken
    const res = await app.inject({
      method: 'PATCH', url: '/admin/groups/guest',
      headers: { authorization: `Bearer ${adminTok}` },
      payload: { features: { hint: true } },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().group.features.hint).toBe(true)
  })

  it('admin-created user without a password gets a random one-time password (no fixed default)', async () => {
    const adminTok = (await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'admin', password: 'admin' } })).json().accessToken
    const res = await app.inject({
      method: 'POST', url: '/admin/users',
      headers: { authorization: `Bearer ${adminTok}` },
      payload: { username: 'Yenikullanici', groupId: 'normal' },
    })
    expect(res.statusCode).toBe(200)
    const { tempPassword } = res.json()
    expect(typeof tempPassword).toBe('string')
    expect(tempPassword.length).toBeGreaterThanOrEqual(12)
    expect(tempPassword).not.toBe('okey')
    // the minted password works; the old fixed default does NOT
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'Yenikullanici', password: tempPassword } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'Yenikullanici', password: 'okey' } })).statusCode).toBe(401)
  })
})

describe('sessions reuse-detection (unit)', () => {
  it('rotateSession revokes the whole family when a rotated token is replayed', async () => {
    await buildApp() // ensure DB is seeded/open
    const s = sessions.createSession('u-test', { remember: false })
    const r1 = sessions.rotateSession(s.rawRefresh)
    expect(r1.ok).toBe(true)
    const replay = sessions.rotateSession(s.rawRefresh) // old token again
    expect(replay.ok).toBe(false)
    if (!replay.ok) expect(replay.reason).toBe('reuse')
    // the rotated-to token is now dead too
    if (r1.ok) expect(sessions.rotateSession(r1.rawRefresh).ok).toBe(false)
  })
})
