// packages/server/src/index.ts
// Production entrypoint: bootstrap (Fastify + authenticated Socket.IO + game layer),
// listen, and shut down gracefully.
import { bootstrap } from './bootstrap.ts'
import { ALLOWED_ORIGINS } from './app.ts'

const PORT = Number(process.env.PORT ?? 8787)
const isProd = process.env.NODE_ENV === 'production'
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 600) // pace bot moves so clients see them

const { app, close } = await bootstrap({ botDelayMs: BOT_DELAY_MS })

if (!isProd && !process.env.JWT_SECRET) {
  app.log.warn('JWT_SECRET not set — using an INSECURE dev key. Set JWT_SECRET in production.')
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => { void close().then(() => process.exit(0)) })
}

await app.listen({ port: PORT, host: '0.0.0.0' })
app.log.info(`CS Okey server on :${PORT} (origins: ${ALLOWED_ORIGINS.join(', ')})`)
