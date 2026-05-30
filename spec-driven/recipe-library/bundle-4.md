# Bundle 4: Recipe CRUD, Tags & Search (API)

> Slice 2: Feature Depth (Stage: depth)
> Stage: depth | Parallel: no (extends routes/recipes.ts from Bundle 1) | Files: apps/api/src/routes/recipes.ts, apps/api/src/routes/tags.ts, apps/api/src/server.ts

**Bundle Verify**: The recipe API supports full CRUD, tagging, tag/meal-type filtering, and name search, with validation and save-failure surfaced.
- **Level**: integration
- **Given**: api + seeded postgres with a few tagged recipes
- **Action**: update and delete a recipe; create/apply a tag; filter by tag and meal type; search by name; attempt an invalid save
- **Outcome**: CRUD persists; filters and search return the correct subset; invalid input returns 400 and a save failure returns a 5xx error envelope

> **Context**
>
> **Applicable ACs**
> - **AC-1.2**: Given: an existing recipe / When: I change any field / Then: the changes are persisted and reflected in the library
> - **AC-1.3**: Given: an existing recipe / When: I delete it and confirm / Then: it is removed from the library and future searches
> - **AC-1.4**: Given: a recipe being created / When: I leave notes and link empty / Then: it still saves successfully
> - **AC-1.5**: Given: a recipe being created / When: I attempt to save with no name or no ingredients / Then: an error is shown, the recipe is not saved, and my input is preserved
> - **AC-1.6**: Given: a recipe create/edit/delete / When: the server-side save fails / Then: an error indicates the change was not saved and the prior state is not lost
> - **AC-5.1**: Given: a recipe / When: I add a custom tag / Then: the tag is saved and available as a filter
> - **AC-5.2**: Given: a library with tagged recipes / When: I select a tag filter / Then: only recipes with that tag are shown
> - **AC-5.3**: Given: recipes of various meal types / When: I filter by a meal type / Then: only that meal type is shown
> - **AC-6.1**: Given: a library of recipes / When: I type text into search / Then: recipes whose names match are shown
>
> **Architecture Decisions**
> - **AD-6: Filtering and search as server-side query parameters** — Decision: q/mealType/tag on GET /recipes via parameterized Drizzle queries; UI drives them via TanStack Query keys. Rationale: scales beyond an in-memory list; keys into the query cache.
> - **AD-2: Recipe/ingredient/tag schema** — recipe_tags association; tags workspace-scoped UNIQUE(workspace_id,label).
>
> **Findings**
> - **F-2: TanStack Query handles async reads/writes** — query keys drive filter/search.
> - **F-10: Hybrid schema** — recipes/tags relational with FK integrity for filtering.
>
> **Standards**
> - **S-3**: Validate API inputs/outputs with shared Zod schemas (Domain: api-design | File Type: .ts)
> - **S-4**: Use Drizzle/parameterized queries; never concatenate SQL (Domain: security | File Type: .ts)
> - **S-7**: No emojis (Domain: other | File Type: *)
>
> **Contracts**
> - GET /recipes?q=&mealType=&tag= — list with filters/search
> - GET /recipes/:id, PUT /recipes/:id, DELETE /recipes/:id — full CRUD
> - GET /tags, POST /tags — tag list/create

#### STEP-28: Test-first — full recipe CRUD and failure paths
MANUAL -> Test-first for STEP-29

> **Intent**: AC-1.5/1.6 are the failure contracts: an invalid save (no name / no ingredients) must 400 without persisting and without losing the user's input, and a DB save failure must return a 5xx envelope rather than a false success. Tests must cover update, delete, optional-fields-empty success, validation-failure 400, and a forced DB-failure 5xx — happy-path-only tests would miss the data-loss risk.

- Write Supertest tests: PUT updates and persists; DELETE removes (and the recipe no longer appears in GET/search); creating with empty notes/link succeeds; no-name/no-ingredients → 400 envelope, nothing persisted; forced DB failure on write → 5xx envelope
- Tests fail before STEP-29

**Verify**:
- Level: integration | Given: the CRUD tests | Action: run before STEP-29 | Outcome: fail (handlers not implemented)

> Depends on: STEP-6 | Enables: STEP-29 | Parallel with: —

#### STEP-29: Full recipe CRUD with validation and save-failure handling
[FR-1 -> AC-1.2, AC-1.3, AC-1.4, AC-1.5, AC-1.6] | modify `apps/api/src/routes/recipes.ts` | Effort: M

> **Intent**: Extends the thin Bundle-1 routes to GET/:id, PUT, DELETE. Validation rejects no-name/no-ingredients with a 400 envelope and does not persist (AC-1.5); a DB failure propagates to the global handler as a 5xx envelope so the user learns the change wasn't saved (AC-1.6) — swallowing the error or returning 200 is the data-loss failure to avoid. Notes/link are optional (AC-1.4). DELETE leaves plan references as tombstones (platform ON DELETE SET NULL).
> **Standards**: S-3, S-4, S-7

- Implement GET /recipes/:id (with ingredients+tags), PUT /recipes/:id, DELETE /recipes/:id (workspace-scoped, Drizzle)
- Validate via shared Zod: name required, >=1 ingredient; notes/link optional
- On DB write failure, propagate so the global handler returns a 5xx error envelope (no false success)

**Verify**:
- Level: integration | Given: an existing recipe | Action: PUT then GET/:id | Outcome: changes persisted (AC-1.2); DELETE removes it from GET and search (AC-1.3)
- Level: integration | Given: a no-name recipe | Action: POST | Outcome: 400 envelope, nothing persisted (AC-1.5); forced DB failure → 5xx envelope (AC-1.6)

