import { describe, it, expect, beforeEach } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.CS_OKEY_DB = ':memory:'
process.env.BCRYPT_COST = '4'

const { _closeDbForTests, db } = await import('../src/db.ts')
const { insertUser } = await import('../src/repo.ts')
const { GameManager } = await import('../src/game/manager.ts')
const { GameHost } = await import('../src/game/host.ts')
type TableRec = { id: string }

interface UserEvt { userId: string; event: string; payload: any }
function fakeEmitter() {
  const toUserEvents: UserEvt[] = []
  const toTableEvents: { tableId: string; event: string; payload: any }[] = []
  const toAllEvents: { event: string; payload: any }[] = []
  const emitter = {
    toUser: (userId: string, event: string, payload: unknown) => { toUserEvents.push({ userId, event, payload }) },
    toTable: (tableId: string, event: string, payload: unknown) => { toTableEvents.push({ tableId, event, payload }) },
    toAll: (event: string, payload: unknown) => { toAllEvents.push({ event, payload }) },
  }
  return { emitter, toUserEvents, toTableEvents, toAllEvents }
}
const seedUser = (id: string, username: string, groupId = 'normal') => insertUser({ id, username, passwordHash: '', groupId })

let mgr: InstanceType<typeof GameManager>
let fe: ReturnType<typeof fakeEmitter>
beforeEach(() => {
  _closeDbForTests(); db()
  fe = fakeEmitter()
  mgr = new GameManager(fe.emitter, 0, { autoMoveMs: 0, takeoverMs: 0, autoNextMs: 0 }) // AFK + auto-next off for flow tests
  seedUser('u-host', 'Host'); seedUser('u-2', 'Two'); seedUser('g-1', 'Misafir-1', 'guest')
})
const mkTable = (host = 'u-host', input: Record<string, unknown> = { mode: 'yuzbir' }): TableRec => {
  const r = mgr.createTable(host, input as never)
  if (!r.ok) throw new Error(r.error)
  return r.table
}

describe('lobby + access control', () => {
  it('creates a table with the host in seat 0 and lists it', () => {
    mkTable()
    const tables = mgr.lobby()
    expect(tables).toHaveLength(1)
    expect(tables[0]!.seats[0]!.occupant).toEqual({ kind: 'human', name: 'Host' })
    // the public projection leaks no userIds in seats
    expect(JSON.stringify(tables[0]!.seats)).not.toContain('u-host')
  })

  it('a members-only table denies guests', () => {
    const t = mkTable('u-host', { mode: 'yuzbir', access: { allowedGroups: ['normal', 'premium', 'admin'] } })
    expect(mgr.sit('u-2', t.id, 1).ok).toBe(true)   // normal allowed
    expect(mgr.sit('g-1', t.id, 2).ok).toBe(false)  // guest blocked
  })
})

describe('seating + start + redaction', () => {
  it('sit → start fills empty seats with bots, deals, and sends the host a LEAK-FREE view', async () => {
    const t = mkTable()
    expect(mgr.sit('u-2', t.id, 1).ok).toBe(true)
    const r = await mgr.start('u-host', t.id)
    expect(r.ok).toBe(true)

    const viewEvt = fe.toUserEvents.filter((e) => e.userId === 'u-host' && e.event === 'game:view').pop()
    expect(viewEvt).toBeTruthy()
    const v = viewEvt!.payload.view
    expect(Array.isArray(v.you.rack)).toBe(true)         // host sees their OWN rack
    expect(v.opponents.every((o: object) => !('rack' in o))).toBe(true) // opponents: counts only
    expect('stock' in v).toBe(false)                      // stock order never shipped
    expect(typeof v.stockCount).toBe('number')
    // the table is now playing with 4 actors (2 humans + 2 bots)
    expect(mgr.lobby()[0]!.status).toBe('playing')
    expect(mgr.lobby()[0]!.seats.filter((s) => s.occupant?.kind === 'bot')).toHaveLength(2)
  })

  it('rejects an intent from a non-seated user and a stale baseVersion', async () => {
    const t = mkTable()
    await mgr.start('u-host', t.id)
    expect((await mgr.intent('g-1', t.id, 999, { type: 'DrawFromStock', seat: 0 } as never)).ok).toBe(false) // no seat
    // wrong baseVersion from a seated user
    const bad = await mgr.intent('u-host', t.id, -1, { type: 'DrawFromStock', seat: 0 } as never)
    expect(bad.ok).toBe(false)
  })

  it('host-only: a non-host cannot start the table', async () => {
    const t = mkTable()
    mgr.sit('u-2', t.id, 1)
    expect((await mgr.start('u-2', t.id)).ok).toBe(false)
  })
})

describe('AFK (host-level): safe auto-move + bot takeover', () => {
  it('auto-plays for an idle human, then a bot takes the seat over after continuous absence', async () => {
    const changes: { seat: number; kind: string }[] = []
    const host = new GameHost({
      tableId: 't-afk', mode: 'yuzbir',
      actors: [{ kind: 'human', userId: 'u' }, { kind: 'bot' }, { kind: 'bot' }, { kind: 'bot' }],
      botDelayMs: 0, afkAutoMoveMs: 25, afkTakeoverMs: 70,
      onActorChange: (seat, a) => changes.push({ seat, kind: a.kind }),
    })
    await host.startNewMatch()
    const startVersion = host.currentVersion
    await new Promise((r) => setTimeout(r, 350)) // let auto-moves + takeover happen
    expect(host.currentVersion).toBeGreaterThan(startVersion)             // auto-moves advanced the game
    expect(changes.some((c) => c.seat === 0 && c.kind === 'bot')).toBe(true) // bot took the idle seat over
    host.dispose()
  })

  it('reclaim re-binds a returning human to their seat', async () => {
    const changes: { seat: number; kind: string }[] = []
    const host = new GameHost({
      tableId: 't-rec', mode: 'yuzbir',
      actors: [{ kind: 'human', userId: 'u' }, { kind: 'bot' }, { kind: 'bot' }, { kind: 'bot' }],
      botDelayMs: 0, afkAutoMoveMs: 15, afkTakeoverMs: 40,
      onActorChange: (seat, a) => changes.push({ seat, kind: a.kind }),
    })
    await host.startNewMatch()
    await new Promise((r) => setTimeout(r, 120)) // bot takes over
    await host.reclaim(0, 'u')
    expect(changes.some((c) => c.seat === 0 && c.kind === 'human')).toBe(true)
    host.dispose()
  })
})
