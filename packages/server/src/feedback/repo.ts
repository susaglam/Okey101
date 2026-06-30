// packages/server/src/feedback/repo.ts
// In-app feedback (bug reports + suggestions) persisted in SQLite. The admin panel
// reads these; there is no email delivery.
import { randomBytes } from 'node:crypto'
import { db } from '../db.ts'

export type FeedbackKind = 'bug' | 'suggestion'
export interface Feedback {
  id: string
  userId: string | null
  username: string | null
  kind: FeedbackKind
  category: string | null
  message: string
  screenshot: string | null
  tableId: string | null
  status: 'open' | 'resolved'
  createdAt: number
}
interface Row { id: string; user_id: string | null; username: string | null; kind: string; category: string | null; message: string; screenshot: string | null; table_id: string | null; status: string; created_at: number }

function toFeedback(r: Row): Feedback {
  return {
    id: r.id, userId: r.user_id, username: r.username, kind: r.kind as FeedbackKind,
    category: r.category, message: r.message, screenshot: r.screenshot, tableId: r.table_id,
    status: r.status as Feedback['status'], createdAt: r.created_at,
  }
}

export function insertFeedback(f: Omit<Feedback, 'id' | 'status' | 'createdAt'> & { createdAt: number }): string {
  const id = 'fb-' + randomBytes(6).toString('hex')
  db().prepare(
    `INSERT INTO feedback (id, user_id, username, kind, category, message, screenshot, table_id, status, created_at)
     VALUES (@id, @userId, @username, @kind, @category, @message, @screenshot, @tableId, 'open', @createdAt)`,
  ).run({ id, userId: f.userId, username: f.username, kind: f.kind, category: f.category ?? null, message: f.message, screenshot: f.screenshot ?? null, tableId: f.tableId ?? null, createdAt: f.createdAt })
  return id
}

export type FeedbackSummary = Omit<Feedback, 'screenshot'> & { hasScreenshot: boolean }
/** Admin listing. Screenshots can be large, so the list omits them; fetch one via getFeedback. */
export function listFeedback(limit = 300): FeedbackSummary[] {
  const rows = db().prepare('SELECT id, user_id, username, kind, category, message, table_id, status, created_at, (screenshot IS NOT NULL) AS has_shot FROM feedback ORDER BY created_at DESC LIMIT ?').all(limit) as (Row & { has_shot: number })[]
  return rows.map((r) => {
    const { screenshot: _omit, ...rest } = toFeedback(r)
    return { ...rest, hasScreenshot: r.has_shot === 1 }
  })
}

export function getFeedback(id: string): Feedback | undefined {
  const r = db().prepare('SELECT * FROM feedback WHERE id = ?').get(id) as Row | undefined
  return r ? toFeedback(r) : undefined
}

export function setFeedbackStatus(id: string, status: 'open' | 'resolved'): void {
  db().prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, id)
}

export function deleteFeedback(id: string): void {
  db().prepare('DELETE FROM feedback WHERE id = ?').run(id)
}
