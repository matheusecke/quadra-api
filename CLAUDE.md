# tcc-api

Multi-tenant NestJS backend for basketball championship management. Domain context (Portuguese, parent repo): [../TCC.md](../TCC.md).

## Canonical documentation (use for depth)

Load **`CLAUDE.md`** for non‑negotiable agent rules, commands, and pointers. For everything else, prefer the linked doc so this file and `docs/` do not drift.

| Need | Document |
| ---- | -------- |
| App snapshot, doc map, high-level conventions | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Schema naming, tables, soft delete, DB-only SQL, migration workflow | [docs/DATABASE.md](docs/DATABASE.md) |
| Errors, response envelope, pagination, filters | [docs/HTTP-LAYER.md](docs/HTTP-LAYER.md) |
| `src/` / `prisma/` trees, `AppModule` composition | [docs/PROJECT-LAYOUT.md](docs/PROJECT-LAYOUT.md) |
| Jest scope, mocks | [docs/TESTING-STRATEGY.md](docs/TESTING-STRATEGY.md) |
| Gaps and roadmap | [docs/ROADMAP-GAPS.md](docs/ROADMAP-GAPS.md) |
| Nest module–specific docs (when present) | `src/<domain>/docs/README.md` — concrete paths and links live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |

## Documentation Sync

After any implementation that changes behavior, architecture, schema, endpoints, auth flows, module structure, or developer workflow, review documentation for drift — start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DATABASE.md](docs/DATABASE.md), then `src/<domain>/docs/README.md` for any module you changed, plus other `docs/*.md` files if the change is cross-cutting.

Agents must check whether the implemented change created any divergence or requires additions/updates in documentation.

If a document is outdated because of the implementation, update it in the same work session unless the user explicitly asks not to.

## Planning

For **multi-step or non-trivial features**, produce a written implementation plan before coding.

**When to skip a full plan** (no `writing-plans` artifact and no `subagent-driven-development` run for the whole change):

- Trivial, localized edits (typos, comments, formatting).
- Single-file mechanical refactors with no public API or behavior change.
- Bugs with a known root cause and a small, obvious patch (reuse or add minimal tests).
- Documentation-only updates aligned with code already merged.
- Dependency or tooling tweaks that do not touch domain logic.

**Rule of thumb:** if you can list the exact files, “done” criteria, and tests in ~2 minutes and there are no product, auth, or multi-tenant trade-offs, a formal plan is optional. Still run tests and **Documentation Sync** when behavior or public contracts change.

**Complex features** (unclear requirements, large scope, multiple subsystems, sensitive auth/security paths, or material schema/API churn): use the Superpowers skill **`brainstorming`** first to align on intent, scope, trade-offs, and design — then **`writing-plans`** so the plan reflects settled decisions.

For the plan itself, use **`writing-plans`** (bite-sized tasks, exact file paths, no vague placeholders, DRY/YAGNI, TDD where it fits, explicit test commands and expected outcomes). Default save location unless the user specifies otherwise: `docs/plans/YYYY-MM-DD-<feature-name>.md`.

**Execution:** Prefer **`superpowers:subagent-driven-development`** — fresh context per task, spec compliance review, then code-quality review, iterate until clean; do not skip review gates.

**Plan skeleton (minimum structure):**

1. **Header** — Short title, **goal** (what ships), **motivation** (why / problem / constraints), **approach** in 2–3 sentences (architecture touchpoints), tech stack if non-obvious.
2. **Task breakdown** — Numbered tasks. For each task include:
   - **Files** — `Create:` / `Modify:` / `Test:` with repository-relative paths.
   - **Work** — What changes and acceptance criteria in plain language.
   - **Quality** — Tests to add or run (`npm test`, `npm run lint`), and that task-level **review** (spec match + code quality) happens before marking the task done.
3. **Per-task steps** — Checkbox steps (`- [ ]`) where useful; keep steps small (single logical action when possible).
4. **Final review** — After all tasks: run full verification (`npm test`, `npm run lint`), confirm **Documentation Sync** above if behavior or public API changed, and a short **whole-change review** (consistency, security, multi-tenant rules) before calling the work complete.

Optional but valuable: file map upfront (what each new/changed file owns), link to [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) / [docs/DATABASE.md](docs/DATABASE.md) / relevant `src/<domain>/docs/README.md`, and note migration handoff if schema SQL is touched (agents do not run migrate commands).

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

## API, auth, and data access (summary)

**Per-module API and domain notes:** `src/<domain>/docs/README.md` — which modules have docs is listed in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**HTTP responses, errors, `ApiException`, pagination:** [docs/HTTP-LAYER.md](docs/HTTP-LAYER.md).

**Query habits** (soft delete, `select`, multi-tenant scoping): follow existing services and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) conventions; naming in [docs/DATABASE.md](docs/DATABASE.md).

**Tests:** [docs/TESTING-STRATEGY.md](docs/TESTING-STRATEGY.md).

## Local Environment

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tcc?schema=public
JWT_SECRET=...
JWT_EXPIRES_IN=15m   # optional, default 15m
PORT=3001            # optional
```

Docker Compose (`docker-compose.yml`) runs the API on external network `tcc-network`; PostgreSQL in container `tcc-postgres`.
