# quadra-api

Multi-tenant NestJS backend for basketball championship management. Domain context (Portuguese, parent repo): [../TCC.md](../TCC.md).

## Core documentation

For depth: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (app snapshot, module layout), [docs/DATABASE.md](docs/DATABASE.md) (schema naming, soft delete, migrations), [docs/HTTP-LAYER.md](docs/HTTP-LAYER.md) (errors, responses, pagination), [docs/TESTING-STRATEGY.md](docs/TESTING-STRATEGY.md) (Jest scope, mocks). Module-specific docs: `src/<domain>/docs/README.md`.

After implementation: review documentation for drift (start with ARCHITECTURE.md, DATABASE.md, then module docs if changed).

## Language

All written artifacts must be in **English**: code comments, implementation plans, commit messages, PR titles and descriptions, branch names, migration names, and any other git-related content.

## Commit Attribution

Keep commit messages limited to the repository change. Do not add `Co-authored-by`, `Signed-off-by`, `Generated-by`, or equivalent authorship, provenance, or tool-identification trailers or commit-body metadata.

## Stack

- NestJS 11 + TypeScript, port **3001**
- Prisma 7 + `@prisma/adapter-pg` (driver adapter), PostgreSQL via `pg` pool
- JWT (passport-jwt) Bearer, bcryptjs, Swagger at `/api`

## Commands

```bash
npm run start:dev                 # watch mode
npm run test / test:cov / lint
npm run prisma:migrate:dev        # create + apply migration — agents: never (see Agent restriction below)
npm run prisma:migrate:deploy     # apply in prod — agents: never
npm run prisma:migrate:status / prisma:generate / prisma:validate / prisma:reset / prisma:studio
```

## Module structure

```
src/<domain>/
  docs/README.md          # optional but recommended: module-specific documentation
  <domain>.module.ts / .controller.ts / .service.ts / .service.spec.ts
  dto/create-<domain>.dto.ts / <domain>-response.dto.ts
```

**Documentation layout:** project-wide Markdown in `docs/` uses **UPPERCASE** filenames (e.g. `HTTP-LAYER.md`). Module-only docs: `src/<domain>/docs/README.md`. Hub: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Global modules: `PrismaModule` (`PrismaService`), `AuthModule` (guards, strategy, decorators).

## Prisma (agents)

Multi-file schema in `prisma/schema/`; config in `prisma.config.ts`. **Field/table naming, soft delete, slugs, DB-only comments, migration workflow:** [docs/DATABASE.md](docs/DATABASE.md).

### Agent restriction — applying migrations

**The rule: agents never apply a migration.** All migrations — local, dev, and prod — are
applied manually by the user. After creating a migration file, always explicitly tell the
user that the migration is ready and needs to be applied manually.

The rule is about *applying*, not about touching migrations at all. Commands that only read
state or write a file are allowed.

**Allowed:**

| Command | Why it is safe |
| --- | --- |
| `npm run prisma:generate` | Regenerates the client. Never touches the database. |
| `npm run prisma:validate` | Parses the schema. No connection. |
| `npm run prisma:migrate:status` | Read-only; reports which migrations are pending. |
| `prisma migrate diff … --script` | Computes SQL and prints it to stdout. Applies nothing. |
| `prisma migrate dev --create-only --name <name>` | Writes the migration file and stops. Does not apply it. |

Use `migrate diff` to get the exact SQL Prisma would emit, instead of transcribing DDL by
hand — hand-written SQL that drifts from `prisma/schema` is only discovered later, when the
user runs `migrate dev`:

```bash
# Offline, no database connection at all — full-schema DDL.
npx prisma migrate diff --from-empty --to-schema ./prisma/schema --script

# Read-only against the live database — the true pending delta, including ALTER TABLE.
# Use --from-url, not --from-schema-datasource: the datasource block has no `url`
# (it comes from prisma.config.ts), so the latter cannot resolve a connection.
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema ./prisma/schema --script
```

**Before `--create-only`, run `prisma:migrate:status` and confirm there is no drift and
nothing pending.** `--create-only` still runs drift detection first, and on drift it wants to
reset the database. In a non-interactive shell it errors out instead of resetting, but do not
rely on that as the only guard. It also creates and drops a temporary shadow database, so the
connection needs `CREATE DATABASE`.

**Forbidden:**

| Command | Why |
| --- | --- |
| `prisma migrate dev` (without `--create-only`) | Applies the migration; offers to reset on drift. |
| `prisma migrate deploy` | Applies migrations. Production command. |
| `prisma migrate reset` / `npm run prisma:reset` | Drops the database. |
| `prisma migrate resolve` | Marks a migration applied without running its SQL. |
| `prisma db push` | Changes the schema with no migration file; can lose data. |
| `prisma db execute` | Runs arbitrary SQL against the database. |

Generated SQL still needs review and sometimes hand-editing — adding a `NOT NULL` column to a
populated table is the standard case, and needs a backfill Prisma will not write. See
[docs/DATABASE.md](docs/DATABASE.md).


## Local Environment

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/quadra?schema=public
JWT_SECRET=...
JWT_EXPIRES_IN=15m   # optional, default 15m
PORT=3001            # optional
```

Docker Compose (`docker-compose.yml`) runs the API on external network `quadra-network`; PostgreSQL in container `quadra-postgres`.
