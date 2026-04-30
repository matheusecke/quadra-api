# tcc-api

Multi-tenant NestJS backend for basketball championship management. Domain context: `/home/matheusecke/tcc/TCC.md`.

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
npm run prisma:migrate:dev        # new migration
npm run prisma:migrate:deploy     # apply in prod
npm run prisma:migrate:status / prisma:generate / prisma:reset / prisma:studio
```

## Module structure
```
src/<domain>/
  <domain>.module.ts / .controller.ts / .service.ts / .service.spec.ts
  dto/create-<domain>.dto.ts / <domain>-response.dto.ts
```
Global modules: `PrismaModule` (`PrismaService`), `AuthModule` (guards, strategy, decorators).

## Prisma Schema
Multi-file schema in `prisma/schema/` — one `.prisma` file per model. Config in `prisma.config.ts`.

> **Agent restriction:** Never run any migration command (`prisma:migrate:dev`, `prisma:migrate:deploy`, `prisma:migrate:reset`, or any `prisma migrate *`). Only `prisma:generate` is allowed. All migrations — local, dev, and prod — must be applied manually by the user. After creating a migration file, always explicitly tell the user that the migration is ready and needs to be applied manually.

**Conventions:**
- Timestamps: `DateTime @default(now()) @db.Timestamptz(3) @map("created_at")` / `@updatedAt`
- Soft delete: `isDeleted Boolean @default(false) @map("is_deleted")` on all entities
- Slugs: lowercase enforced via CHECK constraint
- Table/column names: snake_case via `@@map` / `@map`

**DB-only constraints** (partial unique indexes, CHECK) — not supported by Prisma; add manually to migration SQL. Document in the `.prisma` file:
```
// DB-only rule: <description>
// Must be added manually in migration SQL. First added in: <migration_name>
```
Always review generated migration SQL and add constraints before applying.

## Auth & Authorization

**JWT Payload:**
```ts
interface JwtPayload {
  sub: number;          // userId
  email: string;
  isSystemAdmin: boolean;
  organizationId: number | null;
  role: OrgRole | null;
}
```

**Guards (use in this order):**
```ts
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@OrgRoles('ORG_ADMIN')
```
- `JwtAuthGuard` — validates JWT, populates `req.user`
- `OrgRoleGuard` — checks `role`; requires `@OrgRoles(...)` on the handler
- `SystemAdminGuard` — checks `isSystemAdmin`; use with `@SystemAdmin()`

**Decorators:** `@CurrentUser()` / `@CurrentUser('sub')` / `@OrgRoles(...)` / `@SystemAdmin()`

**OrgRole values:** `ORG_ADMIN`, `TEAM_ADMIN`, `ATHLETE`, `COACHING_STAFF` — role is session-scoped (from JWT), never a global profile role.

## Responses & Errors

All endpoints wrapped automatically by `ResponseTransformInterceptor`:
- Success: `{ data, statusCode }`
- Paginated: `{ data, meta, links, statusCode }` (passed through directly)
- Skip: `@SkipResponseTransform()`

**Always use `ApiException` static methods — never throw `HttpException` directly:**
```ts
throw ApiException.notFound('...');
throw ApiException.conflict('...');
throw ApiException.forbidden('...');
throw ApiException.unauthorized('...');
throw ApiException.badRequest('...', 'CODE', { field: ['msg'] });
throw ApiException.unprocessable('...');
```
Error format: `{ error: { title, message, code, data }, statusCode }`.

`PrismaExceptionFilter` auto-maps: `P2002`→409, `P2003`→422, `P2025`→404.

## Pagination
1. Query DTO extends `PaginationDefaultsDto` (`page`, `limit`)
2. Service returns `{ count: number; data: T[] }`
3. Controller uses `@UseInterceptors(PaginationInterceptor)`

## DTOs
- Validation: `class-validator` + `class-transformer`
- Global `ValidationPipe`: `whitelist: true`, `forbidNonWhitelisted: true`
- Validation errors → `ApiException` with `code: 'VALIDATION_ERROR'` and field details in `data`
- Response DTOs: annotate with `@ApiProperty()` for Swagger

## Prisma Queries
- Always filter `isDeleted: false` on reads
- Always use explicit `select` — never return `passwordHash` or internal fields
- Multi-tenant: always filter by `organizationId` from JWT payload

## Tests
- Unit tests in `*.service.spec.ts` next to the service
- `jest.config.ts` runs only `*.service.spec.ts` under `src/`
- Mock `PrismaService` with `jest.fn()` — no real DB:
```ts
const mockPrisma = { user: { findFirst: jest.fn(), create: jest.fn() } };
// { provide: PrismaService, useValue: mockPrisma }
```

## Local Environment
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tcc?schema=public
JWT_SECRET=...
JWT_EXPIRES_IN=15m   # optional, default 15m
PORT=3001            # optional
```
Docker Compose (`docker-compose.yml`) runs the API on external network `tcc-network`; PostgreSQL in container `tcc-postgres`.
