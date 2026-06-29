// Shared test helpers for the auth/session gate (not a test file — no *.test.*).
import { loginAsGuest, FEATURE_IDS, type CurrentUser, type Feature } from '../src/auth'

const allOn = Object.fromEntries(FEATURE_IDS.map((f) => [f, true])) as Record<Feature, boolean>

/** A registered "normal" user with every assist enabled — the default for UI tests
 *  that expect the full feature set (matches pre-gating behaviour). */
export const TEST_USER: CurrentUser = {
  id: 'test', name: 'Test', kind: 'registered',
  group: { id: 'normal', name: 'Normal', features: allOn }, isAdmin: false,
}

/** Sign in as a guest so <App/> renders the menu instead of the Login gate. */
export function signInGuest(): void {
  loginAsGuest()
}
