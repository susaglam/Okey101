// packages/app/src/adapter/OnlineAdapter.ts
// GameScreen-compatible adapter backed by the server (Socket.IO). It mirrors the
// LocalAdapter surface but every move goes to the authoritative server, and every
// view comes from the server's per-seat redactFor() push — the client never computes
// game state.
import type { GameEvent, PlayerView } from '@cs-okey/engine'
import type { GameAdapter, RejectionCode, Status, TurnTimer } from './Adapter'
import type { MatchState, HandRecord } from '../match'
import type { OnlineClient } from '../net/online'

interface GameViewMsg { tableId: string; view: PlayerView; legal: GameEvent['type'][]; match: MatchState; history?: HandRecord[]; turnTimer?: TurnTimer | null; botSeats?: number[] }

export class OnlineAdapter implements GameAdapter {
  private viewCb: ((v: PlayerView) => void) | null = null
  private lastView: PlayerView | null = null
  private legal: GameEvent['type'][] = []
  private match: MatchState
  private history: HandRecord[] = []
  private timer: TurnTimer | null = null
  private bots: number[] = []

  constructor(private client: OnlineClient, private tableId: string, initialMatch?: MatchState) {
    this.match = initialMatch ?? { handNo: 1, totalHands: 11, standings: [0, 0, 0, 0], over: false }
  }

  subscribe(onView: (v: PlayerView) => void, onStatus: (s: Status) => void): () => void {
    this.viewCb = onView
    onStatus('connected')
    const off = this.client.on<GameViewMsg>('game:view', (p) => {
      if (p.tableId !== this.tableId) return
      this.lastView = p.view; this.legal = p.legal; this.match = p.match
      if (Array.isArray(p.history)) this.history = p.history
      this.timer = p.turnTimer ?? null
      this.bots = Array.isArray(p.botSeats) ? p.botSeats : []
      this.viewCb?.(p.view)
    })
    if (this.lastView) onView(this.lastView)
    // The first game:view may have been emitted during table:start, BEFORE this
    // listener existed. Re-join now (listener is attached) so the server re-pushes
    // our current redacted view.
    void this.client.joinTable(this.tableId)
    return () => { off(); this.viewCb = null }
  }

  async dispatch(intent: GameEvent & { expectedVersion: number }): Promise<{ accepted: boolean; reason?: RejectionCode }> {
    const { expectedVersion, ...event } = intent
    const base = this.lastView?.version ?? expectedVersion
    const resp = await this.client.intent<{ ok?: boolean; code?: string }>(this.tableId, base, event)
    if (resp?.ok) return { accepted: true }
    const reason: RejectionCode = resp?.code === 'stale' ? 'stale-version' : 'illegal-move'
    return { accepted: false, reason }
  }

  legalMoves(): GameEvent['type'][] { return this.legal }
  currentVersion(): number { return this.lastView?.version ?? 0 }
  getMatch(): MatchState { return this.match }
  getHistory(): HandRecord[] { return this.history }
  turnTimer(): TurnTimer | null { return this.timer }
  botSeats(): number[] { return this.bots }
  nextHand(): void { void this.client.nextHand(this.tableId) }
}
