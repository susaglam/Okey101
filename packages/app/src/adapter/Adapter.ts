// packages/app/src/adapter/Adapter.ts
import type { GameEvent, PlayerView, VariantConfig } from '@cs-okey/engine'
import type { SaveData } from '../persistence'
import type { GameMode } from '../modes'
import type { MatchState, HandRecord } from '../match'
export type RejectionCode = 'not-your-turn'|'wrong-phase'|'illegal-move'|'stale-version'|'not-winning'|'must-open-or-return'|'unknown'
export type Status = 'connected'|'reconnecting'|'desync'
/** The active human turn's countdown (server-enforced). seat = whose turn; budgetMs =
 *  the full per-phase time; deadlineMs = epoch ms when the auto-move fires. */
export interface TurnTimer { seat: number; phase: string; budgetMs: number; deadlineMs: number }
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
  /** The active turn's countdown for the UI ring, or null (offline / bot turn / no timer). */
  turnTimer?(): TurnTimer | null
}
export interface LocalOptions { seed: number; humanSeat: number; /** Game mode — drives the rules (with variant). */ mode?: GameMode; /** Lobby table id — the save-slot key. Defaults to the mode (legacy single-table). */ tableId?: string; difficulty?: 'easy'; matchHands?: number; variant?: VariantConfig; resumeFrom?: SaveData; /** Delay between bot moves (ms) so each is visible. 0 = instant (default, tests). */ botDelayMs?: number; /** Countdown (ms) after a non-final hand ends before auto-starting the next. 0 disables (tests). Default 6000. */ autoNextMs?: number }
