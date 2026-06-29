// packages/app/src/adapter/OnlineAdapter.ts
// GameScreen-compatible adapter backed by the server (Socket.IO). It mirrors the
// LocalAdapter surface but every move goes to the authoritative server, and every
// view comes from the server's per-seat redactFor() push — the client never computes
// game state.
import type { GameEvent, PlayerView } from '@cs-okey/engine'
import type { GameAdapter, RejectionCode, Status } from './Adapter'
import type { MatchState, HandRecord } from '../match'
import type { OnlineClient } from '../net/online'

interface GameViewMsg { tableId: string; view: PlayerView; legal: GameEvent['type'][]; match: MatchState }

export class OnlineAdapter implements GameAdapter {
  private viewCb: ((v: PlayerView) => void) | null = null
  private lastView: PlayerView | null = null
  private legal: GameEvent['type'][] = []
  private match: MatchState

  constructor(private client: OnlineClient, private tableId: string, initialMatch?: MatchState) {
    this.match = initialMatch ?? { handNo: 1, totalHands: 11, standings: [0, 0, 0, 0], over: false }
  }

  subscribe(onView: (v: PlayerView) => void, onStatus: (s: Status) => void): () => void {
    this.viewCb = onView
    onStatus('connected')
    const off = this.client.on<GameViewMsg>('game:view', (p) => {
      if (p.tableId !== this.tableId) return
      this.lastView = p.view; this.legal = p.legal; this.match = p.match
      this.viewCb?.(p.view)
    })
    if (this.lastView) onView(this.lastView)
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
  getHistory(): HandRecord[] { return [] } // server doesn't ship per-hand history to clients yet
  nextHand(): void { void this.client.nextHand(this.tableId) }
}
