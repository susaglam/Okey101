// packages/server/src/socket.ts
// Wires the authenticated Socket.IO server to the GameManager. The handshake is
// already JWT-verified (index.ts), so socket.data.user is trusted here; we still
// derive the acting SEAT server-side (never from the wire) inside the host.
import type { Server as SocketServer } from 'socket.io'
import { GameManager, type Emitter, type ManagerAfk } from './game/manager.ts'
import { validateIntent } from './game/intents.ts'

type Ack = ((payload: unknown) => void) | undefined
const ack = (cb: Ack, payload: unknown) => { if (typeof cb === 'function') cb(payload) }
const room = (tableId: string) => `table:${tableId}`

export function createSocketLayer(io: SocketServer, botDelayMs = 0, afk: ManagerAfk = {}): GameManager {
  const userSockets = new Map<string, Set<string>>()
  const emitter: Emitter = {
    toUser(userId, event, payload) { for (const sid of userSockets.get(userId) ?? []) io.to(sid).emit(event, payload) },
    toTable(tableId, event, payload) { io.to(room(tableId)).emit(event, payload) },
    toAll(event, payload) { io.emit(event, payload) },
  }
  const manager = new GameManager(emitter, botDelayMs, afk)

  io.on('connection', (socket) => {
    const userId = socket.data.user.sub as string
    if (!userSockets.has(userId)) userSockets.set(userId, new Set())
    userSockets.get(userId)!.add(socket.id)

    socket.emit('lobby:tables', manager.lobby())
    socket.on('lobby:list', (cb: Ack) => ack(cb, manager.lobby()))

    socket.on('table:create', (payload: { mode?: unknown; name?: string; access?: unknown }, cb: Ack) => {
      const r = manager.createTable(userId, { mode: payload?.mode, name: payload?.name, access: payload?.access as never })
      if (r.ok) { void socket.join(room(r.table.id)); socket.data.tableId = r.table.id; manager.join(userId, r.table.id) }
      ack(cb, r.ok ? { ok: true, tableId: r.table.id } : { ok: false, error: r.error })
    })

    socket.on('table:join', (payload: { tableId?: string }, cb: Ack) => {
      const tableId = String(payload?.tableId ?? '')
      void socket.join(room(tableId)); socket.data.tableId = tableId
      ack(cb, manager.join(userId, tableId))
    })
    socket.on('table:leave', (payload: { tableId?: string }, cb: Ack) => {
      const tableId = String(payload?.tableId ?? socket.data.tableId ?? '')
      manager.stand(userId, tableId)
      void socket.leave(room(tableId))
      ack(cb, { ok: true })
    })
    socket.on('table:sit', (p: { tableId?: string; seat?: number }, cb: Ack) => ack(cb, manager.sit(userId, String(p?.tableId ?? ''), Number(p?.seat))))
    socket.on('table:stand', (p: { tableId?: string }, cb: Ack) => ack(cb, manager.stand(userId, String(p?.tableId ?? ''))))
    socket.on('table:ready', (p: { tableId?: string; ready?: boolean }, cb: Ack) => ack(cb, manager.ready(userId, String(p?.tableId ?? ''), !!p?.ready)))
    socket.on('table:start', (p: { tableId?: string }, cb: Ack) => { void manager.start(userId, String(p?.tableId ?? '')).then((r) => ack(cb, r)) })
    socket.on('table:next', (p: { tableId?: string }, cb: Ack) => { void manager.nextHand(userId, String(p?.tableId ?? '')).then((r) => ack(cb, r)) })

    socket.on('intent', (p: { tableId?: string; baseVersion?: number; event?: unknown }, cb: Ack) => {
      const event = validateIntent(p?.event)
      if (!event) return ack(cb, { ok: false, code: 'bad-intent' })
      void manager.intent(userId, String(p?.tableId ?? ''), Number(p?.baseVersion), event).then((r) => ack(cb, r))
    })

    socket.on('disconnect', () => {
      const set = userSockets.get(userId)
      set?.delete(socket.id)
      if (set && set.size === 0) userSockets.delete(userId)
      // The seat is NOT vacated on disconnect — the AFK clock (host) handles a brief
      // drop (reclaim on return) vs prolonged absence (bot takeover).
    })
  })

  return manager
}
