import { describe, it, expect, vi, afterEach } from 'vitest'
import { register, login, refresh, logout, getAccessToken } from '../src/net/authClient'

const okUser = (token: string, username = 'Ayse') => ({
  ok: true,
  json: async () => ({ accessToken: token, user: { id: 'u', username, groupId: 'normal', isAdmin: false, features: {} } }),
})
const fail = (error = 'bad') => ({ ok: false, json: async () => ({ error }) })

afterEach(async () => { vi.restoreAllMocks(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fail())); await logout() })

describe('authClient', () => {
  it('register stores the in-memory access token and returns the user', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okUser('tok-1')))
    const r = await register('Ayse', 'sifre12')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.user.username).toBe('Ayse')
    expect(getAccessToken()).toBe('tok-1')
  })

  it('refresh silently restores a session from the cookie (sends the CSRF header)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okUser('tok-2'))
    vi.stubGlobal('fetch', fetchMock)
    const u = await refresh()
    expect(u?.username).toBe('Ayse')
    expect(getAccessToken()).toBe('tok-2')
    // the refresh call carried the X-CSRF header and credentials
    const [, opts] = fetchMock.mock.calls[0]!
    expect((opts.headers as Record<string, string>)['x-csrf']).toBe('1')
    expect(opts.credentials).toBe('include')
  })

  it('a failed login returns ok:false and clears the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fail('Kullanıcı adı veya şifre hatalı.')))
    const r = await login('Ayse', 'wrong')
    expect(r.ok).toBe(false)
    expect(getAccessToken()).toBeNull()
  })

  it('network failure is reported gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const r = await login('Ayse', 'x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/ulaşılamadı/i)
  })
})
