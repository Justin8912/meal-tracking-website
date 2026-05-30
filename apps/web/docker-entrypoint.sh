#!/bin/sh
# Frontend container entrypoint (AD-5, F-3).
#
# Renders env-config.js from env-config.template.js by substituting ONLY the
# API_BASE_URL variable from the container environment, BEFORE nginx starts. This
# is what lets one immutable image take its API URL at runtime. No secret is ever
# referenced here. Restricting envsubst to the named variable avoids clobbering any
# unrelated ${...} text in the template.
set -eu

: "${API_BASE_URL:?API_BASE_URL must be set (runtime env, never a build ARG)}"

TEMPLATE=/usr/share/nginx/html/env-config.template.js
OUTPUT=/usr/share/nginx/html/env-config.js

envsubst '${API_BASE_URL}' < "$TEMPLATE" > "$OUTPUT"

# The template is only build/runtime input; do not serve it.
rm -f "$TEMPLATE"

echo "Rendered env-config.js with API_BASE_URL=${API_BASE_URL}"

exec nginx -g 'daemon off;'
