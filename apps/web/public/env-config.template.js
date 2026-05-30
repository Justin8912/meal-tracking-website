/* Runtime config template (AD-5, F-3). envsubst renders this into the served
   env-config.js at container start, injecting ${API_BASE_URL} from runtime env.
   No secret is ever placed here. */
window._env_ = {
  API_BASE_URL: "${API_BASE_URL}",
};
