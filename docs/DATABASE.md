# Database Conventions

This document is the source of truth for database naming, Prisma mapping, and migration conventions in `quadra-api`. It is **project-wide** (lives in `docs/`). Application-module notes that are not strictly about the database belong in `src/<domain>/docs/README.md`; the Prisma **client** module is described in [`src/prisma/docs/README.md`](../src/prisma/docs/README.md).

## Naming

### Prisma

| Item  | Convention            | Example                                  |
| ----- | --------------------- | ---------------------------------------- |
| Model | singular `PascalCase` | `User`, `OrganizationUserAffiliation`    |
| Field | `camelCase`           | `passwordHash`, `isDeleted`, `createdAt` |
| Enum  | `PascalCase`          | `EntityStatus`, `AffiliationStatus`      |

### Database

| Item      | Convention          | Example                                           |
| --------- | ------------------- | ------------------------------------------------- |
| Table     | plural `snake_case` | `users`, `organization_user_affiliations`         |
| Column    | `snake_case`        | `password_hash`, `is_deleted`, `created_at`       |
| Enum type | `snake_case`        | `entity_status`, `org_role`, `affiliation_status` |

## Current Core Tables

| Prisma model                  | Database table                   | Purpose                                                                              |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `User`                        | `users`                          | Global user identity                                                                 |
| `Organization`                | `organizations`                  | Tenant root entity                                                                   |
| `Team`                        | `teams`                          | Global team identity                                                                 |
| `OrganizationUserAffiliation` | `organization_user_affiliations` | User role and optional team inside an organization                                   |
| `OrganizationTeamAffiliation` | `organization_team_affiliations` | Team affiliation lifecycle inside an organization                                    |
| `RefreshToken`                | `refresh_tokens`                 | Opaque refresh session (hashed token), optional org context, rotation and revocation |

`users.birth_date` stores civil dates as PostgreSQL `DATE`, not `TIMESTAMPTZ`. `users.height_cm` stores nullable integer centimeters. `seasons.start_date` and `seasons.end_date` are likewise `DATE`, not `TIMESTAMPTZ` — they are civil boundaries, not instants.

`teams` also carries `short_name` (`NOT NULL`, no default — an editable initial sigla backfilled once from `name`), plus nullable `city` and `state` (`brazilian_state`). `organization_user_affiliations` carries a nullable `position` (`basketball_position`).

## Sports Domain Tables

Added by the `sports_module_schema` migration. `Season`, `TournamentCategory` and `Tournament` now have an application module. `Match` and `MatchTeam` now have application ownership in `MatchesModule` for scheduling and lifecycle actions. `MatchPeriod`, `MatchRoster`, and `PlayerMatchStatistic` are selected into the detail read model, but Phase 8 does not write them. The schema and migrations are unchanged by Phase 8.

| Prisma model             | Database table              | Purpose                                                       |
| ------------------------ | --------------------------- | ------------------------------------------------------------- |
| `Season`                 | `seasons`                   | Time window grouping an organization's tournaments            |
| `TournamentCategory`     | `tournament_categories`     | Controlled division vocabulary per org (e.g. Sub-19)          |
| `Tournament`             | `tournaments`               | A championship inside a season                                |
| `TournamentTeam`         | `tournament_teams`          | A global team's registration in a tournament                  |
| `TournamentRoster`       | `tournament_rosters`        | Athlete/staff participation on a team within a tournament     |
| `TournamentGroup`        | `tournament_groups`         | Group in a group stage                                        |
| `TournamentGroupTeam`    | `tournament_group_teams`    | A registered team's membership in a group                     |
| `TournamentBracketRound` | `tournament_bracket_rounds` | A knockout round (the only place its name is written)         |
| `TournamentBracketSlot`  | `tournament_bracket_slots`  | A single bracket matchup, filled manually                     |
| `Match`                  | `matches`                   | Match schedule and lifecycle                                  |
| `MatchTeam`              | `match_teams`               | The two sides of a match plus final score and result          |
| `MatchPeriod`            | `match_periods`             | Per-period score                                              |
| `MatchRoster`            | `match_rosters`             | Who was dressed for a match (distinct from tournament roster) |
| `PlayerMatchStatistic`   | `player_match_statistics`   | Box score per athlete per match (source of truth)             |

