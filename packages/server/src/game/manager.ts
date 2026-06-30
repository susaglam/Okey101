// packages/server/src/game/manager.ts
// Orchestrates lobby tables + live games. Transport-agnostic: it talks to clients
// through an Emitter, so tests drive the full flow with a fake emitter (no real
// sockets). Holds one GameHost per playing table; persists everything via repos.
import type { GameEvent } from '@cs-okey/engine'
import { getUserById, getGroup, publicUser } from '../repo.ts'
import {
  createTable as dbCreateTable, getTable, listTables, saveTable, deleteTable,
  sit as sitSeat, stand as standSeat, fillWithBots, seatOf, humanCount,
  type TableRecord, type TableAccess, type TableConfig, type Seat,
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
    access: t.access, config: t.config, hostUserId: t.hostUserId,
    seats: t.seats.map(publicSeat), humanCount: humanCount(t),
  }
}

// Clamp the host's table settings to sane bounds (untrusted wire input).
const TURN_MIN = 5, TURN_MAX = 120, HANDS_MIN = 1, HANDS_MAX = 20
function sanitizeConfig(input: unknown): TableConfig {
  const cfg: TableConfig = {}
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>
    if (typeof o.matchHands === 'number' && Number.isFinite(o.matchHands)) {
      cfg.matchHands = Math.max(HANDS_MIN, Math.min(HANDS_MAX, Math.floor(o.matchHands)))
    }
    if (typeof o.turnSeconds === 'number' && Number.isFinite(o.turnSeconds)) {
      cfg.turnSeconds = Math.max(TURN_MIN, Math.min(TURN_MAX, Math.floor(o.turnSeconds)))
    }
  }
  return cfg
}

