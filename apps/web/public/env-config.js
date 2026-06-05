// Development default for `vite` / `vite preview` (AD-5).
//
// In production this file is overwritten at container start by docker-entrypoint.sh
// (envsubst over env-config.template.js). It exists here only so local dev has a
// defined window._env_ without running the container. No secret is ever placed here.
window._env_ = {
  API_BASE_URL: "http://localhost:3000",
};
