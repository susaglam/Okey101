// packages/app/src/adapter/Adapter.ts
import type { GameEvent, PlayerView } from '@cs-okey/engine'
export type RejectionCode = 'not-your-turn'|'wrong-phase'|'illegal-move'|'stale-version'|'not-winning'|'unknown'
export type Status = 'connected'|'reconnecting'|'desync'
export interface Adapter {
  dispatch(intent: GameEvent & { expectedVersion: number }): Promise<{ accepted: boolean; reason?: RejectionCode }>
  subscribe(onView: (v: PlayerView) => void, onStatus: (s: Status) => void): () => void
}
export interface LocalOptions { seed: number; humanSeat: number; difficulty?: 'easy' }
