# API Contracts: platform-foundation

The foundation exposes the API skeleton and the shared error envelope that feature specs reuse. Base path: `/api/v1`. The frontend talks only to this API. Until auth exists, the API resolves the single seeded workspace server-side (AD-4); no workspace id appears in the client contract.

## Error envelope (shared)

All non-2xx responses use:
```
{ "error": { "code": string, "message": string } }
```
Feature specs reuse this shape. Persistence/save failures return 5xx with this envelope so the frontend can surface AC-1.5 ("change was not saved").

## Health

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/healthz` | Liveness + DB ping (NFR-4). Returns 200 `{ "status": "ok" }`, or 503 with the error envelope if the DB is unreachable. |

> Feature resources (recipes, ingredients, tags, plans, USDA proxy) are defined in the `recipe-library` and `weekly-planner` designs/contracts. They build on this base path, error envelope, and the server-side workspace resolution.

## Frontend runtime config

- `env-config.js` (rendered at container start) defines `window._env_ = { API_BASE_URL }`. Served `no-cache`. The API client reads `window._env_.API_BASE_URL`. No secrets are present in any client asset.
