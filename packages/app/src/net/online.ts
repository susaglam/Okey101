// packages/app/src/net/online.ts
// Client wrapper over the server's Socket.IO protocol (lobby / table / game). The
// handshake carries the in-memory access token; if it has expired the client
// silently refreshes (cookie) and reconnects. Every request returns the server's ack.
import { io, type Socket } from 'socket.io-client'
import { getAccessToken, refresh, serverBase } from './authClient'

export class OnlineClient {
  private socket: Socket | null = null

  async connect(): Promise<void> {
    if (this.socket?.connected) return
    if (!getAccessToken()) await refresh()
    const sock = io(serverBase(), {
      auth: { token: getAccessToken() },
      withCredentials: true,
      transports: ['websocket'],
      reconnection: true,
    })
    this.socket = sock
    let refreshed = false
    await new Promise<void>((resolve, reject) => {
      sock.once('connect', () => resolve())
      sock.on('connect_error', (err) => {
        // Likely an expired access token: refresh ONCE (via the cookie) and retry.
        if (refreshed) { reject(err); return }
        refreshed = true
        void refresh().then((u) => {
          if (u && getAccessToken()) { sock.auth = { token: getAccessToken() }; sock.connect() }
          else reject(err)
        })
      })
    })
  }

  /** Subscribe to a server push (game:view, table:state, lobby:tables, …). Returns an unsubscribe. */
  on<T = unknown>(event: string, cb: (payload: T) => void): () => void {
    this.socket?.on(event, cb as (p: unknown) => void)
    return () => this.socket?.off(event, cb as (p: unknown) => void)
  }

  private request<T = unknown>(event: string, payload: unknown = {}): Promise<T> {
    return new Promise<T>((resolve) => {
      if (!this.socket) { resolve({ ok: false, error: 'not-connected' } as T); return }
      this.socket.emit(event, payload, (resp: T) => resolve(resp))
    })
  }

  lobbyList<T = unknown>() { return this.request<T>('lobby:list') }
  createTable<T = unknown>(mode: string, name?: string, access?: unknown, config?: { matchHands?: number; turnSeconds?: number }) { return this.request<T>('table:create', { mode, name, access, config }) }
  joinTable<T = unknown>(tableId: string) { return this.request<T>('table:join', { tableId }) }
  sit<T = unknown>(tableId: string, seat: number) { return this.request<T>('table:sit', { tableId, seat }) }
  stand<T = unknown>(tableId: string) { return this.request<T>('table:stand', { tableId }) }
  ready<T = unknown>(tableId: string, ready: boolean) { return this.request<T>('table:ready', { tableId, ready }) }
  start<T = unknown>(tableId: string) { return this.request<T>('table:start', { tableId }) }
  nextHand<T = unknown>(tableId: string) { return this.request<T>('table:next', { tableId }) }
  restart<T = unknown>(tableId: string) { return this.request<T>('table:restart', { tableId }) }
  // Admin moderation (server re-checks isAdmin).
  adminDeleteTable<T = unknown>(tableId: string) { return this.request<T>('admin:deleteTable', { tableId }) }
  adminKick<T = unknown>(tableId: string, seat: number) { return this.request<T>('admin:kick', { tableId, seat }) }
  adminMove<T = unknown>(tableId: string, from: number, to: number) { return this.request<T>('admin:move', { tableId, from, to }) }
  leave<T = unknown>(tableId: string) { return this.request<T>('table:leave', { tableId }) }
  /** Send a game move. `event` is the GameEvent WITHOUT seat (the server forces the seat). */
  intent<T = unknown>(tableId: string, baseVersion: number, event: unknown) { return this.request<T>('intent', { tableId, baseVersion, event }) }

  disconnect(): void { this.socket?.disconnect(); this.socket = null }
  get connected(): boolean { return this.socket?.connected ?? false }
}
