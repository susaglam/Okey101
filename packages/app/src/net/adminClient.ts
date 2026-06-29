// packages/app/src/net/adminClient.ts
// Thin client over the server's /admin API (users + groups + feature matrix). Every
// call goes through adminFetch (Bearer access token, refresh-on-401-retry). Used by
// the online admin panel; mirrors the server routes in packages/server/src/admin.
import { adminFetch } from './authClient'
import type { Feature } from '../auth'

export interface AdminGroup { id: string; name: string; features: Record<Feature, boolean>; isAdmin: boolean; builtin: boolean }
export interface AdminUser { id: string; username: string; email?: string; groupId: string; isAdmin: boolean }

export const listAdminUsers = () => adminFetch<{ users: AdminUser[] }>('/admin/users')
export const listAdminGroups = () => adminFetch<{ groups: AdminGroup[] }>('/admin/groups')

export const createAdminUser = (body: { username: string; password?: string; email?: string; groupId: string }) =>
  adminFetch<{ user?: AdminUser; tempPassword?: string; error?: string }>('/admin/users', { method: 'POST', body: JSON.stringify(body) })

export const updateAdminUser = (id: string, body: Partial<{ username: string; email: string; groupId: string; password: string }>) =>
  adminFetch<{ user?: AdminUser; error?: string }>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) })

export const deleteAdminUser = (id: string) =>
  adminFetch<{ ok?: boolean; error?: string }>(`/admin/users/${id}`, { method: 'DELETE' })

export const createAdminGroup = (body: { name: string; features?: Partial<Record<Feature, boolean>> }) =>
  adminFetch<{ group?: AdminGroup; error?: string }>('/admin/groups', { method: 'POST', body: JSON.stringify(body) })

export const updateAdminGroup = (id: string, body: Partial<{ name: string; features: Partial<Record<Feature, boolean>> }>) =>
  adminFetch<{ group?: AdminGroup; error?: string }>(`/admin/groups/${id}`, { method: 'PATCH', body: JSON.stringify(body) })

export const deleteAdminGroup = (id: string) =>
  adminFetch<{ ok?: boolean; error?: string }>(`/admin/groups/${id}`, { method: 'DELETE' })
