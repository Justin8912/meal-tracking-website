# Bundle 3: Persistence Behavior

> Slice 2: Persistence Depth (Stage: depth)
> Stage: depth | Parallel: no | Files: apps/api/src/routes/units.ts, apps/api/src/db/persist.ts, apps/api/src/server.ts

**Bundle Verify**: Server-side data round-trips through the API and persistence failures surface as a clean error.
- **Level**: integration
- **Given**: API + seeded Postgres running
- **Action**: `GET /api/v1/units`, then exercise a write through the persistence helper with the DB made to fail
- **Outcome**: units read returns the seeded reference data; a forced save failure returns a 5xx error envelope (not a crash or HTML)

> **Context**
>
> **Applicable ACs**
> - **AC-1.1**: Given: any create/edit/delete of an application entity / When: the action completes / Then: the change is saved server-side
> - **AC-1.2**: Given: data saved on one device / When: I open the app on another device / Then: I see the same data
> - **AC-1.3**: Given: a populated workspace / When: I reload or revisit later / Then: all previously saved data is present
> - **AC-1.5**: Given: a create/edit/delete action / When: the server-side save fails or times out / Then: the user is notified the change was not persisted
>
> **Architecture Decisions**
> - **AD-7: Cross-device sync via server-side request/response** — Decision: no offline/sync engine; clients read/write through the API; writes surface a clear error on save failure; Fastify keeps responses fast (NFR-1). Rationale: least complexity for a small shared workspace.
> - **AD-3: Postgres + Drizzle** — reads/writes go through the pooled Drizzle client.
>
> **Findings**
> - **F-4: Fastify + pino + Zod** — Zod validates at the edge; pino logs failures (NFR-4).
> - **F-5: Hybrid Postgres schema via Drizzle** — the units table is seeded reference data read here.
>
> **Standards**
> - **S-3**: Validate API inputs/outputs with shared Zod schemas (Domain: api-design | File Type: .ts)
> - **S-4**: Use Drizzle/parameterized queries; never concatenate SQL (Domain: security | File Type: .ts)
> - **S-6**: No emojis (Domain: other | File Type: *)
>
> **Risks**
> - Treating a failed save as success would silently lose data (Impact: high | Mitigation: surface save failures as a 5xx error envelope — AC-1.5)
>
> **Contracts**
> - GET /api/v1/units — returns the seeded unit set `[{ code, label, gramsPerUnit|null }]`
> - Error envelope (shared): `{ "error": { "code": string, "message": string } }`

#### STEP-16: Test-first — units read endpoint
MANUAL -> Test-first for STEP-17

> **Intent**: `GET /api/v1/units` proves the end-to-end persistence READ path (web→api→postgres) and that seeded data survives a fresh process (AC-1.3) and is identical regardless of client (AC-1.2). The test must assert the actual seeded set — including that `qty` has a null gramsPerUnit — so a stubbed/hardcoded response can't pass.

- Write a Supertest test: `GET /api/v1/units` returns the 7 seeded units from the DB, validated against the shared Zod schema, with `qty.gramsPerUnit === null`
- Test fails before STEP-17

**Verify**:
- Level: integration | Given: seeded DB | Action: run the units test before STEP-17 | Outcome: fails (route not implemented)

> Depends on: STEP-9 | Enables: STEP-17 | Parallel with: —

#### STEP-17: GET /api/v1/units endpoint
[FR-1 -> AC-1.2, AC-1.3] | create `apps/api/src/routes/units.ts` | Effort: S

> **Intent**: This endpoint reads the seeded `units` from Postgres through the Drizzle client (not a hardcoded constant) — that is what proves persistence and cross-device consistency (the same server data for every client). The response is validated/serialized via the shared Zod schema (S-3) so the contract can't drift. It is the read-path template feature specs follow.
> **Standards**: S-3 (Zod), S-4 (Drizzle), S-6

- Implement `GET /api/v1/units` reading from the `units` table via Drizzle
- Serialize through the shared `Unit` schema; return the array
- Register the route on the Fastify server

**Verify**:
- Level: integration | Given: seeded DB | Action: `GET /api/v1/units` | Outcome: returns the 7 seeded units (from DB, not a constant), qty.gramsPerUnit null — test from STEP-16 passes

> Depends on: STEP-16, STEP-3, STEP-7, STEP-11 | Enables: STEP-20 | Parallel with: —

#### STEP-18: Test-first — persistence failure surfacing
MANUAL -> Test-first for STEP-19

> **Intent**: AC-1.5 is the whole point of the persistence layer's error contract: a write that fails at the DB must reach the user as a clear "not saved" signal, never a false success. The test forces a DB error during a write and asserts a 5xx error envelope with a stable `code` — so an implementation that swallows the error or returns 200 fails.

- Write a Supertest/integration test: invoke the persistence write helper with the DB made to fail (closed pool / invalid statement) and assert the route returns 5xx with the shared error envelope (`error.code`, `error.message`), and that no success is reported
- Test fails before STEP-19

**Verify**:
- Level: integration | Given: a write with the DB failing | Action: run the test before STEP-19 | Outcome: fails (helper/handler not implemented)

> Depends on: STEP-9 | Enables: STEP-19 | Parallel with: —

#### STEP-19: Persistence write helper with failure surfacing
[FR-1 -> AC-1.1, AC-1.5] | create `apps/api/src/db/persist.ts`; modify `apps/api/src/server.ts` | Effort: S

> **Intent**: This helper is the write-path template feature CRUD will reuse, and the place AC-1.1/AC-1.5 are guaranteed. On success it commits the change server-side (AC-1.1); on failure it must propagate an error that the global handler (STEP-9) turns into a 5xx error envelope — catching-and-returning-200 or logging-and-continuing would silently lose data, the exact failure AC-1.5 guards against. Writes are workspace-scoped via `resolveWorkspaceId()` (STEP-11).
> **Standards**: S-3, S-4 (Drizzle/parameterized — never concat user input), S-6

- Implement a generic workspace-scoped write helper over the Drizzle client that returns the persisted record on success
- On DB error, throw a typed error that the global handler maps to a 5xx error envelope (do not swallow)
- Ensure the server's error handler (STEP-9) covers this path

**Verify**:
- Level: integration | Given: a healthy DB | Action: persist a workspace-scoped record then read it back | Outcome: the record is present (AC-1.1)
- Level: integration | Given: the DB failing mid-write | Action: attempt the write | Outcome: 5xx with `{error:{code,message}}`; no false success reported (AC-1.5)

> Depends on: STEP-18, STEP-9, STEP-11 | Enables: STEP-20 | Parallel with: —
