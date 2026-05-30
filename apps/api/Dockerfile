# API image (AD-2, AD-6): multi-stage Node build, production deps only at runtime.
# Build context is the repo root so npm workspaces (apps/api depends on
# @meal-tracking/shared) resolve. No secrets are used at build time and there are
# NO build ARGs for config - DB credentials and all config arrive only at runtime
# via Compose env (F-2, S-1). Baking a secret into an ARG would persist it in a
# layer, so we never do that.
#
# The runtime executes TypeScript via tsx (a production dependency). The shared
# workspace package exports raw TypeScript, so running through tsx keeps that
# contract intact without a separate transpile/publish step; type checking is
# enforced separately in CI (npm run typecheck).

# ---- Stage 1: install full workspace deps and type-check ----
FROM node:20-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci

COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

# Fail the build on type errors (does not emit; runtime uses tsx).
RUN npm run typecheck --workspace @meal-tracking/api

# ---- Stage 2: lean runtime with production deps only ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev

# Application sources: the shared package and the API (incl. drizzle migrations).
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

COPY apps/api/docker-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh

# Drop root for the runtime process.
USER node

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
