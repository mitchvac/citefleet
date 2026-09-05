# CiteFleet — same layout as Resonance / BotCentral on 144.91.66.158:
# multi-stage Node image, listen 3000, host binds 127.0.0.1:3021:3000, nginx TLS.
#
# Build:  docker build -t citefleet .
# Run:    docker run -d --name citefleet --restart unless-stopped \
#           --env-file .env -p 127.0.0.1:3021:3000 citefleet

# ---- Build stage ----
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
# npm ci rejects this lock (nested ajv 6 vs 8). install is equivalent for a
# clean image layer and succeeds on Node 22 / npm 10.9.
RUN npm install --ignore-scripts

COPY . .

# node-server writes a standalone Node listener to .output/
# (Vercel deploys keep the default preset — this ENV is Docker-only).
ENV NITRO_PRESET=node-server
ENV NODE_ENV=production
RUN npm run build \
  && mkdir -p .output/server/_libs \
  && (cp node_modules/@electric-sql/pglite/dist/pglite.data \
        node_modules/@electric-sql/pglite/dist/pglite.wasm \
        node_modules/@electric-sql/pglite/dist/initdb.wasm \
        .output/server/_libs/ || true) \
  && npm prune --omit=dev --ignore-scripts

# ---- Runtime stage ----
FROM node:22-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
# No migrations/ directory: schema is owned by supabase/migrations/ and applied
# by the Supabase CLI in CI (07fd667), never by this image. The stale COPY here
# broke every uncached build after that commit.
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
