// packages/server/src/admin/routes.ts
// Admin API — manage users, groups and the group×feature matrix. Every route is
// gated by requireAdmin (valid access token AND the user's CURRENT group has isAdmin,
// looked up fresh from the DB so a demoted admin loses access immediately).
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import {
  listUsers, getUserById, publicUser, usernameTaken, insertUser, updateUser, deleteUser,
  listGroups, getGroup, upsertGroup, deleteGroup,
} from '../repo.ts'
import { FEATURE_IDS, type Feature } from '../db.ts'
import { requireAuth } from '../auth/routes.ts'
import { revokeAllForUser } from '../auth/sessions.ts'

const COST = Number(process.env.BCRYPT_COST ?? 12)

async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(req, reply)
  if (reply.sent) return
  const account = req.user ? getUserById(req.user.sub) : undefined
  if (!account || !publicUser(account).isAdmin) { await reply.code(403).send({ error: 'forbidden' }); return }
}

interface UserBody { username?: string; password?: string; email?: string; groupId?: string }
interface GroupBody { name?: string; features?: Partial<Record<Feature, boolean>>; isAdmin?: boolean }

function cleanFeatures(input: Partial<Record<Feature, boolean>> | undefined, base: Record<Feature, boolean>): Record<Feature, boolean> {
  return Object.fromEntries(FEATURE_IDS.map((f) => [f, input?.[f] ?? base[f] ?? false])) as Record<Feature, boolean>
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/admin')) await requireAdmin(req, reply)
  })

  // ── Users ────────────────────────────────────────────────────────────────
  app.get('/admin/users', async () => ({ users: listUsers().map(publicUser) }))

  app.post('/admin/users', async (req, reply) => {
    const { username = '', password = '', email, groupId = 'normal' } = req.body as UserBody
    if (username.trim().length < 2) return reply.code(400).send({ error: 'Kullanıcı adı en az 2 karakter.' })
    if (usernameTaken(username.trim())) return reply.code(400).send({ error: 'Bu kullanıcı adı zaten alınmış.' })
    if (!getGroup(groupId)) return reply.code(400).send({ error: 'Geçersiz grup.' })
    const id = 'u-' + randomBytes(8).toString('hex')
    insertUser({ id, username: username.trim(), email: email?.trim() || undefined, passwordHash: bcrypt.hashSync(password || 'okey', COST), groupId })
    return { user: publicUser(getUserById(id)!) }
  })

  app.patch('/admin/users/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const cur = getUserById(id)
    if (!cur) return reply.code(404).send({ error: 'Kullanıcı bulunamadı.' })
    const { username, email, groupId, password } = req.body as UserBody
    if (username && usernameTaken(username.trim(), id)) return reply.code(400).send({ error: 'Bu kullanıcı adı zaten alınmış.' })
    if (groupId && !getGroup(groupId)) return reply.code(400).send({ error: 'Geçersiz grup.' })
    updateUser(id, {
      username: username?.trim(),
      email: email !== undefined ? (email.trim() || null) : undefined,
      groupId,
      passwordHash: password ? bcrypt.hashSync(password, COST) : undefined,
    })
    // A group change can grant/revoke access — force re-auth so the new group takes hold.
    if (groupId && groupId !== cur.groupId) revokeAllForUser(id)
    return { user: publicUser(getUserById(id)!) }
  })

  app.delete('/admin/users/:id', async (req) => {
    const id = (req.params as { id: string }).id
    revokeAllForUser(id)
    deleteUser(id)
    return { ok: true }
  })

  // ── Groups + feature matrix ────────────────────────────────────────────────
  app.get('/admin/groups', async () => ({ groups: listGroups() }))

  app.post('/admin/groups', async (req) => {
    const { name = 'Yeni Grup', features } = req.body as GroupBody
    const id = 'grp-' + randomBytes(4).toString('hex')
    const group = { id, name: name.trim() || 'Yeni Grup', features: cleanFeatures(features, {} as Record<Feature, boolean>), isAdmin: false, builtin: false }
    upsertGroup(group)
    return { group }
  })

  app.patch('/admin/groups/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const cur = getGroup(id)
    if (!cur) return reply.code(404).send({ error: 'Grup bulunamadı.' })
    const { name, features } = req.body as GroupBody
    upsertGroup({ ...cur, name: name?.trim() || cur.name, features: cleanFeatures(features, cur.features) })
    return { group: getGroup(id) }
  })

  app.delete('/admin/groups/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const g = getGroup(id)
    if (!g) return reply.code(404).send({ error: 'Grup bulunamadı.' })
    if (g.builtin) return reply.code(400).send({ error: 'Yerleşik grup silinemez.' })
    deleteGroup(id)
    return { ok: true }
  })
}
