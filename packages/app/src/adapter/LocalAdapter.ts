// packages/app/src/adapter/LocalAdapter.ts
import {
  reduce, RuleError, redactFor, legalMoves as legalMovesKlasik, legalMoves101, makeRng, deriveSeed, scoreHand, scoreHand101, okeyHeldPenalties,
  type GameState, type GameEvent, type PlayerView, type VariantConfig,
} from '@cs-okey/engine'
import { decide } from '@cs-okey/bot'
import type { Adapter, LocalOptions, RejectionCode, Status } from './Adapter'
import { applyHandScore, type MatchState, type HandRecord } from '../match'
import { saveGame, clearGame, saveMode, type SaveData } from '../persistence'
import { configForMode, type GameMode } from '../modes'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class LocalAdapter implements Adapter {
  private state: GameState
  private version = 0
  private viewCb: ((v: PlayerView) => void) | null = null
  private statusCb: ((s: Status) => void) | null = null
  private readonly humanSeat: number
  private seed: number
  private readonly totalHands: number
  private variant: VariantConfig
  private mode: GameMode
  private tableId: string
  private standings: number[]
  private scoredHandNo: number | null = null
  private history: HandRecord[] = []
  private readonly botDelayMs: number
  private readonly autoNextMs: number
  private autoNextTimer: ReturnType<typeof setTimeout> | null = null

  constructor(opts: LocalOptions) {
    this.humanSeat = opts.humanSeat
    this.seed = opts.seed
    this.botDelayMs = opts.botDelayMs ?? 0
    this.autoNextMs = opts.autoNextMs ?? 6_000

    if (opts.resumeFrom) {
      const rf = opts.resumeFrom
      // Restore mode + its config (rebuilds teamMode for Eşli — never downgrades it).
      this.mode = saveMode(rf)
      this.tableId = rf.tableId ?? this.mode
      this.variant = configForMode(this.mode)
      // totalHands from the restored variant (or opts override)
      this.totalHands = opts.matchHands ?? this.variant.matchHands ?? 5
      // Restore state directly — no CreateGame/StartHand
      this.state = rf.state as GameState
      this.version = rf.version
      this.standings = [...rf.standings]
      this.scoredHandNo = rf.scoredHandNo
      this.history = rf.history ? rf.history.map((h) => ({ ...h })) : []
      // Restore the master seed so bot RNG continues deterministically. Older
      // saves lack `seed`, but CreateGame stored it as state.rngSeed — use that.
      this.seed = rf.seed ?? this.state.rngSeed ?? opts.seed
    } else {
      this.mode = opts.mode ?? 'klasik'
      this.tableId = opts.tableId ?? this.mode
      this.variant = opts.variant ?? configForMode(this.mode)
      this.totalHands = opts.matchHands ?? this.variant.matchHands ?? 5
      this.standings = [0, 0, 0, 0]
      let s = reduce(null, { type: 'CreateGame', gameId: 'local', seed: opts.seed, config: this.variant })
      s = reduce(s, { type: 'StartHand' })
      this.state = s
      // The first hand always starts on the human (handNo 0 → starter 0), so no
      // bots need to run here. StartHand just dealt — settleIfEnded is a no-op.
      this.settleIfEnded()
      // Persist the fresh deal immediately (lobby tables only) so a table re-entered
      // before any move resumes the SAME hand ("Devam Et"), not a reshuffled one.
      // Legacy/test adapters (no explicit tableId) keep the old "save on first move".
      if (opts.tableId != null) saveGame(this.snapshot())
    }
  }

  currentVersion(): number { return this.version }
  getHumanView(): PlayerView { return redactFor(this.state, this.humanSeat, this.version) }

  /** Legal event types for the human seat — single source of truth for UI action gating. */
  legalMoves(): GameEvent['type'][] {
    return this.variant.requiresOpening
      ? legalMoves101(this.state, this.humanSeat)
      : legalMovesKlasik(this.state, this.humanSeat)
  }

  snapshot(): SaveData {
    return {
      version: this.version,
      mode: this.mode,
      tableId: this.tableId,
      // Legacy field kept so an older build could still read the save's rules family.
      variantId: this.variant.scoringModel === 'yuzbir-penalty' ? 'yuzbir' : 'klasik',
      state: JSON.parse(JSON.stringify(this.state)),
      standings: [...this.standings],
      scoredHandNo: this.scoredHandNo ?? 0,
      savedAt: 0,
      seed: this.seed,
      history: this.history.map((h) => ({ ...h, deltas: [...h.deltas], penalties: [...h.penalties] })),
    }
  }

  getMatch(): MatchState {
    const { handNo, status } = this.state
    return {
      handNo,
      totalHands: this.totalHands,
      standings: [...this.standings],
      over: handNo >= this.totalHands && status === 'ENDED',
    }
  }

  nextHand(): void {
    if (this.autoNextTimer) { clearTimeout(this.autoNextTimer); this.autoNextTimer = null }
    // Guard: only a freshly-ENDED, non-final hand advances (idempotent vs the auto
    // timer racing a manual "skip" press).
    if (this.state.status !== 'ENDED' || this.getMatch().over) return
    this.state = reduce(this.state, { type: 'StartHand' })
    this.version++
    this.viewCb?.(this.getHumanView()) // show the fresh deal immediately
    // The starting seat rotates each hand; if it opens on a bot, play the bots
    // forward (paced) until it is the human's turn. Fire-and-forget — viewCb
    // updates flow in as each bot moves.
    void this.advance()
  }

  /** After a hand ends (and the match isn't over), auto-advance to the next hand
   *  once the countdown elapses — mirrors the server's GameHost so offline and
   *  online behave identically (GameScreen only renders the countdown). */
  private scheduleAutoNext(): void {
    if (this.autoNextTimer) { clearTimeout(this.autoNextTimer); this.autoNextTimer = null }
    // Only when a UI is actually subscribed — keeps headless tests free of dangling timers.
    if (this.viewCb && this.autoNextMs > 0 && this.state.status === 'ENDED' && !this.getMatch().over) {
      this.autoNextTimer = setTimeout(() => { this.autoNextTimer = null; this.nextHand() }, this.autoNextMs)
    }
  }

  subscribe(onView: (v: PlayerView) => void, onStatus: (s: Status) => void): () => void {
    this.viewCb = onView; this.statusCb = onStatus
    onStatus('connected')
    onView(this.getHumanView())
    return () => {
      this.viewCb = null; this.statusCb = null
      if (this.autoNextTimer) { clearTimeout(this.autoNextTimer); this.autoNextTimer = null }
    }
  }

  async dispatch(intent: GameEvent & { expectedVersion: number }): Promise<{ accepted: boolean; reason?: RejectionCode }> {
    if (intent.expectedVersion !== this.version) return { accepted: false, reason: 'stale-version' }
    const { expectedVersion, ...event } = intent
    try {
      this.state = reduce(this.state, event as GameEvent)
      this.version++
    } catch (e) {
      if (e instanceof RuleError) return { accepted: false, reason: this.classify(e.message) }
      throw e
    }
    // Show the human's own move immediately, then let the bots play out (paced).
    this.viewCb?.(this.getHumanView())
    await this.advance()
    return { accepted: true }
  }

  getHistory(): HandRecord[] { return this.history.map((h) => ({ ...h, deltas: [...h.deltas], penalties: [...h.penalties] })) }

  private settleIfEnded(): void {
    if (this.state.status === 'ENDED' && this.state.handNo !== this.scoredHandNo) {
      const deltas = this.variant.scoringModel === 'yuzbir-penalty'
        ? scoreHand101(this.state)
        : scoreHand(this.state)
      this.standings = applyHandScore(this.standings, deltas)
      this.scoredHandNo = this.state.handNo
      // Record this hand for the score table. The okey-held penalty is derived at
      // hand end (not stored in state), so append it here for the breakdown — it
      // matches the +101 scoreHand101 already folded into the deltas.
      const heldPenalties = this.variant.scoringModel === 'yuzbir-penalty'
        ? okeyHeldPenalties(this.state)
        : []
      this.history.push({
        handNo: this.state.handNo,
        deltas: [...deltas],
        penalties: [...(this.state.penaltiesApplied ?? []), ...heldPenalties].map((p) => ({ ...p })),
        winnerSeat: this.state.terminal?.winnerSeat,
        winType: this.state.terminal?.winType,
        reason: this.state.terminal?.reason,
      })
    }
  }

  /** Run bots forward (paced), then settle, emit the final view, and persist. */
  private async advance(): Promise<void> {
    await this.runBots()
    this.settleIfEnded()
    this.viewCb?.(this.getHumanView())
    if (this.getMatch().over) {
      clearGame(this.tableId)
    } else {
      saveGame(this.snapshot())
      this.scheduleAutoNext() // a non-final hand just ended → start the countdown
    }
  }

  private async runBots(): Promise<void> {
    const getLegal = this.variant.requiresOpening
      ? (s: GameState, seat: number) => legalMoves101(s, seat)
      : (s: GameState, seat: number) => legalMovesKlasik(s, seat)
    let guard = 0
    while (this.state.status === 'PLAYING' && this.state.turn.seat !== this.humanSeat && guard++ < 500) {
      const seat = this.state.turn.seat
      const view = redactFor(this.state, seat, this.version)
      const legal = getLegal(this.state, seat)
      if (legal.length === 0) break
      const rng = makeRng(deriveSeed(this.seed, `bot:${seat}:${this.state.handNo}:${this.version}`))
      const ev = decide(view, legal, rng)
      try { this.state = reduce(this.state, ev); this.version++ }
      catch (e) {
        if (!(e instanceof RuleError)) console.error('Bot move error (non-rule):', e)
        // Fallback so a faulty bot move never deadlocks the turn: make a
        // guaranteed-legal move (draw, or discard the first tile) instead of stalling.
        const player = this.state.players.find((p) => p.seat === seat)
        const fallback: GameEvent = this.state.turn.phase === 'DRAW'
          ? { type: 'DrawFromStock', seat }
          : { type: 'Discard', seat, tile: player!.rack[0]! }
        try { this.state = reduce(this.state, fallback); this.version++ }
        catch { break } // truly stuck — bail out rather than loop forever
      }
      // Emit each bot move so the player can follow who is playing (the active
      // seat's nameplate glows and its discard pile updates), paced by botDelayMs.
      this.viewCb?.(this.getHumanView())
      if (this.botDelayMs > 0) await sleep(this.botDelayMs)
    }
  }

  private classify(msg: string): RejectionCode {
    // Check floor-take before the generic 'turn' rule (the message contains "turn").
    if (msg.includes('floor-take')) return 'must-open-or-return'
    if (msg.includes('turn')) return 'not-your-turn'
    if (msg.includes('phase')) return 'wrong-phase'
    if (msg.includes('winning')) return 'not-winning'
    if (msg.includes('rack') || msg.includes('empty')) return 'illegal-move'
    return 'unknown'
  }
}
