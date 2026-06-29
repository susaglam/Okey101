# CS Okey server — security & ops checklist

Derived from the 5-dimension security audit. ✅ = done, ⏳ = soon, 🔜 = later.

## Authentication & sessions ("oturum kaybolmasın")
- ✅ Split tokens: short access JWT (15m, HS256, `algorithms:['HS256']`) + opaque 256-bit refresh token (NOT a JWT).
- ✅ `sessions` table in SQLite keyed by `sha256(refreshToken)` — survives restart/redeploy (file on a volume).
- ✅ Refresh **rotation + reuse detection** (replay of a rotated token ⇒ revoke the whole `family_id`).
- ✅ Refresh token in **httpOnly + SameSite=Lax (+Secure in prod)** cookie scoped to `/auth`; access token in memory only (never localStorage).
- ✅ Guest sessions use the SAME machinery (`kind:'guest'`, group `guest`).
- ✅ Server-side **bcrypt** (async, cost 12); login is uniform (no user-enumeration); the localStorage password hash is gone.
- ⏳ JWT secret from env, fail-fast if missing/short; 2-key rotation ring (`kid`) so secret rotation never forces re-login.
- ⏳ Sliding expiry + absolute cap; `last_used_at`; prune expired/revoked sessions.
- ⏳ `logout` (this device) + `logout-all` (every device); admin "ban now" via a small revoked-sid set.

## WebSocket / transport (Faz E)
- 🔜 Authenticate the handshake with the access JWT in `io.use()`; re-verify on every reconnect.
- 🔜 NEVER trust `event.seat` — derive the acting seat from the authenticated user's seat at that table; overwrite before `reduce`.
- 🔜 One table room per socket; gate joins by access control; emit `redactFor` per seat (never a raw broadcast).
- 🔜 `maxHttpBufferSize` small (~16KB); per-socket intent rate limit (token bucket); validate intent shape before `reduce`.
- 🔜 AFK server-side: 30s safe non-işlek auto-discard, 90s bot takeover, reclaim re-verifies userId.

## Game integrity / anti-cheat
- 🔜 Broadcast ONLY `redactFor()` output; engine test asserts the view leaks no other rack / stock / openSnapshot / seed.
- 🔜 Optimistic-concurrency: every intent echoes `baseVersion`; reject if stale.
- 🔜 `rngSeed` stays server-side only; generate with `crypto.randomInt`; redact from logs.
- 🔜 Bots `decide()` from the SAME redacted view as humans; separate server-side bot RNG.

## Input validation & abuse
- ✅ Validate every HTTP body (Fastify schema, `additionalProperties:false` to block proto-pollution).
- 🔜 Validate every socket intent before `reduce` (per-type schema, bounded array lengths); wrap `reduce` in try/catch.
- ✅ Rate-limit login/register (`@fastify/rate-limit`); uniform invalid-credentials response.
- ⏳ Cap tables-per-user + total tables; lobby pagination; username/display-name validation (length/charset/reserved/homoglyph/profanity).
- ✅ Prepared statements only (no string-built SQL).

## Data / secrets / deploy (Coolify)
- ✅ SQLite pragmas: WAL + `synchronous=NORMAL` + `busy_timeout=5000` + `foreign_keys=ON`; writes via `db().transaction`.
- ✅ pino log redaction (authorization/cookie/password/token/email); never `console.log` payloads.
- ✅ Error handler hides internals/stack from clients.
- ✅ CORS/Socket.IO origin allow-list (env `ALLOWED_ORIGINS`, localhost in dev) + `credentials:true`; `@fastify/helmet`; `trustProxy:true`.
- ✅ `/ready` checks the DB (separate from `/health` liveness).
- ⏳ Graceful shutdown (SIGTERM): close io+app, `wal_checkpoint(TRUNCATE)`, persist live games.
- 🔜 **Pin the DB to a Coolify persistent volume**, `CS_OKEY_DB=/data/cs-okey.sqlite` (the #1 "don't lose data" item). New Node Dockerfile (node:22-bookworm-slim, not alpine — better-sqlite3 needs glibc). Automated `db.backup()` snapshots.
- ⏳ `.env.example` with the full prod env set; validate at boot.

## Prod env vars (Coolify)
`JWT_SECRET` (required, 64-hex), `CS_OKEY_DB=/data/cs-okey.sqlite`, `ALLOWED_ORIGINS=https://okey.codesnap.nl`,
`NODE_ENV=production`, `PORT=8787`, `LOG_LEVEL=info`, `BCRYPT_COST=12`, `ADMIN_PASSWORD` (first-boot admin seed).
