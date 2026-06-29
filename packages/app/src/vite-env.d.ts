// Vite injects import.meta.env at build time; declare the bits we read so the
// standalone typecheck (plain tsc, no vite/client) knows about them.
interface ImportMetaEnv {
  /** Base URL of the CS Okey server (empty = same origin). Set in .env for dev. */
  readonly VITE_SERVER_URL?: string
  /** '1' builds the online (server-driven) client instead of the offline vs-bots app. */
  readonly VITE_ONLINE?: string
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
