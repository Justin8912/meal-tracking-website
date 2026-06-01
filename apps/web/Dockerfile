# Frontend image (AD-5): multi-stage Vite build -> nginx static server.
# Build context is the repo root so npm workspaces (apps/web depends on
# @meal-tracking/shared) resolve. No secrets are used at build time; the API URL
# is injected at runtime by docker-entrypoint.sh (F-3, S-1) - never a build ARG.

# ---- Stage 1: build the static SPA ----
FROM node:20-alpine AS build
WORKDIR /repo

# Install workspace dependencies using only manifests first for better caching.
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm install

# Copy the sources needed to build the web workspace and its shared dependency.
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/

RUN npm run build --workspace @meal-tracking/web

# ---- Stage 2: serve with nginx ----
FROM nginx:1.27-alpine AS runtime

# gettext provides envsubst for the entrypoint.
RUN apk add --no-cache gettext

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Static assets and the runtime-config template.
COPY --from=build /repo/apps/web/dist/ /usr/share/nginx/html/

COPY apps/web/docker-entrypoint.sh /usr/local/bin/render-env-config.sh
RUN chmod +x /usr/local/bin/render-env-config.sh

EXPOSE 8080

# Override nginx's default entrypoint: render env-config.js, then exec nginx.
ENTRYPOINT ["/usr/local/bin/render-env-config.sh"]
