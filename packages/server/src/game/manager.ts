// packages/server/src/game/manager.ts
// Orchestrates lobby tables + live games. Transport-agnostic: it talks to clients
// through an Emitter, so tests drive the full flow with a fake emitter (no real
// sockets). Holds one GameHost per playing table; persists everything via repos.
import type { GameEvent } from '@cs-okey/engine'
import { getUserById, getGroup, publicUser } from '../repo.ts'
import {
  createTable as dbCreateTable, getTable, listTables, saveTable, deleteTable,
  sit as sitSeat, stand as standSeat, fillWithBots, seatOf, humanCount,
  type TableRecord, type TableAccess, type Seat,
} from '../tables/repo.ts'
import { db } from '../db.ts'
import { GameHost, type SeatActor } from './host.ts'
import { isGameMode, type GameMode } from './modes.ts'

export interface Emitter {
  /** Emit to every socket of a user (used for that user's private redacted game view). */
  toUser(userId: string, event: string, payload: unknown): void
  /** Broadcast to everyone in a table room (lobby/waiting-room state). */
  toTable(tableId: string, event: string, payload: unknown): void
  /** Broadcast to everyone connected (lobby list changed). */
  toAll(event: string, payload: unknown): void
}

const MAX_TABLES_PER_USER = 5

// Public, leak-safe projections ------------------------------------------------
function publicSeat(s: Seat) {
  const o = s.occupant
  return {
    index: s.index, ready: s.ready,
    occupant: o == null ? null : o.kind === 'bot' ? { kind: 'bot' as const } : { kind: 'human' as const, name: o.name },
  }
}
export function publicTable(t: TableRecord) {
  return {
    id: t.id, mode: t.mode, name: t.name, status: t.status,
    access: t.access, hostUserId: t.hostUserId,
    seats: t.seats.map(publicSeat), humanCount: humanCount(t),
  }
}

export interface ManagerAfk { autoMoveMs?: number; takeoverMs?: number }

export class GameManager {
  private hosts = new Map<string, GameHost>()
  constructor(private emit: Emitter, private botDelayMs = 0, private afk: ManagerAfk = {}) {}

  // ── access ────────────────────────────────────────────────────────────────
  groupOf(userId: string): string {
    const u = getUserById(userId)
    return u ? u.groupId : 'guest'
  }
  canAccess(t: TableRecord, userId: string): boolean {
    if (!t.access.allowedGroups) return true
    return t.access.allowedGroups.includes(this.groupOf(userId))
  }

  // ── lobby ───────────────────────────────────────────────────────────────────
  lobby(): ReturnType<typeof publicTable>[] { return listTables().map(publicTable) }
  pushLobby(): void { this.emit.toAll('lobby:tables', this.lobby()) }

  createTable(userId: string, input: { mode: unknown; name?: string; access?: TableAccess }): { ok: true; table: TableRecord } | { ok: false; error: string } {
    if (!isGameMode(input.mode)) return { ok: false, error: 'Geçersiz mod.' }
    const mine = listTables().filter((t) => t.hostUserId === userId).length
    if (mine >= MAX_TABLES_PER_USER) return { ok: false, error: 'Çok fazla masa açtın.' }
    const name = (input.name?.trim() || `${input.mode} masası`).slice(0, 40)
    const table = dbCreateTable({ hostUserId: userId, mode: input.mode as GameMode, name, access: input.access })
    sitSeat(table, 0, userId) // host takes seat 0 by default
    saveTable(table)
    this.pushLobby()
    return { ok: true, table }
  }

  // ── seating (waiting room) ────────────────────────────────────────────────
  private mutate(tableId: string, fn: (t: TableRecord) => boolean): { ok: boolean; error?: string; table?: TableRecord } {
    const t = getTable(tableId)
    if (!t) return { ok: false, error: 'Masa bulunamadı.' }
    if (!fn(t)) return { ok: false, error: 'İşlem yapılamadı.' }
    saveTable(t)
    this.emit.toTable(tableId, 'table:state', publicTable(t))
    this.pushLobby()
    return { ok: true, table: t }
  }

  sit(userId: string, tableId: string, seat: number) {
    const t = getTable(tableId)
    if (!t) return { ok: false, error: 'Masa bulunamadı.' }
    if (!this.canAccess(t, userId)) return { ok: false, error: 'Bu masaya erişimin yok.' }
    if (t.status !== 'waiting') {
      // Mid-game: only RECLAIM your own seat (a bot may have taken it over).
      const mySeat = seatOf(t, userId)
      if (mySeat >= 0) { void this.hosts.get(tableId)?.reclaim(mySeat, userId); return { ok: true, table: t } }
      return { ok: false, error: 'Oyun başladı.' }
    }
    return this.mutate(tableId, (tt) => sitSeat(tt, seat, userId))
  }
  stand(userId: string, tableId: string) {
    return this.mutate(tableId, (t) => { if (t.status !== 'waiting') return false; standSeat(t, userId); return true })
  }
  ready(userId: string, tableId: string, ready: boolean) {
    return this.mutate(tableId, (t) => {
      const i = seatOf(t, userId); if (i < 0) return false
      t.seats[i]!.ready = ready; return true
    })
  }

