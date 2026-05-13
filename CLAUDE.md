# tcc-api

Multi-tenant NestJS backend for basketball championship management. Domain context (Portuguese, parent repo): [../TCC.md](../TCC.md).

## Core documentation

For depth: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (app snapshot, module layout), [docs/DATABASE.md](docs/DATABASE.md) (schema naming, soft delete, migrations), [docs/HTTP-LAYER.md](docs/HTTP-LAYER.md) (errors, responses, pagination), [docs/TESTING-STRATEGY.md](docs/TESTING-STRATEGY.md) (Jest scope, mocks). Module-specific docs: `src/<domain>/docs/README.md`.

After implementation: review documentation for drift (start with ARCHITECTURE.md, DATABASE.md, then module docs if changed).

## Language

All written artifacts must be in **English**: code comments, implementation plans, commit messages, PR titles and descriptions, branch names, migration names, and any other git-related content.

## Stack

- NestJS 11 + TypeScript, port **3001**
- Prisma 7 + `@prisma/adapter-pg` (driver adapter), PostgreSQL via `pg` pool
- JWT (passport-jwt) Bearer, bcryptjs, Swagger at `/api`

## Commands

```bash
npm run start:dev                 # watch mode
npm run test / test:cov / lint
npm run prisma:migrate:dev        # new migration — run only if explicitly requested (agents: never; see Agent restriction below)
npm run prisma:migrate:deploy     # apply in prod — same: only when explicitly requested (agents: never)
npm run prisma:migrate:status / prisma:generate / prisma:reset / prisma:studio
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

> **Agent restriction:** Never run any migration command (`prisma:migrate:dev`, `prisma:migrate:deploy`, `prisma:migrate:reset`, or any `prisma migrate *`). Only `prisma:generate` is allowed. All migrations — local, dev, and prod — must be applied manually by the user. After creating a migration file, always explicitly tell the user that the migration is ready and needs to be applied manually.


## Local Environment

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tcc?schema=public
JWT_SECRET=...
JWT_EXPIRES_IN=15m   # optional, default 15m
PORT=3001            # optional
```

Docker Compose (`docker-compose.yml`) runs the API on external network `tcc-network`; PostgreSQL in container `tcc-postgres`.
