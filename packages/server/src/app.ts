// packages/server/src/app.ts
// Fastify app FACTORY (no listen, no sockets) so tests can drive it with app.inject().
// index.ts wraps this with Socket.IO + listen.
import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import staticPlugin from '@fastify/static'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENGINE_NAME } from '@cs-okey/engine'
import { db } from './db.ts'
import { authRoutes } from './auth/routes.ts'
import { adminRoutes } from './admin/routes.ts'
import { feedbackRoutes } from './feedback/routes.ts'

export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((s) => s.trim()).filter(Boolean)

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true, // behind Coolify/Traefik — honour X-Forwarded-* for IP + secure cookies
    logger: {
      level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
      redact: { // NEVER log secrets/PII
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]',
          '*.password', '*.password_hash', '*.passwordHash', '*.token', '*.accessToken', '*.refreshToken', '*.email'],
        censor: '[REDACTED]',
      },
    },
  })

  await app.register(helmet, { contentSecurityPolicy: false }) // CSP belongs to the SPA host
  await app.register(cookie)
  await app.register(cors, { origin: ALLOWED_ORIGINS, credentials: true })
  await app.register(rateLimit, { global: false, max: 100, timeWindow: '1 minute' })

  db() // open + migrate + seed

  app.setErrorHandler((err: { statusCode?: number; message?: string }, req, reply) => {
    req.log.error(err)
    const code = err.statusCode ?? 500
    reply.code(code).send({ error: code < 500 ? err.message : 'internal_error' })
  })

  app.get('/health', async () => ({ ok: true, engine: ENGINE_NAME, ts: Date.now() })) // liveness
  app.get('/ready', async (_req, reply) => { // readiness — DB must answer
    try { db().prepare('SELECT 1').get(); return { ready: true } }
    catch { return reply.code(503).send({ ready: false }) }
  })

  await app.register(authRoutes)
  await app.register(adminRoutes)
  await app.register(feedbackRoutes)

  // Serve the built SPA from the SAME origin (so cookies/CORS are trivial) when a
  // build exists (production image). Non-API GET routes fall back to index.html so
  // client routing/reloads work. Skipped in dev/tests where there's no dist.
  const SPA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../app/dist')
  if (existsSync(SPA_DIR)) {
    await app.register(staticPlugin, { root: SPA_DIR, wildcard: false })
    const API_PREFIXES = ['/auth', '/admin', '/socket.io', '/health', '/ready', '/feedback']
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !API_PREFIXES.some((p) => req.url.startsWith(p))) {
        return reply.sendFile('index.html')
      }
      return reply.code(404).send({ error: 'not_found' })
    })
  }
  return app
}
