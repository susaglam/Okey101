// packages/server/src/auth/routes.ts
// HTTP auth surface. The refresh token rides in an httpOnly cookie (XSS can't read
// it); the access token is returned in the body for the SPA to hold in memory. /refresh
// is cookie-authed so it carries a custom-header CSRF guard.
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { register, login, guest, refresh, logout } from './service.ts'
import { verifyAccess, type AccessClaims } from './tokens.ts'
import { getUserById, publicUser } from '../repo.ts'

declare module 'fastify' {
  interface FastifyRequest { user?: AccessClaims }
}

const COOKIE = 'csok_rt'
const isProd = process.env.NODE_ENV === 'production'

function setRefreshCookie(reply: FastifyReply, raw: string, remember: boolean): void {
  reply.setCookie(COOKIE, raw, {
    httpOnly: true, secure: isProd, sameSite: 'lax', path: '/auth',
    maxAge: (remember ? 30 : 1) * 24 * 60 * 60,
  })
}
const clearRefreshCookie = (reply: FastifyReply) => reply.clearCookie(COOKIE, { path: '/auth' })

const strBody = (required: string[], extra: Record<string, unknown> = {}) => ({
  body: {
    type: 'object', additionalProperties: false, required,
    properties: {
      username: { type: 'string', maxLength: 40 },
      password: { type: 'string', maxLength: 100 },
      email: { type: 'string', maxLength: 120 },
      remember: { type: 'boolean' },
      ...extra,
    },
  },
})

interface AuthBody { username?: string; password?: string; email?: string; remember?: boolean }

/** Verify the Bearer access token; attaches req.user or 401s. Use as a preHandler. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const h = req.headers.authorization
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null
  const claims = token ? verifyAccess(token) : null
  if (!claims) { await reply.code(401).send({ error: 'unauthorized' }); return }
  req.user = claims
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }

  app.post('/auth/register', { ...strBody(['username', 'password']), ...authLimit }, async (req, reply) => {
    const { username = '', password = '', email, remember } = req.body as AuthBody
    const r = register(username, password, email, { remember, userAgent: req.headers['user-agent'] })
    if (!r.ok) return reply.code(400).send({ error: r.error })
    setRefreshCookie(reply, r.data.refreshToken, !!remember)
    return { user: r.data.user, accessToken: r.data.accessToken }
  })

  app.post('/auth/login', { ...strBody(['username', 'password']), ...authLimit }, async (req, reply) => {
    const { username = '', password = '', remember } = req.body as AuthBody
    const r = login(username, password, { remember, userAgent: req.headers['user-agent'] })
    if (!r.ok) return reply.code(401).send({ error: r.error })
    setRefreshCookie(reply, r.data.refreshToken, !!remember)
    return { user: r.data.user, accessToken: r.data.accessToken }
  })

  app.post('/auth/guest', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const r = guest({ userAgent: req.headers['user-agent'] })
    if (!r.ok) return reply.code(500).send({ error: r.error })
    setRefreshCookie(reply, r.data.refreshToken, false)
    return { user: r.data.user, accessToken: r.data.accessToken }
  })

  app.post('/auth/refresh', async (req, reply) => {
    // CSRF guard: this endpoint is cookie-authed, so require a custom header a
    // cross-site form/script cannot set without a (denied) CORS preflight.
    if (req.headers['x-csrf'] !== '1') return reply.code(403).send({ error: 'csrf' })
    const raw = (req.cookies as Record<string, string | undefined>)?.[COOKIE]
    if (!raw) return reply.code(401).send({ error: 'no-session' })
    const r = refresh(raw, req.headers['user-agent'])
    if (!r.ok) { clearRefreshCookie(reply); return reply.code(401).send({ error: r.reuse ? 'reuse-detected' : 'invalid' }) }
    setRefreshCookie(reply, r.data.refreshToken, false)
    return { user: r.data.user, accessToken: r.data.accessToken }
  })

  app.post('/auth/logout', async (req, reply) => {
    const raw = (req.cookies as Record<string, string | undefined>)?.[COOKIE]
    if (raw) logout(raw)
    clearRefreshCookie(reply)
    return { ok: true }
  })

  app.get('/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    const account = req.user ? getUserById(req.user.sub) : undefined
    if (!account) return reply.code(401).send({ error: 'unauthorized' })
    return { user: publicUser(account) }
  })
}
