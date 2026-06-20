// packages/app/src/adapter/LocalAdapter.ts
import {
  reduce, RuleError, redactFor, legalMoves as legalMovesKlasik, legalMoves101, makeRng, deriveSeed, KLASIK, KLASIK_101, scoreHand, scoreHand101,
  type GameState, type GameEvent, type PlayerView, type VariantConfig,
} from '@cs-okey/engine'
import { decide } from '@cs-okey/bot'
import type { Adapter, LocalOptions, RejectionCode, Status } from './Adapter'
import { applyHandScore, type MatchState } from '../match'
import { saveGame, clearGame, type SaveData, type VariantId } from '../persistence'

export class LocalAdapter implements Adapter {
  private state: GameState
  private version = 0
  private viewCb: ((v: PlayerView) => void) | null = null
  private statusCb: ((s: Status) => void) | null = null
  private readonly humanSeat: number
  private seed: number
  private readonly totalHands: number
  private variant: VariantConfig
  private standings: number[]
  private scoredHandNo: number | null = null

  constructor(opts: LocalOptions) {
    this.humanSeat = opts.humanSeat
    this.seed = opts.seed

    if (opts.resumeFrom) {
      const rf = opts.resumeFrom
      // Restore variant from saved variantId
      this.variant = rf.variantId === 'yuzbir' ? KLASIK_101 : KLASIK
      // totalHands from the restored variant (or opts override)
      this.totalHands = opts.matchHands ?? this.variant.matchHands ?? 5
      // Restore state directly — no CreateGame/StartHand
      this.state = rf.state as GameState
      this.version = rf.version
      this.standings = [...rf.standings]
      this.scoredHandNo = rf.scoredHandNo
      // Restore the master seed so bot RNG continues deterministically. Older
      // saves lack `seed`, but CreateGame stored it as state.rngSeed — use that.
      this.seed = rf.seed ?? this.state.rngSeed ?? opts.seed
    } else {
      this.variant = opts.variant ?? KLASIK
      this.totalHands = opts.matchHands ?? this.variant.matchHands ?? 5
      this.standings = [0, 0, 0, 0]
      let s = reduce(null, { type: 'CreateGame', gameId: 'local', seed: opts.seed, config: this.variant })
      s = reduce(s, { type: 'StartHand' })
      this.state = s
      // StartHand just dealt — hand is not ENDED here, settleIfEnded is a no-op
      this.settleIfEnded()
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

  private get variantId(): VariantId {
    return this.variant.scoringModel === 'yuzbir-penalty' ? 'yuzbir' : 'klasik'
  }

  snapshot(): SaveData {
    return {
      version: this.version,
      variantId: this.variantId,
      state: JSON.parse(JSON.stringify(this.state)),
      standings: [...this.standings],
      scoredHandNo: this.scoredHandNo ?? 0,
      savedAt: 0,
      seed: this.seed,
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
    if (this.getMatch().over) return
    this.state = reduce(this.state, { type: 'StartHand' })
    this.version++
    this.viewCb?.(this.getHumanView())
    // Auto-save after nextHand
    if (this.getMatch().over) {
      clearGame(this.variantId)
    } else {
      saveGame(this.snapshot())
    }
  }

  subscribe(onView: (v: PlayerView) => void, onStatus: (s: Status) => void): () => void {
    this.viewCb = onView; this.statusCb = onStatus
    onStatus('connected')
    onView(this.getHumanView())
    return () => { this.viewCb = null; this.statusCb = null }
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
    this.runBots()
    this.settleIfEnded()
    this.viewCb?.(this.getHumanView())
    // Auto-save after dispatch
    if (this.getMatch().over) {
      clearGame(this.variantId)
    } else {
      saveGame(this.snapshot())
    }
    return { accepted: true }
  }

  private settleIfEnded(): void {
    if (this.state.status === 'ENDED' && this.state.handNo !== this.scoredHandNo) {
      const deltas = this.variant.scoringModel === 'yuzbir-penalty'
        ? scoreHand101(this.state)
        : scoreHand(this.state)
      this.standings = applyHandScore(this.standings, deltas)
      this.scoredHandNo = this.state.handNo
    }
  }

  private runBots(): void {
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
