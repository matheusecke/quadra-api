# Module: Prisma (`PrismaModule`)

Small global module that exposes the database client to the rest of the app.

## Responsibilities

- `PrismaService` (`src/prisma/prisma.service.ts`) extends `PrismaClient`, connects in `onModuleInit`, disconnects in `onModuleDestroy` (works with `enableShutdownHooks()` in `main.ts`).
- `PrismaModule` (`src/prisma/prisma.module.ts`) is `@Global()` and exports `PrismaService`.
- `resolveDatabaseConfig` in `src/prisma/database-config.ts` is the single resolver for database connectivity. It has two consumers:
  - **Runtime:** `PrismaService` builds the `pg` pool from the resolved config (local `DATABASE_URL` or ECS `DATABASE_SECRET`).
  - **CLI:** `prisma.config.ts` imports the same resolver so `prisma migrate`, `prisma generate`, and related commands see identical connection settings.

## Production migrations

The GitHub Actions `deploy` job applies pending migrations in an isolated ECS
task before updating the API Service. The one-off task overrides the container
command to `npm run prisma:migrate:deploy`; the long-running service never runs
migrate on startup. See `.github/workflows/ci.yml` and [DATABASE.md](../../../docs/DATABASE.md).

## Schema

Multi-file Prisma schema under `prisma/schema/`; datasource and generator in `prisma/schema/schema.prisma`. Runtime uses Prisma 7 with `@prisma/adapter-pg` and a `pg` pool (see `PrismaService` construction).

## Related documentation

- Naming, tables, soft delete, DB-only rules, migration workflow: [DATABASE.md](../../../docs/DATABASE.md)
- File listing: [PROJECT-LAYOUT.md](../../../docs/PROJECT-LAYOUT.md)
