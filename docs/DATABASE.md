# Database Conventions

This document is the source of truth for database naming, Prisma mapping, and migration conventions in `tcc-api`. It is **project-wide** (lives in `docs/`). Application-module notes that are not strictly about the database belong in `src/<domain>/docs/README.md`; the Prisma **client** module is described in [`src/prisma/docs/README.md`](../src/prisma/docs/README.md).

## Naming

### Prisma

| Item | Convention | Example |
| --- | --- | --- |
| Model | singular `PascalCase` | `User`, `OrganizationUserAffiliation` |
| Field | `camelCase` | `passwordHash`, `isDeleted`, `createdAt` |
| Enum | `PascalCase` | `EntityStatus`, `AffiliationStatus` |

### Database

| Item | Convention | Example |
| --- | --- | --- |
| Table | plural `snake_case` | `users`, `organization_user_affiliations` |
| Column | `snake_case` | `password_hash`, `is_deleted`, `created_at` |
| Enum type | `snake_case` | `entity_status`, `org_role`, `affiliation_status` |

## Current Core Tables

| Prisma model | Database table | Purpose |
| --- | --- | --- |
| `User` | `users` | Global user identity |
| `Organization` | `organizations` | Tenant root entity |
| `Team` | `teams` | Global team identity |
| `OrganizationUserAffiliation` | `organization_user_affiliations` | User role and optional team inside an organization |
| `OrganizationTeamAffiliation` | `organization_team_affiliations` | Team affiliation lifecycle inside an organization |
| `RefreshToken` | `refresh_tokens` | Opaque refresh session (hashed token), optional org context, rotation and revocation |

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

## Future Audit Logging Pattern

If audit logging is added later:

1. Model the log tables in Prisma only if they need Prisma Client access.
2. Document functions and triggers as `DB-only` in schema comments.
3. Create `plpgsql` functions and `CREATE TRIGGER` statements manually in migration SQL.
4. Record the first migration that introduced each object in both the schema comments and the migration file.
