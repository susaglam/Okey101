// packages/app/src/tables.ts
// Lobby tables: the home screen lists these, you open as many as you like, each with
// its own mode + its own save slot (keyed by table id). Local-first; a server would
// later replace this store and add real seat occupancy / other players.
import { MODES, resolveMode, type GameMode } from './modes'
import { listSaves, clearGame, type SaveData } from './persistence'

export interface TableDescriptor {
  id: string
  mode: GameMode
  name: string
  createdAt: number
}

const KEY = 'cs-okey-tables'
const hasLS = () => typeof localStorage !== 'undefined'

function newTableId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return 't-' + crypto.randomUUID().slice(0, 8)
  } catch { /* fall through */ }
  return 't-' + Math.random().toString(36).slice(2, 10)
}

function read(): TableDescriptor[] | null {
  if (!hasLS()) return null
  try {
    const raw = localStorage.getItem(KEY)
    if (raw == null) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as TableDescriptor[]) : null
  } catch {
    return null
  }
}

function write(list: TableDescriptor[]): void {
  if (!hasLS()) return
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* best-effort */ }
}

/** Build a table descriptor for a legacy per-mode save (slot id == the mode). */
function legacyTable(save: SaveData): TableDescriptor {
  const mode = resolveMode(save.mode ?? save.variantId)
  return { id: save.tableId ?? mode, mode, name: MODES[mode].title, createdAt: save.savedAt || 0 }
}

/** All lobby tables. On first run, seeds the list from any pre-lobby per-mode saves
 *  so an in-progress Klasik/101/Eşli game still appears as a resumable table. */
export function loadTables(): TableDescriptor[] {
  const stored = read()
  if (stored) return stored
  const migrated = listSaves().map(legacyTable)
  // de-dupe by id (a legacy save's id is its mode)
  const byId = new Map(migrated.map((t) => [t.id, t]))
  const seeded = [...byId.values()]
  write(seeded)
  return seeded
}

export function saveTables(list: TableDescriptor[]): void {
  write(list)
}

export function createTable(mode: GameMode, name?: string): TableDescriptor {
  const list = loadTables()
  const n = list.filter((t) => t.mode === mode).length + 1
  const table: TableDescriptor = {
    id: newTableId(),
    mode,
    name: name?.trim() || `${MODES[mode].title} Masası ${n}`,
    createdAt: 0,
  }
  write([...list, table])
  return table
}

export function deleteTable(id: string): void {
  write(loadTables().filter((t) => t.id !== id))
  clearGame(id) // drop its game save too
}

export function getTable(id: string): TableDescriptor | undefined {
  return loadTables().find((t) => t.id === id)
}