**No `@unique`/`@@unique` on any sports model.** Every uniqueness rule in this domain is a partial unique index (soft-delete aware, sometimes also status/null aware), so none is expressible in the Prisma schema — they all live in the `sports_module_constraints` migration and are declared in the models only as DB-only comment blocks. Consequence for the next phase: `findUnique` is unavailable on those keys; use `findFirst` with an `isDeleted: false` filter and translate `P2002`.

## Mapping Examples

```prisma
model User {
  id           Int      @id @default(autoincrement())
  passwordHash String   @map("password_hash")
  isDeleted    Boolean  @default(false) @map("is_deleted")
  createdAt    DateTime @default(now()) @db.Timestamptz(3) @map("created_at")

  @@map("users")
}
```

## Soft Delete and Status

- Soft delete is represented by `is_deleted boolean`.
- `status` exists on `users`, `organizations`, and `teams`.
- `entity_status` currently supports `ACTIVE` and `INACTIVE`.
- Normal uniqueness must ignore rows that are soft-deleted.
- For `users`, `organizations`, and `teams`, uniqueness also ignores rows whose `status = INACTIVE`.

### `AffiliationStatus.INACTIVE` vs `EntityStatus.INACTIVE`

`affiliation_status` supports `PENDING`, `ACTIVE`, `INACTIVE`, `REJECTED` (the `INACTIVE` value is added by the pending migration below). `AffiliationStatus.INACTIVE` describes the state of the **link** between an organization and a user or team — `organization_user_affiliations.status` or `organization_team_affiliations.status`. `EntityStatus.INACTIVE` describes the state of the **global entity itself** — `users.status` or `teams.status` — independent of any organization link. The two are orthogonal: a globally `ACTIVE` user or team can have every organization affiliation `AffiliationStatus.INACTIVE`, and conversely a globally `INACTIVE` team can still carry an `ACTIVE` affiliation row (org-scoped reads that also join `team.status = ACTIVE` simply stop returning it).

### Same-row affiliation activation and deactivation

`OrganizationUserAffiliationsService.deactivate`/`activate` and `OrganizationTeamAffiliationsService.deactivate`/`activate` toggle `status` between `ACTIVE` and `INACTIVE` on the **same** affiliation row — they never soft-delete and recreate it. `role`, `teamId`, `jerseyNumber`, and `position` (user affiliations) are preserved unchanged across the toggle; only `status` (and, for team-affiliation cascades, dependent rows) changes.

This is a direct consequence of the two partial unique indexes:

- `organization_user_affiliations(user_id, organization_id) WHERE is_deleted = false AND status = 'ACTIVE'` constrains only `ACTIVE` rows and places no limit on `INACTIVE` ones; the at-most-one-live-`INACTIVE`-row invariant is enforced in application code by `createPendingInvite`, which soft-deletes every live `INACTIVE` row for that user/organization before creating the new `PENDING` row. Reactivation still re-checks in application code for a conflicting `ACTIVE` row before flipping status back.
- `organization_team_affiliations(organization_id, team_id) WHERE is_deleted = false` constrains **every** live (non-deleted) row regardless of status — `PENDING`, `ACTIVE`, and `INACTIVE` all count as the single live row for a given `(organization_id, team_id)`. There can only ever be one live row, so deactivate/activate must reuse it in place; there is no status-scoped variant of this index that would allow a second live row to exist alongside an `INACTIVE` one.

## Pending Migration: `20260808190043_add_inactive_affiliation_status`

Adds `AffiliationStatus.INACTIVE` (`ALTER TYPE "affiliation_status" ADD VALUE 'INACTIVE'`). The file exists under `prisma/migrations/` but **has not been applied to any database**. Per the agent restriction in the root `CLAUDE.md`, the agent only generated it with `prisma migrate dev --create-only` and validated it with `prisma:validate`/`prisma:generate`. **A human must run `npm run prisma:migrate:dev` (or the equivalent `deploy` command in the target environment) before any code path that writes or filters on `AffiliationStatus.INACTIVE` runs against a real database.**

## Team Soft-Delete on Rejected/Cancelled Onboarding (B1)

