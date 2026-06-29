// packages/server/src/game/host.ts
// Authoritative game host for ONE table. The server is the only place reduce() runs;
// clients send intents and receive ONLY their own redactFor() view. Bots run here too,
// from the SAME redacted view a human would get (fairness + no leak). State is
// persisted after every change so a restart/redeploy resumes the live game.
import {
  reduce, RuleError, redactFor, legalMoves as legalMovesKlasik, legalMoves101,
  makeRng, deriveSeed, scoreHand, scoreHand101, okeyHeldPenalties,
  isWorkableDiscard, tilesEqual,
  type GameState, type GameEvent, type PlayerView, type VariantConfig, type Tile,
} from '@cs-okey/engine'
import { decide } from '@cs-okey/bot'
import { db } from '../db.ts'
import { configForMode, type GameMode } from './modes.ts'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export type SeatActor = { kind: 'human'; userId: string } | { kind: 'bot' }

export interface HostOpts {
  tableId: string
  mode: GameMode
  actors: SeatActor[]      // seat -> actor (length = config.players; all seats filled)
  seed?: number
  /** Host-chosen number of hands for this match (overrides the mode default). */
  matchHands?: number
  botDelayMs?: number
  onChange?: () => void    // called after each state change so the socket layer re-emits views
  onGameOver?: () => void
  /** AFK: ms of inactivity on a human's turn before a safe auto-move (0 disables). */
  afkAutoMoveMs?: number
  /** AFK: ms before a bot takes the seat over until the human reclaims (0 disables). */
  afkTakeoverMs?: number
  /** Countdown (ms) after a hand ends before auto-starting the next (0 disables). */
  autoNextMs?: number
  /** Notified when a seat's actor changes (e.g. AFK bot takeover) so the lobby updates. */
  onActorChange?: (seat: number, actor: SeatActor) => void
}

export type IntentResult =
  | { ok: true }
  | { ok: false; code: 'no-seat' | 'stale' | 'illegal' | 'not-playing'; reason?: string }

export class GameHost {
  readonly tableId: string
  readonly mode: GameMode
  private config: VariantConfig
  private actors: SeatActor[]
  private state!: GameState
  private version = 0
  private seed: number
  private readonly totalHands: number
  private standings: number[]
  private scoredHandNo: number | null = null
  private botDelayMs: number
  private onChange: () => void
  private onGameOver: () => void
  private onActorChange: (seat: number, actor: SeatActor) => void
  private advancing = false
  private readonly afkAutoMoveMs: number
  private readonly afkTakeoverMs: number
  private afkMoveTimer: ReturnType<typeof setTimeout> | null = null
  private afkTakeoverTimer: ReturnType<typeof setTimeout> | null = null
  private readonly autoNextMs: number
  private autoNextTimer: ReturnType<typeof setTimeout> | null = null

  constructor(opts: HostOpts) {
    this.tableId = opts.tableId
    this.mode = opts.mode
    this.config = configForMode(opts.mode)
    // Host may override the match length (1..20 hands); fall back to the mode default.
    if (typeof opts.matchHands === 'number' && opts.matchHands >= 1) {
      this.config = { ...this.config, matchHands: Math.min(20, Math.floor(opts.matchHands)) }
    }
    this.actors = opts.actors
    this.seed = opts.seed ?? Math.floor(Math.random() * 0x7fffffff)
    this.totalHands = this.config.matchHands ?? 11
    this.standings = Array.from({ length: this.config.players }, () => 0)
    this.botDelayMs = opts.botDelayMs ?? 0
    this.onChange = opts.onChange ?? (() => {})
    this.onGameOver = opts.onGameOver ?? (() => {})
    this.onActorChange = opts.onActorChange ?? (() => {})
    this.afkAutoMoveMs = opts.afkAutoMoveMs ?? 20_000
    this.afkTakeoverMs = opts.afkTakeoverMs ?? 90_000
    this.autoNextMs = opts.autoNextMs ?? 6_000
  }

  /** Restore from a persisted games row (server restart). */
  restore(row: { state: GameState; version: number; standings: number[]; seed: number; scoredHandNo: number }): void {
    this.state = row.state
    this.version = row.version
    this.standings = [...row.standings]
    this.seed = row.seed
    this.scoredHandNo = row.scoredHandNo
  }

  /** Deal the first hand and play any leading bots. */
  async startNewMatch(): Promise<void> {
    let s = reduce(null, { type: 'CreateGame', gameId: this.tableId, seed: this.seed, config: this.config })
    s = reduce(s, { type: 'StartHand' })
    this.state = s
    this.version++
    this.settleIfEnded()
    this.persist()
    this.onChange()
    await this.advance()
  }

  get currentVersion(): number { return this.version }
  get status(): GameState['status'] { return this.state.status }
  get handNo(): number { return this.state.handNo }
  get matchOver(): boolean { return this.state.handNo >= this.totalHands && this.state.status === 'ENDED' }
  get turnSeat(): number { return this.state.turn.seat }
  get players(): number { return this.config.players }

