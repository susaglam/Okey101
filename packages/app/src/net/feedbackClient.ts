// packages/app/src/net/feedbackClient.ts
// In-app feedback (bug reports + suggestions). Submission is available to any signed-in
// user; listing/managing is admin-only. Reuses the authed fetch (Bearer + refresh-on-401).
import { adminFetch } from './authClient'

export type FeedbackKind = 'bug' | 'suggestion'
export interface FeedbackInput { kind: FeedbackKind; category?: string; message: string; screenshot?: string; tableId?: string }

export const submitFeedback = (f: FeedbackInput) =>
  adminFetch<{ ok?: boolean; error?: string }>('/feedback', { method: 'POST', body: JSON.stringify(f) })

// ── admin ────────────────────────────────────────────────────────────────────
export interface FeedbackItem {
  id: string; userId: string | null; username: string | null; kind: FeedbackKind
  category: string | null; message: string; tableId: string | null
  status: 'open' | 'resolved'; createdAt: number; hasScreenshot: boolean
}
export const listFeedback = () => adminFetch<{ items: FeedbackItem[] }>('/admin/feedback')
export const getFeedbackScreenshot = (id: string) => adminFetch<{ feedback?: { screenshot: string | null } }>(`/admin/feedback/${id}`)
export const setFeedbackStatus = (id: string, status: 'open' | 'resolved') =>
  adminFetch<{ ok?: boolean }>(`/admin/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
export const deleteFeedback = (id: string) => adminFetch<{ ok?: boolean }>(`/admin/feedback/${id}`, { method: 'DELETE' })
