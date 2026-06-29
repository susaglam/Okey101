// packages/app/src/adapter/Adapter.ts
import type { GameEvent, PlayerView, VariantConfig } from '@cs-okey/engine'
import type { SaveData } from '../persistence'
import type { GameMode } from '../modes'
import type { MatchState, HandRecord } from '../match'
export type RejectionCode = 'not-your-turn'|'wrong-phase'|'illegal-move'|'stale-version'|'not-winning'|'must-open-or-return'|'unknown'
export type Status = 'connected'|'reconnecting'|'desync'
export interface Adapter {
  dispatch(intent: GameEvent & { expectedVersion: number }): Promise<{ accepted: boolean; reason?: RejectionCode }>
  subscribe(onView: (v: PlayerView) => void, onStatus: (s: Status) => void): () => void
  /** Legal event types for the human seat in the current state (single source of truth for action gating). */
  legalMoves(): GameEvent['type'][]
}
/** The full surface GameScreen needs from an adapter — implemented by BOTH the local
 *  (vs-bots) LocalAdapter and the OnlineAdapter (server-driven), so GameScreen is
 *  transport-agnostic. */
export interface GameAdapter extends Adapter {
  getMatch(): MatchState
  getHistory(): HandRecord[]
  currentVersion(): number
  nextHand(): void
}
export interface LocalOptions { seed: number; humanSeat: number; /** Game mode — drives the rules (with variant). */ mode?: GameMode; /** Lobby table id — the save-slot key. Defaults to the mode (legacy single-table). */ tableId?: string; difficulty?: 'easy'; matchHands?: number; variant?: VariantConfig; resumeFrom?: SaveData; /** Delay between bot moves (ms) so each is visible. 0 = instant (default, tests). */ botDelayMs?: number }
