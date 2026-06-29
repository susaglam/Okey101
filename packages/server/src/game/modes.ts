// packages/server/src/game/modes.ts
// Server-side game modes (mirrors the client's modes.ts). The mode picks the engine
// VariantConfig; Eşli 101 bakes teamMode in.
import { KLASIK, KLASIK_101, type VariantConfig } from '@cs-okey/engine'

export type GameMode = 'klasik' | 'yuzbir' | 'yuzbir-esli'
export const MODES: GameMode[] = ['klasik', 'yuzbir', 'yuzbir-esli']

export function isGameMode(x: unknown): x is GameMode {
  return x === 'klasik' || x === 'yuzbir' || x === 'yuzbir-esli'
}

export function configForMode(mode: GameMode): VariantConfig {
  if (mode === 'klasik') return KLASIK
  if (mode === 'yuzbir-esli') return { ...KLASIK_101, teamMode: true }
  return KLASIK_101
}
