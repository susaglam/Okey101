// packages/server/src/tables/repo.ts
// Lobby tables persisted in SQLite (shared across all clients, survive restart).
// A table has 4 seats; each seat is empty, taken by a human (userId) or a bot.
import { randomUUID } from 'node:crypto'
import { db } from '../db.ts'
import { getUserById } from '../repo.ts'
import type { GameMode } from '../game/modes.ts'

export type SeatOccupant =
  | { kind: 'human'; userId: string; name: string }
  | { kind: 'bot' }
  | null

export interface Seat { index: number; occupant: SeatOccupant; ready: boolean }
export interface TableAccess { allowedGroups: string[] | null } // null = anyone (incl. guests)
export type TableStatus = 'waiting' | 'playing' | 'ended'
/** Host-chosen game settings, frozen at creation. */
export interface TableConfig { matchHands?: number; turnSeconds?: number }

export interface TableRecord {
  id: string
  hostUserId: string | null
  mode: GameMode
  name: string
  access: TableAccess
  config: TableConfig
  status: TableStatus
  seats: Seat[]
  createdAt: number
}

interface TableRow {
  id: string; host_user_id: string | null; mode: string; name: string
  access: string; status: string; seats: string; config: string | null; created_at: number
}

const SEAT_COUNT = 4
const emptySeats = (): Seat[] => Array.from({ length: SEAT_COUNT }, (_, i) => ({ index: i, occupant: null, ready: false }))

function toRecord(r: TableRow): TableRecord {
  return {
    id: r.id, hostUserId: r.host_user_id, mode: r.mode as GameMode, name: r.name,
    access: safeJson<TableAccess>(r.access, { allowedGroups: null }),
    config: r.config ? safeJson<TableConfig>(r.config, {}) : {},
    status: r.status as TableStatus,
    seats: safeJson<Seat[]>(r.seats, emptySeats()),
    createdAt: r.created_at,
  }
}
function safeJson<T>(s: string, fallback: T): T { try { return JSON.parse(s) as T } catch { return fallback } }

export function createTable(input: { hostUserId: string; mode: GameMode; name: string; access?: TableAccess; config?: TableConfig }): TableRecord {
  const rec: TableRecord = {
    id: 't-' + randomUUID().slice(0, 8),
    hostUserId: input.hostUserId,
    mode: input.mode,
    name: input.name,
    access: input.access ?? { allowedGroups: null },
    config: input.config ?? {},
    status: 'waiting',
    seats: emptySeats(),
    createdAt: Date.now(),
  }
  saveTable(rec)
  return rec
}

export function saveTable(t: TableRecord): void {
  db().prepare(
    `INSERT INTO tables (id, host_user_id, mode, name, access, status, seats, config, created_at)
     VALUES (@id, @host, @mode, @name, @access, @status, @seats, @config, @created)
     ON CONFLICT(id) DO UPDATE SET host_user_id=@host, mode=@mode, name=@name, access=@access, status=@status, seats=@seats, config=@config`,
  ).run({
    id: t.id, host: t.hostUserId, mode: t.mode, name: t.name,
    access: JSON.stringify(t.access), status: t.status, seats: JSON.stringify(t.seats),
    config: JSON.stringify(t.config ?? {}), created: t.createdAt,
  })
}

export function getTable(id: string): TableRecord | undefined {
  const r = db().prepare('SELECT * FROM tables WHERE id = ?').get(id) as TableRow | undefined
  return r ? toRecord(r) : undefined
}

export function listTables(): TableRecord[] {
  return (db().prepare('SELECT * FROM tables ORDER BY created_at DESC').all() as TableRow[]).map(toRecord)
}

export function deleteTable(id: string): void {
  const tx = db().transaction((tid: string) => {
    db().prepare('DELETE FROM games WHERE table_id = ?').run(tid)
    db().prepare('DELETE FROM tables WHERE id = ?').run(tid)
  })
  tx(id)
}

// ── seat helpers (pure; caller persists) ───────────────────────────────────────
export function seatOf(t: TableRecord, userId: string): number {
  return t.seats.findIndex((s) => s.occupant?.kind === 'human' && s.occupant.userId === userId)
}
export function humanCount(t: TableRecord): number {
  return t.seats.filter((s) => s.occupant?.kind === 'human').length
}

/** Seat a user (resolving their display name). Returns false if the seat is taken. */
export function sit(t: TableRecord, seatIndex: number, userId: string): boolean {
  if (seatIndex < 0 || seatIndex >= SEAT_COUNT) return false
  const seat = t.seats[seatIndex]!
  if (seat.occupant != null) return false
  // leave any other seat first (one seat per user)
  stand(t, userId)
  const name = getUserById(userId)?.username ?? 'Oyuncu'
  seat.occupant = { kind: 'human', userId, name }
  seat.ready = false
  return true
}

export function stand(t: TableRecord, userId: string): void {
  for (const s of t.seats) {
    if (s.occupant?.kind === 'human' && s.occupant.userId === userId) { s.occupant = null; s.ready = false }
  }
}

/** Fill every empty seat with a bot (used at game start). */
export function fillWithBots(t: TableRecord): void {
  for (const s of t.seats) if (s.occupant == null) s.occupant = { kind: 'bot' }
}