  isHumanSeat(seat: number): boolean { return this.actors[seat]?.kind === 'human' }
  seatForUser(userId: string): number {
    return this.actors.findIndex((a) => a.kind === 'human' && a.userId === userId)
  }
  /** Re-bind a (reconnecting) human to their seat actor; no-op if unchanged. */
  setActor(seat: number, actor: SeatActor): void { if (this.actors[seat]) this.actors[seat] = actor }

  viewFor(seat: number): PlayerView { return redactFor(this.state, seat, this.version) }
  legalFor(seat: number): GameEvent['type'][] {
    return this.config.requiresOpening ? legalMoves101(this.state, seat) : legalMovesKlasik(this.state, seat)
  }

  matchState() {
    return { handNo: this.state.handNo, totalHands: this.totalHands, standings: [...this.standings], over: this.matchOver }
  }

  /** Apply a human intent. Seat is derived from the user (never trusted from the wire). */
  async applyIntent(userId: string, baseVersion: number, event: GameEvent): Promise<IntentResult> {
    if (this.state.status !== 'PLAYING') return { ok: false, code: 'not-playing' }
    const seat = this.seatForUser(userId)
    if (seat < 0) return { ok: false, code: 'no-seat' }
    if (baseVersion !== this.version) return { ok: false, code: 'stale' }
    this.clearAfkAll() // the human acted
    // SECURITY: ignore any client-sent seat; force the server-known seat.
    const ev = { ...event, seat } as GameEvent
    try {
      this.state = reduce(this.state, ev)
      this.version++
    } catch (e) {
      if (e instanceof RuleError) return { ok: false, code: 'illegal', reason: e.message }
      throw e
    }
    this.settleIfEnded()
    this.persist()
    this.onChange()
    await this.advance()
    return { ok: true }
  }

  /** Start the next hand (auto after a countdown, or host action). */
  async nextHand(): Promise<void> {
    if (this.autoNextTimer) { clearTimeout(this.autoNextTimer); this.autoNextTimer = null }
    if (this.matchOver || this.state.status !== 'ENDED') return
    this.state = reduce(this.state, { type: 'StartHand' })
    this.version++
    this.persist()
    this.onChange()
    await this.advance()
  }

  // ── bot driving ────────────────────────────────────────────────────────────
  private async advance(): Promise<void> {
    if (this.advancing) return
    this.advancing = true
    try {
      let guard = 0
      while (this.state.status === 'PLAYING' && this.actors[this.state.turn.seat]?.kind === 'bot' && guard++ < 1000) {
        const seat = this.state.turn.seat
        const view = redactFor(this.state, seat, this.version) // same redacted view a human gets
        const legal = this.legalFor(seat)
        if (legal.length === 0) break
        const rng = makeRng(deriveSeed(this.seed, `bot:${seat}:${this.state.handNo}:${this.version}`))
        let ev: GameEvent
        try { ev = decide(view, legal, rng) } catch { ev = this.fallback(seat) }
        try { this.state = reduce(this.state, ev); this.version++ }
        catch { try { this.state = reduce(this.state, this.fallback(seat)); this.version++ } catch { break } }
        this.settleIfEnded()
        this.persist()
        this.onChange()
        if (this.botDelayMs > 0) await sleep(this.botDelayMs)
      }
      if (this.matchOver) this.onGameOver()
    } finally {
      this.advancing = false
    }
    this.armAfk() // it's now a human's turn (or the game ended) — start the AFK clock
    this.scheduleAutoNext() // hand ended (not match over) → auto-advance after a countdown
  }

  /** Auto-start the next hand after a short countdown so play flows without a manual click. */
  private scheduleAutoNext(): void {
    if (this.autoNextTimer) { clearTimeout(this.autoNextTimer); this.autoNextTimer = null }
    if (this.autoNextMs > 0 && this.state.status === 'ENDED' && !this.matchOver) {
      this.autoNextTimer = setTimeout(() => { void this.nextHand() }, this.autoNextMs)
    }
  }

  // ── AFK: 30s safe auto-move (per turn), 90s bot takeover (continuous absence) ──
  // The auto-move timer re-arms each turn to keep the game moving, but the takeover
  // timer is reset ONLY by a real human action — so repeated auto-moves still lead to
  // a bot takeover after ~90s of true absence.
  private clearAfkAll(): void {
    if (this.afkMoveTimer) { clearTimeout(this.afkMoveTimer); this.afkMoveTimer = null }
    if (this.afkTakeoverTimer) { clearTimeout(this.afkTakeoverTimer); this.afkTakeoverTimer = null }
  }

  private armAfk(): void {
    if (this.afkMoveTimer) { clearTimeout(this.afkMoveTimer); this.afkMoveTimer = null }
    if (this.state.status !== 'PLAYING') { this.clearAfkAll(); return }
    const seat = this.state.turn.seat
    if (!this.isHumanSeat(seat)) return // bots' turn — keep the takeover clock running
    if (this.afkAutoMoveMs > 0) this.afkMoveTimer = setTimeout(() => { void this.afkAutoMove(seat) }, this.afkAutoMoveMs)
    if (this.afkTakeoverMs > 0 && !this.afkTakeoverTimer) this.afkTakeoverTimer = setTimeout(() => { void this.afkTakeover(seat) }, this.afkTakeoverMs)
  }

