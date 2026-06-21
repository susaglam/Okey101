# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────────────────────────
# CS Okey — static SPA deploy image.
#
# The game is 100% client-side: the engine is pure/deterministic and the bots run
# in the browser via LocalAdapter, so there is NO backend. We build the Vite app
# in a Node stage and serve the static dist/ with nginx.
# ──────────────────────────────────────────────────────────────────────────────

# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Install workspace deps first so this layer is cached unless a manifest or the
# lockfile changes. All three workspace package.json files are needed for npm to
# wire up the workspace symlinks.
COPY package.json package-lock.json ./
COPY packages/app/package.json packages/app/package.json
COPY packages/bot/package.json packages/bot/package.json
COPY packages/engine/package.json packages/engine/package.json
RUN npm ci

# Build the SPA. @cs-okey/engine and @cs-okey/bot are pure TS resolved from source
# (their package "main" points at src/index.ts), so Vite bundles everything into
# hashed static assets under packages/app/dist.
COPY . .
RUN npm run build -w @cs-okey/app

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# SPA routing + long-lived caching for hashed assets.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/app/dist /usr/share/nginx/html

EXPOSE 80
# nginx:alpine's base image already runs `nginx -g 'daemon off;'` in the foreground.
