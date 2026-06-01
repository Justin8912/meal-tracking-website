# API image (AD-2, AD-6): multi-stage Node build that ships COMPILED JavaScript.
# Build context is the repo root so npm workspaces (apps/api depends on
# @meal-tracking/shared) resolve. No secrets are used at build time and there are
# NO build ARGs for config - DB credentials and all config arrive only at runtime
# via Compose env (F-2, S-1). Baking a secret into an ARG would persist it in a
# layer, so we never do that.
#
# The runtime executes plain Node on the emitted dist/ output (node dist/server.js).
# There is NO tsx in the runtime image: tsx is a devDependency only, so the
# production install (npm ci --omit=dev) never pulls it in. The shared and
# nutrition-engine workspace packages are compiled to dist/ as well and resolved at
# runtime via their default export condition (compiled JS), not their "development"
# (TS source) condition. The /api/v1/plans/summary route imports
# @meal-tracking/nutrition-engine at runtime, so the engine is a runtime dependency
# and must be present in the production image alongside @meal-tracking/shared.

# ---- Stage 1: install full workspace deps, type-check, and emit JS ----
FROM node:20-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/nutrition-engine/package.json packages/nutrition-engine/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci

COPY packages/shared/ packages/shared/
COPY packages/nutrition-engine/ packages/nutrition-engine/
COPY apps/api/ apps/api/

# Type-check, then compile @meal-tracking/shared and @meal-tracking/api to dist/.
# The api build script builds shared first and copies the SQL migrations into
# apps/api/dist/drizzle so the compiled migrate step can find them at runtime.
RUN npm run typecheck --workspace @meal-tracking/api
RUN npm run build --workspace @meal-tracking/api

# Prune to production dependencies only (drops tsx, typescript, vitest, etc.) so
# the pruned node_modules can be copied straight into the runtime stage.
RUN npm prune --omit=dev

# ---- Stage 2: lean runtime with production deps + compiled output only ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo

# Production dependency tree (no dev tooling, no tsx).
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/node_modules ./node_modules

# Compiled shared package: manifest + emitted JS/declarations (dist/index.js).
COPY --from=build /repo/packages/shared/package.json packages/shared/
COPY --from=build /repo/packages/shared/dist packages/shared/dist

# Compiled nutrition-engine package: manifest + emitted JS/declarations
# (dist/index.js). Imported at runtime by the /api/v1/plans/summary route.
COPY --from=build /repo/packages/nutrition-engine/package.json packages/nutrition-engine/
COPY --from=build /repo/packages/nutrition-engine/dist packages/nutrition-engine/dist

# Compiled API: manifest + emitted JS. The versioned SQL migrations stay as data
# files alongside the compiled output - migrate.js resolves them at
# apps/api/drizzle relative to dist/ (../../drizzle from dist/db/migrate.js).
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/drizzle apps/api/drizzle

COPY apps/api/docker-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh

# Drop root for the runtime process.
USER node

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