  // ── start / play ──────────────────────────────────────────────────────────
  async start(userId: string, tableId: string): Promise<{ ok: boolean; error?: string }> {
    const t = getTable(tableId)
    if (!t) return { ok: false, error: 'Masa bulunamadı.' }
    if (t.hostUserId !== userId) return { ok: false, error: 'Yalnız masa sahibi başlatabilir.' }
    if (t.status !== 'waiting') return { ok: false, error: 'Oyun zaten başladı.' }
    if (humanCount(t) < 1) return { ok: false, error: 'En az bir oyuncu gerekli.' }
    fillWithBots(t)
    t.status = 'playing'
    saveTable(t)
    const host = this.makeHost(t)
    this.hosts.set(tableId, host)
    await host.startNewMatch()
    this.emit.toTable(tableId, 'table:state', publicTable(t))
    this.pushLobby()
    return { ok: true }
  }

  private makeHost(t: TableRecord, restore = false): GameHost {
    const actors: SeatActor[] = t.seats.map((s) =>
      s.occupant?.kind === 'human' ? { kind: 'human', userId: s.occupant.userId } : { kind: 'bot' })
    const host = new GameHost({
      tableId: t.id, mode: t.mode, actors, botDelayMs: this.botDelayMs,
      afkAutoMoveMs: this.afk.autoMoveMs, afkTakeoverMs: this.afk.takeoverMs,
      onChange: () => this.emitGameViews(t.id),
      onGameOver: () => this.emit.toTable(t.id, 'table:state', publicTable(getTable(t.id) ?? t)),
    })
    if (restore) {
      const row = loadGameRow(t.id)
      if (row) host.restore(row)
    }
    return host
  }

  async intent(userId: string, tableId: string, baseVersion: number, event: GameEvent) {
    const host = this.hosts.get(tableId)
    if (!host) return { ok: false, code: 'no-game' as const }
    return host.applyIntent(userId, baseVersion, event)
  }
  async nextHand(userId: string, tableId: string) {
    const t = getTable(tableId)
    const host = this.hosts.get(tableId)
    if (!t || !host) return { ok: false }
    if (t.hostUserId !== userId) return { ok: false }
    await host.nextHand()
    return { ok: true }
  }

  /** Send each seated human their own redacted view (+ legal moves + match state). */
  emitGameViews(tableId: string): void {
    const host = this.hosts.get(tableId)
    const t = getTable(tableId)
    if (!host || !t) return
    for (const s of t.seats) {
      if (s.occupant?.kind !== 'human') continue
      this.emit.toUser(s.occupant.userId, 'game:view', {
        tableId, view: host.viewFor(s.index), legal: host.legalFor(s.index), match: host.matchState(),
      })
    }
  }

  /** A user (re)joined the table room: send waiting-room state and, if playing,
   *  their private view (reclaiming their seat from a bot if needed). */
  join(userId: string, tableId: string): { ok: boolean; error?: string } {
    const t = getTable(tableId)
    if (!t) return { ok: false, error: 'Masa bulunamadı.' }
    if (!this.canAccess(t, userId)) return { ok: false, error: 'Bu masaya erişimin yok.' }
    this.emit.toUser(userId, 'table:state', publicTable(t))
    const host = this.hosts.get(tableId)
    if (host && t.status === 'playing') {
      const seat = seatOf(t, userId)
      if (seat >= 0) { void host.reclaim(seat, userId); this.emit.toUser(userId, 'game:view', { tableId, view: host.viewFor(seat), legal: host.legalFor(seat), match: host.matchState() }) }
    }
    return { ok: true }
  }

  /** Restore live games from the DB on boot. */
  restoreAll(): void {
    for (const t of listTables()) {
      if (t.status === 'playing' && loadGameRow(t.id)) this.hosts.set(t.id, this.makeHost(t, true))
    }
  }

  disposeAll(): void { for (const h of this.hosts.values()) h.dispose() }
}

interface GameRow { state: string; version: number; standings: string; seed: number; scored_hand_no: number }
function loadGameRow(tableId: string) {
  const r = db().prepare('SELECT * FROM games WHERE table_id = ?').get(tableId) as GameRow | undefined
  if (!r) return null
  return {
    state: JSON.parse(r.state), version: r.version, standings: JSON.parse(r.standings) as number[],
    seed: r.seed, scoredHandNo: r.scored_hand_no,
  }
}
