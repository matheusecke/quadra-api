# Module: Prisma (`PrismaModule`)

Small global module that exposes the database client to the rest of the app.

## Responsibilities

- `PrismaService` (`src/prisma/prisma.service.ts`) extends `PrismaClient`, connects in `onModuleInit`, disconnects in `onModuleDestroy` (works with `enableShutdownHooks()` in `main.ts`).
- `PrismaModule` (`src/prisma/prisma.module.ts`) is `@Global()` and exports `PrismaService`.

## Schema

Multi-file Prisma schema under `prisma/schema/`; datasource and generator in `prisma/schema/schema.prisma`. Runtime uses Prisma 7 with `@prisma/adapter-pg` and a `pg` pool (see `PrismaService` construction).

## Related documentation

- Naming, tables, soft delete, DB-only rules, migration workflow: [DATABASE.md](../../../docs/DATABASE.md)
- File listing: [PROJECT-LAYOUT.md](../../../docs/PROJECT-LAYOUT.md)
