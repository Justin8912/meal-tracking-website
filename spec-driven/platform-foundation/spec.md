# Specification: Platform & Persistence Foundation

> Date: 2026-05-29
> Version: 1.0
> Location: spec-driven/platform-foundation/spec.md
> Tracking: N/A
> Source: Split from spec-driven/meal-tracking-mvp/spec.md (foundation slice A of A/B/C)

> **Provenance Key**: [User] [Rally] [Inferred] [Default] [Codebase]

## Project Context

**Parent Project**: Greenfield repository (`meal-tracking-website`). This spec defines the shared platform that the Recipe Library (`recipe-library`) and Weekly Planner (`weekly-planner`) specs build on. **[User]**

**Scope**: The deployable application skeleton and persistence layer — a single global shared workspace, server-side storage with cross-device sync, an auth-ready data model, and Dockerized deployment with environment-variable secrets. Feature behavior (recipes, planning) is specified separately. **[User]**

## Overview

This specification defines the foundation for the meal-tracking web application: a server-side persistence layer that stores all application data for a single shared household workspace and syncs it across devices, deployed as Docker images with all secrets supplied via environment variables. The MVP has no individual login, but the data model must be built so per-user authentication can be added later without restructuring existing data. This foundation is consumed by the Recipe Library and Weekly Planner feature specs. **[User]**

### Current State
Greenfield. The only code is a reference-only React prototype (`artifacts/food-tracker.jsx`) that persists to browser-local storage with no backend, no build tooling, and no authentication. **[Codebase]**

## Goals

### Primary Goal
Provide a deployable, server-backed persistence platform — single shared workspace, cross-device sync, auth-ready — on which the recipe and planner features are built. **[User]**

### Secondary Goals
1. Keep operating costs low and the deployment simple and repeatable. **[Inferred]**
2. Ensure adding per-user authentication later is an additive change, not a restructure. **[User]**

### Non-Goals (Explicitly Out of Scope)
- Individual user authentication / accounts (deferred; architecture must remain ready for it). **[User]**
- Recipe and nutrition features (see `recipe-library`). **[User]**
- Weekly planning features (see `weekly-planner`). **[User]**
- Native mobile apps. **[Inferred]**

## Users

### Primary Users
| User Type | Description | Goals | Pain Points |
|-----------|-------------|-------|-------------|
| Household member | Anyone in the household using the shared workspace; no individual login in MVP. **[User]** | Have their recipes and plans saved reliably and visible on any device. **[User]** | Browser-local data is lost across devices and browsers. **[Inferred]** |

### Secondary Users
| User Type | Description | Goals | Pain Points |
|-----------|-------------|-------|-------------|
| Authenticated individual (future) | A future per-user account once authentication is added. **[User]** | Private per-user data. **[Inferred]** | Not addressed in MVP; data model must be ready to scope ownership per user. **[User]** |

## Functional Requirements

### FR-1: Cloud Persistence & Cross-Device Sync

**Description**: All application data (recipes, custom ingredients, tags, weekly plans — owned by the feature specs) is stored server-side for the single shared workspace and synced across devices, so any device shows the same up-to-date data. The data model carries an owner/workspace scope so per-user accounts can be added later. **[User]**

**User Story**: As a household member, I want our data saved in the cloud so that everyone sees the same data on any device, and so that accounts can be added later without losing anything.

**Acceptance Criteria**:

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-1.1 | Persist on change | Any create/edit/delete of an application entity | The action completes | The change is saved server-side **[User]** |
| AC-1.2 | Cross-device visibility | Data saved on one device | I open the app on another device | I see the same data **[User]** |
| AC-1.3 | Reload persistence | A populated workspace | I reload or revisit the app later | All previously saved data is present **[User]** |
| AC-1.4 | Ownership-ready model | The stored data | Accounts are added in the future | The data model can scope records to an owner/workspace without restructuring existing data (see NFR-2) **[User]** |
| AC-1.5 | Persistence failure surfaced | A create/edit/delete action | The server-side save fails or times out | The user is notified the change was not persisted (rather than the app appearing to have saved it) **[Inferred]** |

