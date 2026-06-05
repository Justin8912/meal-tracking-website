#!/bin/sh
# Frontend container entrypoint (AD-5, F-3).
#
# Renders env-config.js from env-config.template.js by substituting ONLY the
# API_BASE_URL variable from the container environment, BEFORE nginx starts. This
# is what lets one immutable image take its API URL at runtime. No secret is ever
# referenced here. Restricting envsubst to the named variable avoids clobbering any
# unrelated ${...} text in the template.
#
# This script is IDEMPOTENT: it re-renders on every start and never deletes the
# template, so container restarts (restart: unless-stopped) keep working. If the
# template is missing for any reason, it writes env-config.js directly from the
# env var so the container self-heals instead of crash-looping.
set -eu

: "${API_BASE_URL:?API_BASE_URL must be set (runtime env, never a build ARG)}"

HTML_DIR=/usr/share/nginx/html
TEMPLATE="$HTML_DIR/env-config.template.js"
OUTPUT="$HTML_DIR/env-config.js"

if [ -f "$TEMPLATE" ]; then
  envsubst '${API_BASE_URL}' < "$TEMPLATE" > "$OUTPUT"
else
  # Template absent (older image, or a non-idempotent prior run). Write a minimal
  # env-config.js directly so the SPA still gets its runtime API base URL.
  printf 'window._env_ = { API_BASE_URL: "%s" };\n' "$API_BASE_URL" > "$OUTPUT"
  echo "env-config.template.js not found; wrote env-config.js directly."
fi

echo "Rendered env-config.js with API_BASE_URL=${API_BASE_URL}"

exec nginx -g 'daemon off;'
