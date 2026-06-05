# Standards Inventory: recipe-library

No project-level `CLAUDE.md` yet (greenfield). Standards derive from the design's binding decisions, the platform-foundation standards, and the user's global `CLAUDE.md`.

---

## S-1: Nutrition-engine code is pure, dependency-free, and unit-tested first (TDD)
- **Domain**: testing
- **File Type**: .ts
- **Action Type**: create
- **Source**: AD-1 + NFR-3 + user election (full TDD)

`packages/nutrition-engine` contains no I/O, Date, randomness, or framework imports. Write failing Vitest tests with hand-verified expected totals (mixed units, multi-serving, missing-data) before implementing. Assert against a defined rounding tolerance, not exact equality.

## S-2: USDA API key only from runtime env; never client-side or in build ARG
- **Domain**: security
- **File Type**: * (all)
- **Action Type**: * (all)
- **Source**: NFR-4 (extends platform-foundation S-1)

## S-3: Validate API inputs/outputs with shared Zod schemas
- **Domain**: api-design
- **File Type**: .ts
- **Action Type**: create
- **Source**: platform-foundation AD-1/AD-2

## S-4: Use Drizzle/parameterized queries; never concatenate SQL
- **Domain**: security
- **File Type**: .ts, .sql
- **Action Type**: * (all)
- **Source**: platform-foundation AD-3

## S-5: Schema changes go through versioned drizzle-kit migrations on the platform baseline
- **Domain**: other
- **File Type**: .sql, .ts
- **Action Type**: create
- **Source**: platform-foundation AD-3

The recipe-library migration is `0002_recipe_library.sql`, extending baseline `0001`. It must not redefine `workspaces`/`units`.

## S-6: Round nutrition only at display; never zero-fill missing data
- **Domain**: other
- **File Type**: .ts, .tsx
- **Action Type**: create
- **Source**: AD-1, F-5

Engine and UI keep full precision internally and surface a completeness descriptor when nutrient or gram-conversion data is missing.

## S-7: No emojis
- **Domain**: other
- **File Type**: * (all)
- **Action Type**: * (all)
- **Source**: global `CLAUDE.md`