**Priority**: Must Have

**Goal**: Primary

**Dependencies**: None

---

## Non-Functional Requirements

### NFR-1: Performance (Smoothness)
**Category**: Performance
**Description**: UI interactions feel smooth; persistence operations do not block the interface unnecessarily. **[User]**
**Metric**: Perceived responsiveness of save/load operations.
**Target**: Common operations feel immediate; saves happen in the background without freezing the UI. **[Inferred]**
**Verification**: Manual interaction testing.

### NFR-2: Security & Authentication-Readiness
**Category**: Security
**Description**: All secrets (DB credentials, external API keys) are supplied via runtime environment variables and never baked into images or exposed to the client. The data model carries an owner/workspace scope so per-user authentication can be added later without restructuring data. **[User]**
**Metric**: No secrets in client bundles or image layers; records associable with an owner/workspace identifier.
**Target**: Zero secrets in client-delivered code or build args; schema includes an owner/workspace field from day one. **[User]**
**Verification**: Inspect client bundle and image layers for secrets; review schema for ownership scoping.

### NFR-3: Cost
**Category**: Cost
**Description**: Stay within free/low-cost hosting tiers; the data store is space-efficient. **[User]**
**Metric**: Hosting/tier usage; storage footprint.
**Target**: Within free/low-tier limits. **[User]**
**Verification**: Review resource usage during testing.

### NFR-4: Operability
**Category**: Operability
**Description**: Structured error logging and a simple, repeatable deployment with health checks. **[Inferred]**
**Metric**: Errors logged with diagnostic context; deploy is documented and repeatable; service health observable.
**Target**: Server-side errors logged; a documented deploy path and a health-check endpoint exist. **[Inferred]**
**Verification**: Trigger error conditions and confirm logs; perform a deploy following the documented steps; hit the health endpoint.

---

## Scope

### In Scope
- Server-side persistence for the single shared workspace with cross-device sync. **[User]**
- Auth-ready data model (owner/workspace scoping) with a seeded default workspace. **[User]**
- Dockerized deployment (frontend + backend images) with runtime env-var secrets. **[User]**
- Structured logging and a health-check endpoint. **[Inferred]**

### Out of Scope
- Authentication/accounts (deferred). **[User]**
- Recipe/nutrition features (`recipe-library`). **[User]**
- Planning features (`weekly-planner`). **[User]**

### Constraints
- The MVP operates as a single global shared workspace. **[User]**
- Data must persist server-side with cross-device sync. **[User]**
- Secrets only via runtime environment variables; never baked into images or build args. **[User]**
- The data model must allow adding per-user authentication later without major rework. **[User]**

### Assumptions
- A ~150MB Node image and a managed/low-cost Postgres are acceptable for this personal deploy. **[Inferred]**

### Risks
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Deferring auth too long makes a future retrofit costly | Medium | Low | Owner/workspace scoping in the data model from day one (NFR-2, AC-1.4) |
| Secrets accidentally baked into an image or committed | High | Low | Runtime env vars only; gitignored .env; no build args for secrets |

## Dependencies

### External Systems
- Server-side data store / backend for cloud persistence and sync. **[User]**

### Internal Dependencies
- None — this is the base layer that `recipe-library` and `weekly-planner` depend on. **[User]**

## Open Questions

_None — workspace identity (single global workspace) was resolved during the originating spec._

## Agent Decisions

| # | Decision | Context | Rationale | Affects |
|---|----------|---------|-----------|---------|
| 1 | Carved the platform/persistence foundation into its own spec | User chose to split the MVP into three specs | Both feature specs depend on a shared persistence + deployment base | FR-1, all NFRs |
