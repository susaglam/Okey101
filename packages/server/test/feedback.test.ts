import { describe, it, expect, beforeEach } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.CS_OKEY_DB = ':memory:'
process.env.BCRYPT_COST = '4'

const { _closeDbForTests, db } = await import('../src/db.ts')
const { insertFeedback, listFeedback, getFeedback, setFeedbackStatus, deleteFeedback } = await import('../src/feedback/repo.ts')

beforeEach(() => { _closeDbForTests(); db() })

describe('feedback repo', () => {
  it('stores, lists (without the screenshot blob), reads, resolves and deletes', () => {
    const id = insertFeedback({
      userId: 'u1', username: 'Ali', kind: 'bug', category: 'move',
      message: 'Sarı 12 işlek görünmüyor', screenshot: 'data:image/png;base64,AAAA',
      tableId: 't-1', createdAt: 1000,
    })
    insertFeedback({ userId: 'u2', username: 'Veli', kind: 'suggestion', category: 'feature', message: 'Sohbet ekle', screenshot: null, tableId: null, createdAt: 2000 })

    const list = listFeedback()
    expect(list).toHaveLength(2)
    expect(list[0]!.createdAt).toBe(2000) // newest first
    const bug = list.find((f) => f.id === id)!
    expect(bug.kind).toBe('bug')
    expect(bug.hasScreenshot).toBe(true)            // flagged…
    expect('screenshot' in bug).toBe(false)         // …but the blob is NOT in the list

    expect(getFeedback(id)!.screenshot).toContain('data:image/png') // full fetch has it

    setFeedbackStatus(id, 'resolved')
    expect(getFeedback(id)!.status).toBe('resolved')

    deleteFeedback(id)
    expect(listFeedback()).toHaveLength(1)
    expect(getFeedback(id)).toBeUndefined()
  })
})
