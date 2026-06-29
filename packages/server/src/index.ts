// packages/server/src/index.ts
// CS Okey realtime server. Authoritative game host: clients send intents, the
// server validates them through the SAME pure engine the client uses (reduce +
// redactFor) and broadcasts per-seat redacted views. Bots run here too. Faz A:
// skeleton — HTTP health + Socket.IO + DB bootstrap. Auth/lobby/game land next.
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Server as SocketServer } from 'socket.io'
import { ENGINE_NAME } from '@cs-okey/engine'
import { db } from './db.ts'

const PORT = Number(process.env.PORT ?? 8787)

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })
await app.register(cors, { origin: true })

db() // open + migrate + seed the database on boot

app.get('/health', async () => ({ ok: true, engine: ENGINE_NAME, ts: Date.now() }))

await app.ready()

// Socket.IO shares Fastify's HTTP server. One room per table (added in Faz C/E).
const io = new SocketServer(app.server, { cors: { origin: '*' } })
io.on('connection', (socket) => {
  app.log.info({ id: socket.id }, 'socket connected')
  socket.on('disconnect', (reason) => app.log.info({ id: socket.id, reason }, 'socket disconnected'))
})

await app.listen({ port: PORT, host: '0.0.0.0' })
app.log.info(`CS Okey server listening on :${PORT}`)
