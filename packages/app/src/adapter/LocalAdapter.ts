// packages/app/src/adapter/LocalAdapter.ts
import {
  reduce, RuleError, redactFor, legalMoves, makeRng, deriveSeed, KLASIK, scoreHand,
  type GameState, type GameEvent, type PlayerView,
} from '@cs-okey/engine'
import { decide } from '@cs-okey/bot'
import type { Adapter, LocalOptions, RejectionCode, Status } from './Adapter'
import { applyHandScore, type MatchState } from '../match'

export class LocalAdapter implements Adapter {
  private state: GameState
  private version = 0
  private viewCb: ((v: PlayerView) => void) | null = null
  private statusCb: ((s: Status) => void) | null = null
  private readonly humanSeat: number
  private readonly seed: number
  private readonly totalHands: number
  private standings: number[]
  private scoredHandNo: number | null = null

  constructor(opts: LocalOptions) {
    this.humanSeat = opts.humanSeat
    this.seed = opts.seed
    this.totalHands = opts.matchHands ?? 5
    this.standings = [0, 0, 0, 0]
    let s = reduce(null, { type: 'CreateGame', gameId: 'local', seed: opts.seed, config: KLASIK })
    s = reduce(s, { type: 'StartHand' })
    this.state = s
    // StartHand just dealt — hand is not ENDED here, settleIfEnded is a no-op
    this.settleIfEnded()
  }

  currentVersion(): number { return this.version }
  getHumanView(): PlayerView { return redactFor(this.state, this.humanSeat, this.version) }

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
    return { accepted: true }
  }

  private settleIfEnded(): void {
    if (this.state.status === 'ENDED' && this.state.handNo !== this.scoredHandNo) {
      const deltas = scoreHand(this.state)
      this.standings = applyHandScore(this.standings, deltas)
      this.scoredHandNo = this.state.handNo
    }
  }

  private runBots(): void {
    let guard = 0
    while (this.state.status === 'PLAYING' && this.state.turn.seat !== this.humanSeat && guard++ < 500) {
      const seat = this.state.turn.seat
      const view = redactFor(this.state, seat, this.version)
      const legal = legalMoves(this.state, seat)
      if (legal.length === 0) break
      const rng = makeRng(deriveSeed(this.seed, `bot:${seat}:${this.state.handNo}:${this.version}`))
      const ev = decide(view, legal, rng)
      try { this.state = reduce(this.state, ev); this.version++ }
      catch (e) {
        if (!(e instanceof RuleError)) console.error('Bot move error (non-rule):', e)
        break // a bad bot move ends its turn rather than crashing the game
      }
    }
  }

  private classify(msg: string): RejectionCode {
    if (msg.includes('turn')) return 'not-your-turn'
    if (msg.includes('phase')) return 'wrong-phase'
    if (msg.includes('winning')) return 'not-winning'
    if (msg.includes('rack') || msg.includes('empty')) return 'illegal-move'
    return 'unknown'
  }
}
