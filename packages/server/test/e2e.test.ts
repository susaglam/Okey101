import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { io as ioc, type Socket } from 'socket.io-client'
import type { AddressInfo } from 'node:net'

process.env.NODE_ENV = 'test'
process.env.CS_OKEY_DB = ':memory:'
process.env.BCRYPT_COST = '4'

const { _closeDbForTests } = await import('../src/db.ts')
const { bootstrap } = await import('../src/bootstrap.ts')

let booted: Awaited<ReturnType<typeof bootstrap>>
let url: string
const clients: Socket[] = []

beforeEach(async () => {
  _closeDbForTests()
  booted = await bootstrap({ botDelayMs: 0, afk: { autoMoveMs: 0, takeoverMs: 0 } })
  await booted.app.listen({ port: 0, host: '127.0.0.1' })
  const addr = booted.app.server.address() as AddressInfo
  url = `http://127.0.0.1:${addr.port}`
})
afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect()
  await booted.close()
})

async function registerUser(username: string): Promise<string> {
  const res = await booted.app.inject({ method: 'POST', url: '/auth/register', payload: { username, password: 'sifre12' } })
  return res.json().accessToken as string
}

function connect(token: string): Promise<Socket> {
  const sock = ioc(url, { auth: { token }, transports: ['websocket'], reconnection: false, withCredentials: true })
  clients.push(sock)
  return new Promise((resolve, reject) => {
    sock.once('connect', () => resolve(sock))
    sock.once('connect_error', (e) => reject(e))
  })
}
const emit = <T = any>(sock: Socket, event: string, payload: unknown): Promise<T> =>
  new Promise((resolve) => sock.emit(event, payload, resolve))
const waitFor = <T = any>(sock: Socket, event: string, timeoutMs = 4000): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs)
    sock.once(event, (p: T) => { clearTimeout(t); resolve(p) })
  })

describe('e2e — auth handshake + create/start + redacted view', () => {
  it('rejects an unauthenticated socket', async () => {
    await expect(connect('not-a-valid-token')).rejects.toBeTruthy()
  })

  it('an authenticated host creates a table, starts it, and receives a LEAK-FREE view', async () => {
    const token = await registerUser('HostPlayer')
    const sock = await connect(token)

    const created = await emit<{ ok: boolean; tableId: string }>(sock, 'table:create', { mode: 'yuzbir', name: 'E2E' })
    expect(created.ok).toBe(true)
    const tableId = created.tableId

    const viewPromise = waitFor<{ view: any }>(sock, 'game:view')
    const started = await emit<{ ok: boolean }>(sock, 'table:start', { tableId })
    expect(started.ok).toBe(true)

    const { view } = await viewPromise
    expect(Array.isArray(view.you.rack)).toBe(true)               // own rack present
    expect(view.opponents.every((o: object) => !('rack' in o))).toBe(true) // opponents: counts only
    expect('stock' in view).toBe(false)                            // stock order never sent
    expect(typeof view.stockCount).toBe('number')
  }, 15000)

  it('a guest cannot join a members-only table', async () => {
    // host creates a members-only table
    const hostTok = await registerUser('Host2')
    const hostSock = await connect(hostTok)
    const created = await emit<{ ok: boolean; tableId: string }>(hostSock, 'table:create', { mode: 'yuzbir', access: { allowedGroups: ['normal', 'premium', 'admin'] } })
    const tableId = created.tableId

    // a guest signs in and tries to join
    const guestRes = await booted.app.inject({ method: 'POST', url: '/auth/guest', payload: {} })
    const guestTok = guestRes.json().accessToken
    const guestSock = await connect(guestTok)
    const join = await emit<{ ok: boolean; error?: string }>(guestSock, 'table:join', { tableId })
    expect(join.ok).toBe(false)
  }, 15000)
})