When a `PENDING` `OrganizationTeamAffiliation` created by team onboarding (`POST /organization-team-affiliations`) loses its last `PENDING` `TEAM_ADMIN` `OrganizationUserAffiliation` — because the invited admin rejects the invite, or an org admin cancels the user invite or the team onboarding itself — the `OrganizationTeamAffiliation` row is soft-deleted. If, after that, the team has **no other** `OrganizationTeamAffiliation` row at all (`count({ where: { teamId, id: { not: teamAffiliation.id } } })`), the global `Team` itself is soft-deleted (`isDeleted: true`, `status: INACTIVE`).

That history `count` deliberately carries **no `isDeleted` predicate** — a soft-deleted prior affiliation still counts and protects the team from being deleted again by a fresh, unrelated failed onboarding attempt. B1 infers team-onboarding provenance purely from the absence of any affiliation history; this plan explicitly forbids adding a provenance column (see Global Constraints), so B1 cannot distinguish "this team was just created for you by an org admin, don't delete it yet" from "this team has only ever had one failed onboarding attempt."

**Accepted risk:** a platform-created team (`POST /teams`, no `OrganizationTeamAffiliation` history) whose very first onboarding attempt is rejected or cancelled is soft-deleted by B1, even though a system admin explicitly created it moments earlier. This is accepted for the current scope. Revisit only if platform-created teams need to survive a rejected/cancelled first onboarding — that would require an explicit provenance signal (e.g. a `createdVia` column or an always-present placeholder affiliation), which is out of scope here.

**Invite expiry never triggers B1.** The only call sites for this cascade are the reject branch of `transitionUserInvite` (`closePendingTeamAfterLastAdmin`) and the explicit cancel paths (`OrganizationUserAffiliationsService.remove`, `OrganizationTeamAffiliationsService.remove`). A `PENDING` invite that simply ages past `inviteExpiresAt` with no explicit reject or cancel action leaves the team and its affiliation untouched; expiry is only enforced reactively, by rejecting an `ACCEPT` attempt on an expired invite with `422 Invite has expired`.

## Referential Actions

- Core entities are not deleted physically in normal application flows.
- Hard deletes are exceptional and intentional.
- Affiliation tables use `ON DELETE CASCADE` so intentional hard deletes on parent entities purge dependent affiliations automatically.

## DB-only Items

Some PostgreSQL features are not mapped directly in Prisma schema and must be added manually in migrations. In this project, these are called `DB-only` items.

Current examples:

- `CHECK`
- partial index
- partial unique index
- expression index
- extensions
- functions
- triggers
- manual views

### Required comment pattern in schema

Whenever a `DB-only` item is relevant to a model or field, add a comment near that model or field using this structure:

```prisma
// DB-only rule:
// Partial unique index on users(email)
// WHERE is_deleted = false AND status <> 'INACTIVE'
// Must be added manually in migration SQL.
// First added in migration: init_core_schema
```

For triggers/functions:

```prisma
// DB-only trigger:
// Audit trigger to append row changes into logs
// Depends on fn_audit_users_to_logs()
// Must be added manually in migration SQL.
// First added in migration: add_audit_logs
```

## Migration Workflow

Prisma Migrate is incremental. Each migration contains only the delta from the previous migration history to the current schema state.

### Simple schema changes

1. Update `prisma/schema`.
2. Run `npx prisma migrate dev --name <migration_name>`.
3. Review the generated SQL.
4. Apply the migration.

### Changes with DB-only items

1. Update `prisma/schema`.
2. Add or update the `DB-only` comments in the relevant models.
3. Run `npx prisma migrate dev --create-only --name <migration_name>`.
4. Edit `migration.sql` manually.
5. Add the required SQL for `CHECK`, partial indexes, functions, triggers, or other DB-only objects.
6. Apply the migration with `npx prisma migrate dev`.

## Current DB-only Items Expected in the Initial Migration

