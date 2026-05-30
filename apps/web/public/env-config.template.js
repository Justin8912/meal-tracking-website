// Runtime configuration template (AD-5, F-3).
//
// At container start, docker-entrypoint.sh runs envsubst over this file to produce
// the served /env-config.js, substituting ${API_BASE_URL} from the container's
// environment. The API client reads window._env_.API_BASE_URL at runtime, so one
// immutable image can target any API URL. No secret is ever placed in this file.
window._env_ = {
  API_BASE_URL: "${API_BASE_URL}",
};
