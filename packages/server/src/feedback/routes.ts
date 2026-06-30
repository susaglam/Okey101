// packages/server/src/feedback/routes.ts
// Public (authenticated) feedback submission: any signed-in user — including a guest —
// can file a bug report or a suggestion from inside the game. Stored in SQLite; the
// admin reviews them in the panel (no email).
import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../auth/routes.ts'
import { getUserById } from '../repo.ts'
import { insertFeedback } from './repo.ts'

const MAX_MESSAGE = 4000
const MAX_SHOT = 3_000_000 // ~3 MB data-URL cap (a downscaled screenshot is well under this)

interface Body { kind?: string; category?: string; message?: string; screenshot?: string; tableId?: string }

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  // Larger bodyLimit than the 1 MB default so an attached screenshot fits.
  app.post('/feedback', { bodyLimit: 4 * 1024 * 1024, preHandler: requireAuth }, async (req, reply) => {
    const { kind, category, message, screenshot, tableId } = (req.body ?? {}) as Body
    if (kind !== 'bug' && kind !== 'suggestion') return reply.code(400).send({ error: 'Geçersiz tür.' })
    if (typeof message !== 'string' || message.trim().length < 3) return reply.code(400).send({ error: 'Lütfen kısaca açıklayın (en az 3 karakter).' })
    if (screenshot != null && (typeof screenshot !== 'string' || !screenshot.startsWith('data:image/') || screenshot.length > MAX_SHOT)) {
      return reply.code(400).send({ error: 'Ekran görüntüsü geçersiz ya da çok büyük.' })
    }
    const u = req.user ? getUserById(req.user.sub) : undefined
    insertFeedback({
      userId: req.user?.sub ?? null,
      username: u?.username ?? null,
      kind,
      category: typeof category === 'string' ? category.slice(0, 40) : null,
      message: message.trim().slice(0, MAX_MESSAGE),
      screenshot: screenshot ?? null,
      tableId: typeof tableId === 'string' ? tableId.slice(0, 40) : null,
      createdAt: Date.now(),
    })
    return { ok: true }
  })
}