export interface ManagerAfk { autoMoveMs?: number; takeoverMs?: number; autoNextMs?: number }

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

  createTable(userId: string, input: { mode: unknown; name?: string; access?: TableAccess; config?: unknown }): { ok: true; table: TableRecord } | { ok: false; error: string } {
    if (!isGameMode(input.mode)) return { ok: false, error: 'Geçersiz mod.' }
    const mine = listTables().filter((t) => t.hostUserId === userId).length
    if (mine >= MAX_TABLES_PER_USER) return { ok: false, error: 'Çok fazla masa açtın.' }
    const name = (input.name?.trim() || `${input.mode} masası`).slice(0, 40)
    const config = sanitizeConfig(input.config)
    const table = dbCreateTable({ hostUserId: userId, mode: input.mode as GameMode, name, access: input.access, config })
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
    // Per-table turn time (host-chosen, default 20s) drives the AFK auto-move timer.
    const turnMs = typeof t.config.turnSeconds === 'number' ? t.config.turnSeconds * 1000 : this.afk.autoMoveMs
    const host = new GameHost({
      tableId: t.id, mode: t.mode, actors, botDelayMs: this.botDelayMs,
      matchHands: t.config.matchHands,
      afkAutoMoveMs: turnMs, afkTakeoverMs: this.afk.takeoverMs, autoNextMs: this.afk.autoNextMs,
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

  /** Host restarts a FINISHED match on the same table: fresh seed, standings reset,
   *  same seats re-dealt. Rejected mid-match. ("Yeniden Başlat") */
  async restartMatch(userId: string, tableId: string): Promise<{ ok: boolean; error?: string }> {
    const t = getTable(tableId)
    const host = this.hosts.get(tableId)
    if (!t || !host) return { ok: false, error: 'Masa bulunamadı.' }
    if (t.hostUserId !== userId) return { ok: false, error: 'Yalnız masa sahibi yeniden başlatabilir.' }
    if (!host.matchOver) return { ok: false, error: 'Maç henüz bitmedi.' }
    host.dispose() // clears AFK + auto-next timers
    const fresh = this.makeHost(t) // rebuilds actors from the (already-filled) seats, new random seed
    this.hosts.set(tableId, fresh)
    await fresh.startNewMatch()
    this.emit.toTable(tableId, 'table:state', publicTable(t))
    this.pushLobby()
    return { ok: true }
  }

  /** Send each seated human their own redacted view (+ legal moves + match state). */
  emitGameViews(tableId: string): void {
    const host = this.hosts.get(tableId)
    const t = getTable(tableId)
    if (!host || !t) return
    const history = host.getHistory()
    const turnTimer = host.turnTimer()
    for (const s of t.seats) {
      if (s.occupant?.kind !== 'human') continue
      this.emit.toUser(s.occupant.userId, 'game:view', {
        tableId, view: host.viewFor(s.index), legal: host.legalFor(s.index),
        match: host.matchState(), history, turnTimer,
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
      if (seat >= 0) { void host.reclaim(seat, userId); this.emit.toUser(userId, 'game:view', { tableId, view: host.viewFor(seat), legal: host.legalFor(seat), match: host.matchState(), history: host.getHistory(), turnTimer: host.turnTimer() }) }
    }
    return { ok: true }
  }

  /** Restore live games from the DB on boot, then resume their timers/bots so a
   *  redeploy never freezes an in-progress game (and the turn-timer ring reappears). */
  restoreAll(): void {
    for (const t of listTables()) {
      if (t.status === 'playing' && loadGameRow(t.id)) {
        const host = this.makeHost(t, true)
        this.hosts.set(t.id, host)
        void host.resume()
      }
    }
  }

  // ── table lifecycle / cleanup ───────────────────────────────────────────────
  /** Fully remove a table: dispose its host (timers), drop the row + game, and tell
   *  anyone in the room to return to the lobby. */
  private removeTable(tableId: string): void {
    this.hosts.get(tableId)?.dispose()
    this.hosts.delete(tableId)
    deleteTable(tableId)
    this.emit.toTable(tableId, 'table:closed', { tableId })
  }

  private gameUpdatedAt(tableId: string): number {
    const r = db().prepare('SELECT updated_at FROM games WHERE table_id = ?').get(tableId) as { updated_at: number } | undefined
    return r?.updated_at ?? 0
  }

  /** Sweep stale tables so abandoned games / empty rooms don't live forever. A
   *  finished or abandoned match goes stale once the bots stop moving; an empty
   *  waiting room is reclaimed quickly; everything is hard-capped at 24h. Pure-ish:
   *  `now` is injected so it's testable. Returns how many were removed. */
  cleanupTables(now: number): number {
    const EMPTY_MS = 10 * 60_000        // a waiting room with nobody seated
    const WAITING_STALE_MS = 2 * 3_600_000 // a waiting room nobody ever starts
    const PLAYING_STALE_MS = 45 * 60_000   // a game with no moves (match over / abandoned)
    const MAX_AGE_MS = 24 * 3_600_000      // hard cap regardless of state
    let removed = 0
    for (const t of listTables()) {
      const age = now - t.createdAt
      let dead = age > MAX_AGE_MS
      if (!dead && (t.status === 'playing' || t.status === 'ended')) {
        const idle = now - (this.gameUpdatedAt(t.id) || t.createdAt)
        dead = idle > PLAYING_STALE_MS
      } else if (!dead) { // waiting
        dead = (humanCount(t) === 0 && age > EMPTY_MS) || age > WAITING_STALE_MS
      }
      if (dead) { this.removeTable(t.id); removed++ }
    }
    if (removed > 0) this.pushLobby()
    return removed
  }

  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  /** Start the periodic stale-table sweep (production). */
  startCleanup(intervalMs = 5 * 60_000): void {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => { try { this.cleanupTables(Date.now()) } catch { /* best-effort */ } }, intervalMs)
  }
  stopCleanup(): void { if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null } }

  // ── admin moderation (gated by the caller's CURRENT group isAdmin) ──────────
  isAdmin(userId: string): boolean {
    const u = getUserById(userId)
    return !!u && getGroup(u.groupId)?.isAdmin === true
  }

  adminDeleteTable(userId: string, tableId: string): { ok: boolean; error?: string } {
    if (!this.isAdmin(userId)) return { ok: false, error: 'Yetkisiz.' }
    if (!getTable(tableId)) return { ok: false, error: 'Masa bulunamadı.' }
    this.removeTable(tableId)
    this.pushLobby()
    return { ok: true }
  }

  /** Remove the occupant of a seat. Waiting → seat emptied; playing → a bot takes over. */
  async adminKick(userId: string, tableId: string, seat: number): Promise<{ ok: boolean; error?: string }> {
    if (!this.isAdmin(userId)) return { ok: false, error: 'Yetkisiz.' }
    const t = getTable(tableId)
    if (!t || seat < 0 || seat >= t.seats.length) return { ok: false, error: 'Geçersiz.' }
    if (t.status === 'waiting') {
      t.seats[seat]!.occupant = null; t.seats[seat]!.ready = false
      saveTable(t); this.emit.toTable(tableId, 'table:state', publicTable(t)); this.pushLobby()
      return { ok: true }
    }
    // Playing: hand the seat to a bot (the host keeps the game moving).
    const host = this.hosts.get(tableId)
    if (host) await host.kickToBot(seat)
    t.seats[seat]!.occupant = { kind: 'bot' }
    saveTable(t); this.emit.toTable(tableId, 'table:state', publicTable(t)); this.pushLobby()
    return { ok: true }
  }

  /** Move a seated player to an empty seat (waiting room only). */
  adminMove(userId: string, tableId: string, from: number, to: number): { ok: boolean; error?: string } {
    if (!this.isAdmin(userId)) return { ok: false, error: 'Yetkisiz.' }
    const t = getTable(tableId)
    if (!t) return { ok: false, error: 'Masa bulunamadı.' }
    if (t.status !== 'waiting') return { ok: false, error: 'Oyun başladı — koltuk değiştirilemez.' }
    if (from < 0 || to < 0 || from >= t.seats.length || to >= t.seats.length) return { ok: false, error: 'Geçersiz koltuk.' }
    const src = t.seats[from]!, dst = t.seats[to]!
    if (!src.occupant || dst.occupant) return { ok: false, error: 'Kaynak boş ya da hedef dolu.' }
    dst.occupant = src.occupant; dst.ready = src.ready
    src.occupant = null; src.ready = false
    saveTable(t); this.emit.toTable(tableId, 'table:state', publicTable(t)); this.pushLobby()
    return { ok: true }
  }

  disposeAll(): void { this.stopCleanup(); for (const h of this.hosts.values()) h.dispose() }
}

interface GameRow { state: string; version: number; standings: string; history: string; seed: number; scored_hand_no: number }
function loadGameRow(tableId: string) {
  const r = db().prepare('SELECT * FROM games WHERE table_id = ?').get(tableId) as GameRow | undefined
  if (!r) return null
  let history: unknown[] = []
  try { history = JSON.parse(r.history) } catch { /* legacy row without history */ }
  return {
    state: JSON.parse(r.state), version: r.version, standings: JSON.parse(r.standings) as number[],
    seed: r.seed, scoredHandNo: r.scored_hand_no, history,
  }
}
