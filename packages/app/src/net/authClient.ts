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

// De-dupe concurrent refreshes (React StrictMode double-invokes the boot effect; two
// refreshes with the same cookie would rotate once then trip the server's reuse-
// detection on the replayed token and kill the session). One in-flight promise → one
// network rotation, shared by all callers.
let refreshInFlight: Promise<ServerUser | null> | null = null

/** Silent session restore from the refresh cookie. Returns the user or null.
 *  On failure (e.g. a stale token after a redeploy), clear the in-memory access
 *  token so the app falls cleanly back to the login screen instead of carrying a
 *  dead token into socket/admin calls. */
export function refresh(): Promise<ServerUser | null> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = authPost('/auth/refresh', {}, true)
    .then((r) => {
      if (r.ok) return r.user
      accessToken = null
      return null
    })
    .finally(() => { refreshInFlight = null })
  return refreshInFlight
}

/** Authenticated fetch for the /admin API: sends the Bearer access token and, on a
 *  401 (expired access token), refreshes ONCE via the cookie and retries. Returns the
 *  parsed JSON (or { error } on failure). */
export async function adminFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  // Only declare a JSON body when there actually IS one — Fastify rejects an empty
  // body sent with Content-Type: application/json (400), which broke DELETEs.
  const hasBody = init.body != null
  const call = () => fetch(BASE + path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
  })
  let res = await call()
  if (res.status === 401) { await refresh(); res = await call() }
  return (await res.json().catch(() => ({}))) as T
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
