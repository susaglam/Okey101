# CS Okey realtime server — production image. Build context = REPO ROOT.
#   docker build -f packages/server/Dockerfile -t cs-okey-server .
# bookworm (glibc), NOT alpine — better-sqlite3 needs glibc / its prebuilt binary.

# ── build: install workspace deps (incl. better-sqlite3 native) ───────────────
FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY packages/bot/package.json packages/bot/package.json
COPY packages/app/package.json packages/app/package.json
COPY packages/server/package.json packages/server/package.json
RUN npm ci
COPY . .

# ── runtime ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production CS_OKEY_DB=/data/cs-okey.sqlite PORT=8787
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 8787
# Readiness probe hits /ready (checks the DB), not just liveness.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Run the TS server via tsx (the whole repo is consumed as TS source — no build step).
CMD ["npx", "tsx", "packages/server/src/index.ts"]
