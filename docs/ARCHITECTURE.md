# Architecture — tcc-api

Hub document for backend structure. **For LLM context:** load only the sections below that match your task; deep detail lives in linked files.

## Domain and monorepo context

- **Product / business rules (Portuguese):** parent repo [`../TCC.md`](../TCC.md) — master context for the TCC thesis platform.
- **Database naming, tables, migrations, DB-only SQL:** [`DATABASE.md`](./DATABASE.md).

## Documentation layout (project convention)

- **`docs/` (repository root)** — cross-cutting documentation: architecture hub, database conventions, HTTP layer, repository layout, testing policy, roadmap. Not tied to a single Nest module. **Naming:** Markdown files here use **UPPERCASE** names (e.g. `HTTP-LAYER.md`, `PROJECT-LAYOUT.md`).
- **`src/<domain>/docs/`** — documentation **specific to that module** (API surface, session rules, module-only behavior). Prefer `README.md` as the entry file inside each `docs/` folder. When you add a new domain module, create `src/<domain>/docs/README.md` and link it from this file’s map below.

## Implemented today (snapshot)

- NestJS app with global `ConfigModule`, **`ThrottlerGuard` (`APP_GUARD`)** + `ThrottlerModule` (default rate limit; stricter `@Throttle` on selected routes; Swagger `/api` excluded — see [HTTP-LAYER.md#rate-limiting](./HTTP-LAYER.md#rate-limiting)), `PrismaModule`, `AuthModule`, `UsersModule`, `OrganizationsModule`, `TeamsModule`, `OrganizationTeamAffiliationsModule`, `OrganizationUserAffiliationsModule`, `SeasonsModule`, `TournamentCategoriesModule`, `TournamentsModule`, `AthletesModule`, `TournamentTeamsModule`, `TournamentRostersModule`, `TournamentGroupsModule` (`src/app.module.ts`).
- Bootstrap: `ValidationPipe`, global exception filters, `cookie-parser`, CORS with credentials, Swagger at `/api`, port `3001` by default (`src/main.ts`).
- Prisma multi-file schema under `prisma/schema/` covering multi-tenant core + auth persistence: `User`, `Organization`, `Team`, `OrganizationUserAffiliation`, `OrganizationTeamAffiliation`, `RefreshToken`.
- Sports domain schema: `Season`, `TournamentCategory`, `Tournament`, `TournamentTeam`, `TournamentRoster`, `TournamentGroup`, and `TournamentGroupTeam` now have application modules (CRUD, slug derivation, completion/reopen, champion suggestion, registration/roster lifecycle, group structure, and assignments); the remaining seven models are tables only — no application module yet: `TournamentBracketRound`, `TournamentBracketSlot`, `Match`, `MatchTeam`, `MatchPeriod`, `MatchRoster`, `PlayerMatchStatistic`. See [DATABASE.md](./DATABASE.md).
- Shared utilities:
  - `src/common/utils/slugify.ts` — slug generation used by `OrganizationsModule` and `TeamsModule`.
  - `src/common/utils/affiliation-token.util.ts` — invite token generation (`crypto.randomBytes(32)`) and SHA-256 hashing used by both affiliation modules.
- **Derived, never persisted:** `isRegistrationOpen` and the tournament match counters (`TournamentsService`, implemented) — plus standings/classification (FIBA Appendix D) and the match read model, computed by query in a later phase, no columns.

## Document map (by concern)

### Project-wide (`docs/`)

| Topic                                     | File                                         | When to load                                 |
| ----------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Folder trees, `app.module` composition    | [PROJECT-LAYOUT.md](./PROJECT-LAYOUT.md)     | Refactoring structure, new modules           |
| Errors, API response envelope, pagination | [HTTP-LAYER.md](./HTTP-LAYER.md)             | Filters, interceptors, DTO validation errors |
| Jest scope and mocks                      | [TESTING-STRATEGY.md](./TESTING-STRATEGY.md) | Tests only                                   |
| Missing features, next milestones         | [ROADMAP-GAPS.md](./ROADMAP-GAPS.md)         | Planning, scope questions                    |

### Co-located with modules (`src/<domain>/docs/README.md`)

| Module                         | File                                                                                                        | When to load                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Prisma client                  | [`src/prisma/docs/README.md`](../src/prisma/docs/README.md)                                                 | DB access, lifecycle, schema location                            |
| Auth                           | [`src/auth/docs/README.md`](../src/auth/docs/README.md)                                                     | Login, session, org context, authorization                       |
| Users                          | [`src/users/docs/README.md`](../src/users/docs/README.md)                                                   | User CRUD, admin rules                                           |
| Organizations                  | [`src/organizations/docs/README.md`](../src/organizations/docs/README.md)                                   | Org CRUD, slug, soft delete, token revocation                    |
| Teams                          | [`src/teams/docs/README.md`](../src/teams/docs/README.md)                                                   | Team CRUD, slug, soft delete                                     |
| Organization–Team Affiliations | [`src/organization-team-affiliations/docs/README.md`](../src/organization-team-affiliations/docs/README.md) | Invite flow, token lifecycle, status transitions                 |
| Organization–User Affiliations | [`src/organization-user-affiliations/docs/README.md`](../src/organization-user-affiliations/docs/README.md) | Invite flow, role/team constraints, self-removal prevention      |
| Seasons                        | [`src/seasons/docs/README.md`](../src/seasons/docs/README.md)                                               | Season CRUD, date-only contract, archiving                       |
| Tournament Categories          | [`src/tournament-categories/docs/README.md`](../src/tournament-categories/docs/README.md)                   | Category CRUD, slug derivation, sort order                       |
| Tournaments                    | [`src/tournaments/docs/README.md`](../src/tournaments/docs/README.md)                                       | Tournament CRUD, completion/reopen, champion rules               |
| Athletes                       | [`src/athletes/docs/README.md`](../src/athletes/docs/README.md)                                             | Roster-eligible user catalog for team selectors                  |
| Tournament Teams               | [`src/tournament-teams/docs/README.md`](../src/tournament-teams/docs/README.md)                             | Registration, reactivation, seed, withdrawal                     |
| Tournament Rosters             | [`src/tournament-rosters/docs/README.md`](../src/tournament-rosters/docs/README.md)                         | Roster membership, role/jersey, team-scoped writes, deactivation |
| Tournament Groups              | [`src/tournament-groups/docs/README.md`](../src/tournament-groups/docs/README.md)                           | Group structure, ordering, assignments, and soft deletion        |
| Standings                      | [`src/standings/docs/README.md`](../src/standings/docs/README.md)                                           | FIBA classification, tiebreak criteria, recorded draws           |

## Conventions (high level)

- **Code and agent artifacts:** English (see root `CLAUDE.md`).
- **Multi-tenant data access:** default to `organizationId` from JWT; system-admin routes may cross tenants intentionally.
- **Queries:** prefer explicit `select` for client responses; exclude `passwordHash` and internal fields; respect soft delete (`isDeleted`) where modeled.

For Prisma field/table naming and migration workflow, use [`DATABASE.md`](./DATABASE.md) — not duplicated here.