> Depends on: STEP-28, STEP-4 | Enables: STEP-33, STEP-35, STEP-37 | Parallel with: —

#### STEP-30: Test-first — tags and recipe_tags
MANUAL -> Test-first for STEP-31

> **Intent**: Tags are workspace-scoped and unique by label (AD-2); applying a tag to a recipe writes recipe_tags. Tests must assert tag creation is idempotent per workspace (no duplicate labels) and that a tag applied to a recipe is queryable for filtering (AC-5.1 → enables AC-5.2).

- Write Supertest tests: POST /tags creates a tag; a duplicate label in the same workspace does not create a second row; applying tags via the recipe payload writes recipe_tags
- Tests fail before STEP-31

**Verify**:
- Level: integration | Given: the tag tests | Action: run before STEP-31 | Outcome: fail (tags not implemented)

> Depends on: STEP-4 | Enables: STEP-31 | Parallel with: —

#### STEP-31: Tag create/list and recipe association
[FR-5 -> AC-5.1] | create `apps/api/src/routes/tags.ts`; modify `apps/api/src/routes/recipes.ts` | Effort: S

> **Intent**: Tags must be workspace-scoped and de-duplicated by label (UNIQUE(workspace_id,label)) so the filter list stays clean; applying a tag to a recipe upserts the tag then writes recipe_tags. A tag created here must immediately be usable as a filter (AC-5.1 feeds AC-5.2).
> **Standards**: S-3, S-4, S-7

- Implement GET /tags and POST /tags (workspace-scoped, unique label)
- In recipe create/update, upsert tags from the payload's `tags` array and maintain recipe_tags
- Register the tags route

**Verify**:
- Level: integration | Given: a recipe tagged "quick" | Action: GET /tags then GET /recipes?tag=quick | Outcome: "quick" listed once; the recipe appears under that tag filter (AC-5.1)

> Depends on: STEP-30, STEP-4 | Enables: STEP-33, STEP-41 | Parallel with: —

#### STEP-32: Test-first — tag and meal-type filtering
MANUAL -> Test-first for STEP-33

> **Intent**: Filtering is server-side (AD-6). Tests must assert `?tag=` returns only recipes with that tag, `?mealType=` returns only that meal type, and the two combine (AND) — and that filters use parameterized queries (no injection via the tag string).

- Write Supertest tests: seed recipes across meal types and tags; assert ?tag= and ?mealType= each narrow correctly and combine; a tag value with SQL metacharacters is treated as a literal
- Tests fail before STEP-33

**Verify**:
- Level: integration | Given: the filter tests | Action: run before STEP-33 | Outcome: fail (filters not implemented)

> Depends on: STEP-29, STEP-31 | Enables: STEP-33 | Parallel with: —

#### STEP-33: Tag and meal-type filtering
[FR-5 -> AC-5.2, AC-5.3] | modify `apps/api/src/routes/recipes.ts` | Effort: S

> **Intent**: Implements `?tag=` and `?mealType=` on GET /recipes as parameterized Drizzle conditions joined to recipe_tags (AD-6, S-4). Combining filters must AND, not OR. Server-side filtering keeps the contract stable as the library grows and keys cleanly into the UI query cache.
> **Standards**: S-4, S-7

- Add `tag` and `mealType` query params to GET /recipes; apply as parameterized conditions (join recipe_tags for tag)
- Combine filters with AND; ignore empty params
- Keep results workspace-scoped

**Verify**:
- Level: integration | Given: recipes across tags/meal types | Action: GET /recipes?tag=quick&mealType=dinner | Outcome: only quick dinners returned; metacharacter tag treated literally — STEP-32 tests pass

> Depends on: STEP-32, STEP-31 | Enables: STEP-41 | Parallel with: STEP-35

#### STEP-34: Test-first — name search
MANUAL -> Test-first for STEP-35

> **Intent**: Search matches recipe names (AC-6.1) and must return an empty result (not an error) when nothing matches (feeds AC-6.2 in the UI). Tests must assert case-insensitive partial match and a clean empty array for no matches.

- Write Supertest tests: ?q= returns recipes whose names match (case-insensitive, partial); a non-matching query returns an empty array (200, not 500)
- Tests fail before STEP-35

**Verify**:
- Level: integration | Given: the search tests | Action: run before STEP-35 | Outcome: fail (search not implemented)

> Depends on: STEP-29 | Enables: STEP-35 | Parallel with: —

#### STEP-35: Recipe name search
[FR-6 -> AC-6.1] | modify `apps/api/src/routes/recipes.ts` | Effort: XS

> **Intent**: Implements `?q=` as a parameterized case-insensitive name match (Postgres ILIKE, AD-6/assumption). It must combine with the filters (Bundle-4 STEP-33) and return an empty array — never an error — for no matches, so the UI can render the empty state (AC-6.2).
> **Standards**: S-4, S-7

- Add `q` param to GET /recipes; parameterized ILIKE on recipe name
- Compose with tag/mealType filters; empty/whitespace q ignored
- Return an empty array for no matches

**Verify**:
- Level: integration | Given: recipes named "Chicken Bowl", "Beef Tacos" | Action: GET /recipes?q=chick | Outcome: returns "Chicken Bowl"; GET /recipes?q=zzz returns [] (200) — STEP-34 tests pass

> Depends on: STEP-34, STEP-29 | Enables: STEP-43 | Parallel with: STEP-33
