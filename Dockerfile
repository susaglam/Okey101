# syntax=docker/dockerfile:1
# CS Okey — production image: ONE Node service that serves the built SPA (online
# build) AND the API + Socket.IO, same-origin. bookworm (glibc) for better-sqlite3.
#   build context = repo root.

# ── build: install workspace deps + build the SPA in ONLINE mode ──────────────
FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY packages/bot/package.json packages/bot/package.json
COPY packages/app/package.json packages/app/package.json
COPY packages/server/package.json packages/server/package.json
RUN npm ci
COPY . .
# Same-origin: empty server URL → the SPA talks to its own host for /auth + socket.
RUN VITE_ONLINE=1 VITE_SERVER_URL= npm run build -w @cs-okey/app

# ── runtime ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production CS_OKEY_DB=/data/cs-okey.sqlite PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# The server serves packages/app/dist (built above) + /auth + /admin + /socket.io.
CMD ["npx", "tsx", "packages/server/src/index.ts"]
