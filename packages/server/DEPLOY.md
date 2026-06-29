# Deploying the CS Okey server (Coolify → okey.codesnap.nl)

The realtime server is a Node service (Fastify + Socket.IO + SQLite). It must run
ALONGSIDE the static SPA. SQLite lives on a **persistent volume** so users/sessions/
games survive redeploys — this is the core of "oturum kaybolmasın".

## Steps (do together)
1. **New Coolify resource** for the server, build context = repo root, Dockerfile =
   `packages/server/Dockerfile` (or use `packages/server/docker-compose.coolify.yml`).
2. **Persistent storage**: mount a volume at `/data` and mark it *Persistent* (so it is
   NOT recreated on redeploy). Set `CS_OKEY_DB=/data/cs-okey.sqlite`.
3. **Environment variables** (see `.env.example`):
   - `JWT_SECRET` — `openssl rand -hex 32`, mark as **Secret**, keep stable across deploys.
   - `ADMIN_PASSWORD` — your admin password (seeds the `admin` account on first boot).
   - `ALLOWED_ORIGINS=https://okey.codesnap.nl`
   - `NODE_ENV=production`, `PORT=8787`, `BCRYPT_COST=12`, `LOG_LEVEL=info`.
4. **Domain/proxy**: map the FQDN to port **8787**. Coolify's Traefik terminates TLS;
   the app speaks HTTP internally (we set `trustProxy: true`). WebSocket upgrade must be
   forwarded (Traefik does this by default).
5. **SPA → server URL**: build the SPA with `VITE_SERVER_URL=https://<server-fqdn>` (or
   serve both behind the same origin and leave it empty). The SPA calls `/auth/*` with
   `credentials: 'include'` and opens the socket with the access token.
6. **Health**: Coolify health check → `GET /ready` (checks the DB), `GET /health` is
   cheap liveness.

## Acceptance test ("oturum kaybolmasın")
Log in on the deployed site → **redeploy the server** → reload the page. The session
must still be active (the cookie + `/auth/refresh` mint a fresh access token, no
re-login). If it logs you out, the DB volume isn't persistent or `JWT_SECRET` changed.

## Notes
- `better-sqlite3` needs glibc → the image is `node:22-bookworm-slim` (NOT alpine).
- The server runs the TS source via `tsx` (the repo has no build step).
- Graceful shutdown checkpoints the WAL on SIGTERM so the last moves aren't lost.
- Back up `/data/cs-okey.sqlite` periodically (a volume loss = data loss).