- `CHECK (email = lower(email))` on `users`
- `CHECK (slug = lower(slug))` on `organizations`
- `CHECK (slug = lower(slug))` on `teams`
- partial unique index on `users(email)`
- partial unique index on `organizations(slug)`
- partial unique index on `teams(slug)`
- partial unique index on `organization_user_affiliations(user_id, organization_id)`
- partial unique index on `organization_team_affiliations(organization_id, team_id)`
- partial index on `organization_user_affiliations(organization_id, team_id)`
- partial index on `organization_user_affiliations(organization_id, role)`
- partial index on `organization_team_affiliations(organization_id, status)`
- partial index on `organization_team_affiliations(team_id)`
- `CHECK` for role/team consistency in `organization_user_affiliations`
- `CHECK (jersey_number IS NULL OR (jersey_number >= 0 AND jersey_number < 100))`
- `CHECK (height_cm IS NULL OR (height_cm >= 50 AND height_cm <= 250))`

## DB-only Items in the `sports_module_constraints` Migration

Hand-written because Prisma cannot express any of them. 43 in total: 18 partial unique indexes, 15 partial plain indexes, 10 check constraints. Every index carries `WHERE is_deleted = false`; three add a further predicate.

Partial unique indexes (one team/season/etc. per scope, ignoring soft-deleted rows):
`seasons(organization_id, label)`; `tournament_categories(organization_id, name)`; `tournament_categories(organization_id, slug)` `AND slug IS NOT NULL`; `tournaments(organization_id, slug)`; `tournament_teams(tournament_id, team_id)`; `tournament_rosters(tournament_id, user_id)` `AND role = 'ATHLETE' AND status = 'ACTIVE'`; `tournament_groups(tournament_id, name)`; `tournament_group_teams(tournament_group_id, tournament_team_id)`; `tournament_group_teams(tournament_id, tournament_team_id)`; `tournament_bracket_rounds(tournament_id, number)`; `tournament_bracket_slots(round_id, position)`; `tournament_bracket_slots(match_id)` `AND match_id IS NOT NULL`; `match_teams(match_id, side)`; `match_teams(match_id, tournament_team_id)`; `match_periods(match_id, period_number)`; `match_rosters(match_id, user_id)`; `match_rosters(match_id, tournament_roster_id)`; `player_match_statistics(match_id, user_id)`.

Partial plain indexes (filtering/listing): `seasons(organization_id, start_date)`; `tournaments(organization_id, season_id)`; `tournaments(organization_id, category_id)`; `tournaments(organization_id, status)`; `tournament_teams(organization_id, team_id)`; `tournament_rosters(tournament_team_id, status)`; `tournament_rosters(organization_id, user_id)`; `matches(organization_id, tournament_id, scheduled_at)`; `matches(organization_id, status, scheduled_at)`; `match_teams(organization_id, tournament_team_id)`; `match_periods(organization_id, match_id)`; `match_rosters(match_team_id, status)`; `player_match_statistics(organization_id, user_id)`; `player_match_statistics(organization_id, match_id)`; `player_match_statistics(match_team_id)`.

Check constraints:

- `seasons_date_range_chk`: `start_date <= end_date`
- `tournament_categories_slug_lowercase_chk` / `tournaments_slug_lowercase_chk`: `slug IS NULL OR slug = lower(slug)`
- `tournaments_date_range_chk`: `starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at`
- `tournaments_champion_requires_completed_chk`: `champion_tournament_team_id IS NULL OR status = 'COMPLETED'` — **unidirectional**; a `COMPLETED` tournament may legitimately have no champion
- `match_teams_final_score_non_negative_chk`: `final_score IS NULL OR final_score >= 0`
- `match_teams_result_loss_type_chk`: a `LOSS` requires a `loss_type`, a `WIN` forbids one, both null before the match is closed
- `match_periods_points_non_negative_chk`: `home_points >= 0 AND away_points >= 0`
- `player_match_stats_non_negative_chk`: every metric `IS NULL OR >= 0`
- `player_match_stats_made_vs_attempted_chk`: `fgm <= fga`, `three_fgm <= three_fga`, `ftm <= fta`, each pair only when both are non-null

Verify they all landed with `prisma/seeds/sports-schema-verification.sql` after applying the migrations.

## Future Audit Logging Pattern

If audit logging is added later:

1. Model the log tables in Prisma only if they need Prisma Client access.
2. Document functions and triggers as `DB-only` in schema comments.
3. Create `plpgsql` functions and `CREATE TRIGGER` statements manually in migration SQL.
4. Record the first migration that introduced each object in both the schema comments and the migration file.
