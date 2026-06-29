// packages/server/src/types.ts
// Server-side domain types. (The client mirrors these in auth.ts/tables.ts; once the
// client talks to the server these become the single source via the shared payloads.)
import type { Feature } from './db.ts'

export interface UserGroup {
  id: string
  name: string
  features: Record<Feature, boolean>
  isAdmin: boolean
  builtin: boolean
}

export interface UserAccount {
  id: string
  username: string
  email?: string
  groupId: string
  createdAt: number
}

/** A user as exposed to clients — NEVER includes the password hash. */
export interface PublicUser {
  id: string
  username: string
  email?: string
  groupId: string
  isAdmin: boolean
  features: Record<Feature, boolean>
}
