// packages/server/src/bootstrap.ts
// Build the Fastify app + attach a JWT-authenticated Socket.IO server + the game
// socket layer. Used by index.ts (prod) and the e2e test (so both share one wiring).
import { Server as SocketServer } from 'socket.io'
import type { FastifyInstance } from 'fastify'
import { buildApp, ALLOWED_ORIGINS } from './app.ts'
import { verifyAccess } from './auth/tokens.ts'
import { createSocketLayer } from './socket.ts'
import type { GameManager, ManagerAfk } from './game/manager.ts'
import { db } from './db.ts'

export interface Booted {
  app: FastifyInstance
  io: SocketServer
  manager: GameManager
  close: () => Promise<void>
}

export async function bootstrap(opts: { botDelayMs?: number; afk?: ManagerAfk } = {}): Promise<Booted> {
  const app = await buildApp()
  await app.ready()

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

  const manager = createSocketLayer(io, opts.botDelayMs ?? 0, opts.afk ?? {})
  manager.restoreAll()
  manager.cleanupTables(Date.now()) // sweep stale tables once on boot…
  manager.startCleanup()            // …then periodically

  const close = async () => {
    try { manager.disposeAll(); await io.close(); await app.close(); db().pragma('wal_checkpoint(TRUNCATE)') } catch { /* best-effort */ }
  }
  return { app, io, manager, close }
}