  /** Auto-play ONE phase for an idle human: draw from stock on DRAW, a safe non-işlek
   *  discard on DISCARD. Each phase has its own turn-timer, so a draw and a discard
   *  each get the full configured time (default 20s) before the system acts. */
  private async afkAutoMove(seat: number): Promise<void> {
    if (this.state.status !== 'PLAYING' || this.state.turn.seat !== seat) return
    try {
      const ev = this.state.turn.phase === 'DRAW' ? { type: 'DrawFromStock', seat } as GameEvent : this.safeDiscard(seat)
      this.state = reduce(this.state, ev); this.version++
    } catch { try { this.state = reduce(this.state, this.fallback(seat)); this.version++ } catch { /* stuck */ } }
    this.settleIfEnded(); this.persist(); this.onChange()
    await this.advance()
  }

  /** After prolonged absence, a bot takes the seat over until the human reclaims it. */
  private async afkTakeover(seat: number): Promise<void> {
    if (!this.isHumanSeat(seat)) return
    this.clearAfkAll()
    this.actors[seat] = { kind: 'bot' }
    this.onActorChange(seat, { kind: 'bot' })
    this.onChange()
    if (this.state.status === 'PLAYING' && this.state.turn.seat === seat) await this.advance()
  }

  /** A returning human re-binds to their seat (the table still records them there). */
  async reclaim(seat: number, userId: string): Promise<void> {
    if (seat < 0 || seat >= this.actors.length) return
    this.actors[seat] = { kind: 'human', userId }
    this.onActorChange(seat, { kind: 'human', userId })
    this.clearAfkAll()
    if (this.state.status === 'PLAYING' && this.state.turn.seat === seat) this.armAfk()
  }

  /** Discard a tile that is NOT işlek and not the okey (falls back gracefully). */
  private safeDiscard(seat: number): GameEvent {
    const p = this.state.players.find((x) => x.seat === seat)!
    const okey = this.state.okey
    const isOkey = (t: Tile) => okey != null && t.kind === 'NUMBER' && tilesEqual(t, okey)
    const safe = p.rack.find((t) => !isOkey(t) && !isWorkableDiscard(t, this.state.tableMelds ?? [], okey, this.config))
    const tile = safe ?? p.rack.find((t) => !isOkey(t)) ?? p.rack[0]!
    return { type: 'Discard', seat, tile }
  }

  /** Stop all timers (table closed / server shutdown). */
  dispose(): void { this.clearAfkAll(); if (this.autoNextTimer) { clearTimeout(this.autoNextTimer); this.autoNextTimer = null } }

  /** A guaranteed-legal move so a bad bot move never stalls a seat. */
  private fallback(seat: number): GameEvent {
    const player = this.state.players.find((p) => p.seat === seat)
    return this.state.turn.phase === 'DRAW'
      ? { type: 'DrawFromStock', seat }
      : { type: 'Discard', seat, tile: player!.rack[0]! }
  }

  // ── scoring + persistence ────────────────────────────────────────────────────
  private settleIfEnded(): void {
    if (this.state.status === 'ENDED' && this.state.handNo !== this.scoredHandNo) {
      const deltas = this.config.scoringModel === 'yuzbir-penalty' ? scoreHand101(this.state) : scoreHand(this.state)
      this.standings = this.standings.map((v, i) => v + (deltas[i] ?? 0))
      this.scoredHandNo = this.state.handNo
      const held = this.config.scoringModel === 'yuzbir-penalty' ? okeyHeldPenalties(this.state) : []
      this.appendHistory(deltas, held)
    }
  }

  private history: unknown[] = []
  private appendHistory(deltas: number[], held: { seat: number; type: string }[]): void {
    this.history.push({
      handNo: this.state.handNo,
      deltas: [...deltas],
      penalties: [...(this.state.penaltiesApplied ?? []), ...held].map((p) => ({ ...p })),
      winnerSeat: this.state.terminal?.winnerSeat,
      winType: this.state.terminal?.winType,
      reason: this.state.terminal?.reason,
    })
  }

  private persist(): void {
    db().prepare(
      `INSERT INTO games (table_id, state, version, standings, history, seed, scored_hand_no, updated_at)
       VALUES (@id, @state, @version, @standings, @history, @seed, @scored, @updated)
       ON CONFLICT(table_id) DO UPDATE SET state=@state, version=@version, standings=@standings, history=@history, scored_hand_no=@scored, updated_at=@updated`,
    ).run({
      id: this.tableId, state: JSON.stringify(this.state), version: this.version,
      standings: JSON.stringify(this.standings), history: JSON.stringify(this.history),
      seed: this.seed, scored: this.scoredHandNo ?? 0, updated: Date.now(),
    })
  }
}
