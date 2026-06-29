// packages/server/src/index.ts
// Bootstrap: build the Fastify app, attach a JWT-authenticated Socket.IO server, and
// listen. The authoritative game host (per-table rooms, redacted broadcasts, bots,
// AFK) lands on this socket in Faz C–F.
import { Server as SocketServer } from 'socket.io'
import { buildApp, ALLOWED_ORIGINS } from './app.ts'
import { verifyAccess } from './auth/tokens.ts'
import { createSocketLayer } from './socket.ts'
import { db } from './db.ts'

const PORT = Number(process.env.PORT ?? 8787)
const isProd = process.env.NODE_ENV === 'production'
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 600) // pace bot moves so clients see them

const app = await buildApp()
await app.ready()

// Socket.IO shares Fastify's HTTP server; the handshake is JWT-authenticated and the
// payload size is capped (game intents are tiny).
const io = new SocketServer(app.server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
  maxHttpBufferSize: 16 * 1024,
})
io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined
  const claims = token ? verifyAccess(token) : null
  if (!claims) return next(new Error('unauthorized'))
  socket.data.user = claims
  next()
})

const manager = createSocketLayer(io, BOT_DELAY_MS)
manager.restoreAll() // resume live games persisted before a restart/redeploy

if (!isProd && !process.env.JWT_SECRET) {
  app.log.warn('JWT_SECRET not set — using an INSECURE dev key. Set JWT_SECRET in production.')
}

// Graceful shutdown: stop timers, close sockets, checkpoint the WAL so nothing is lost.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    void (async () => {
      try { manager.disposeAll(); await io.close(); await app.close(); db().pragma('wal_checkpoint(TRUNCATE)'); db().close() } catch { /* best-effort */ }
      process.exit(0)
    })()
  })
}

await app.listen({ port: PORT, host: '0.0.0.0' })
app.log.info(`CS Okey server on :${PORT} (origins: ${ALLOWED_ORIGINS.join(', ')})`)
