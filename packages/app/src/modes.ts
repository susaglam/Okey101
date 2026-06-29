import { KLASIK, KLASIK_101, type VariantConfig } from '@cs-okey/engine'

/**
 * A GAME MODE is the user-facing choice on the menu/lobby. It is distinct from the
 * engine's VariantConfig: several modes can share the same rules family but differ
 * in a flag (e.g. 101 vs Eşli 101 are both yuzbir-penalty, but Eşli forces teamMode).
 * The mode id is ALSO the save-slot key today (one slot per mode); the lobby will
 * later key saves by tableId instead, but mode stays the rules selector.
 */
export type GameMode = 'klasik' | 'yuzbir' | 'yuzbir-esli'

export interface ModeDef {
  id: GameMode
  title: string
  subtitle: string
  /** The full engine config this mode plays with. teamMode is INTRINSIC here, not a
   *  separate runtime toggle — Eşli 101 is just 101 with teamMode baked in. */
  config: VariantConfig
}

export const MODES: Record<GameMode, ModeDef> = {
  klasik: { id: 'klasik', title: 'Klasik', subtitle: 'Per + 7 çift', config: KLASIK },
  yuzbir: { id: 'yuzbir', title: '101', subtitle: 'El açma ≥101', config: KLASIK_101 },
  'yuzbir-esli': {
    id: 'yuzbir-esli',
    title: 'Eşli 101',
    subtitle: '2 takım · Sen + karşı',
    config: { ...KLASIK_101, teamMode: true },
  },
}

export const MODE_ORDER: GameMode[] = ['klasik', 'yuzbir', 'yuzbir-esli']

/** Resolve a (possibly legacy / unknown) mode id to a known one. Old saves used
 *  only 'klasik' | 'yuzbir'; anything unrecognised falls back to 'klasik'. */
export function resolveMode(id: string | undefined | null): GameMode {
  return id != null && id in MODES ? (id as GameMode) : 'klasik'
}

export function configForMode(mode: GameMode): VariantConfig {
  return MODES[mode].config
}
