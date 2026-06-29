// packages/app/src/net/authClient.ts
// Talks to the server's /auth API. The refresh token lives in an httpOnly cookie
// (set by the server); the access token is held HERE in memory only (never
// localStorage). On boot, refresh() silently restores the session from the cookie —
// this is the client half of "oturum kaybolmasın".
export interface ServerUser {
  id: string
  username: string
  email?: string
  groupId: string
  isAdmin: boolean
  features: Record<string, boolean>
}

const BASE: string =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ||
  (import.meta.env.DEV ? 'http://localhost:8787' : '')

let accessToken: string | null = null
export const getAccessToken = (): string | null => accessToken
export const serverBase = (): string => BASE

interface AuthResp { user: ServerUser; accessToken: string }
export type AuthOutcome = { ok: true; user: ServerUser } | { ok: false; error: string }

async function authPost(path: string, body: Record<string, unknown> = {}, csrf = false): Promise<AuthOutcome> {
  try {
    const res = await fetch(BASE + path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf': '1' } : {}) },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as Partial<AuthResp> & { error?: string }
    if (!res.ok || !data.accessToken || !data.user) return { ok: false, error: data.error ?? 'Hata' }
    accessToken = data.accessToken
    return { ok: true, user: data.user }
  } catch {
    return { ok: false, error: 'Sunucuya ulaşılamadı.' }
  }
}

export const register = (username: string, password: string, email?: string, remember?: boolean) =>
  authPost('/auth/register', { username, password, email, remember })
export const login = (username: string, password: string, remember?: boolean) =>
  authPost('/auth/login', { username, password, remember })
export const guest = () => authPost('/auth/guest', {})

/** Silent session restore from the refresh cookie. Returns the user or null. */
export async function refresh(): Promise<ServerUser | null> {
  const r = await authPost('/auth/refresh', {}, true)
  return r.ok ? r.user : null
}

export async function logout(): Promise<void> {
  accessToken = null
  try { await fetch(BASE + '/auth/logout', { method: 'POST', credentials: 'include' }) } catch { /* ignore */ }
}

export async function getMe(): Promise<ServerUser | null> {
  if (!accessToken) return null
  try {
    const res = await fetch(BASE + '/auth/me', { headers: { authorization: `Bearer ${accessToken}` } })
    if (!res.ok) return null
    return (await res.json()).user as ServerUser
  } catch {
    return null
  }
}
