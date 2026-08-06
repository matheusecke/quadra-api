# quadra-api

Backend (**REST API**) for a **multi-tenant web platform** to run **basketball championships** across many sport organizations in one system. Built for a **computer engineering capstone (TCC)** — production-quality patterns, incremental scope.

**Stack:** NestJS 11, TypeScript, Prisma 7 + PostgreSQL, JWT access tokens and httpOnly refresh cookies. Default port **3001**; **OpenAPI (Swagger)** at **`/api`**.

---

## TCC workspace repositories

The product is split across **separate Git repositories** that are meant to live side by side in one parent folder (adjust names if your layout differs):

| Repository | Role |
| ---------- | ---- |
| **`quadra-api`** (this repo) | REST API — auth, sessions, multi-tenant persistence, future championship/match modules. |
| **`quadra-web`** | Browser SPA (React + Vite) — UI, calls the API over HTTP. |
| **`quadra-infra`** | Local **Docker Compose** definitions (PostgreSQL, shared network, optional **full stack** compose that builds API + web). AWS/ECS-oriented material may live here as the project grows. |

Expected layout for integrated work:

```text
<workspace>/
  quadra-api/
  quadra-web/
  quadra-infra/
```

---

## Docker and how services connect

**Intended local workflow:** run the database (and optionally API + web) **in containers** so hostnames, ports, and the shared **`quadra-network`** match what the compose files expect. Running everything in Docker avoids “works on my machine” drift for DB hostnames (`quadra-postgres` vs `localhost`) and matches how the repos were wired.

### What each layer does

1. **`quadra-infra`** — Defines Docker network **`quadra-network`** and container **`quadra-postgres`** (PostgreSQL 16). Publishes the database on host port **`5433`** → container `5432` (so host tools use `localhost:5433`). Optionally **`docker-compose-full.yml`** in that repo builds and runs **postgres + API + web** together.
2. **`quadra-api`** — `docker-compose.yml` here builds the API image (`Dockerfile.local`), attaches the API to **`quadra-network`**, and sets `DATABASE_URL` to `...@quadra-postgres:5432/...`. The compose file treats **`quadra-network` as external** — bring infra (or full stack) up first so the network (and DB) exist.
3. **`quadra-web`** — `docker-compose.yml` runs the Vite dev server in a container with **`VITE_API_URL=http://localhost:3001`** so the **browser** still talks to the API on the host-mapped port.

### Communication paths

```text
Browser  ──HTTP (JSON, cookies)──►  quadra-web  :5173   (Vite app)
              │
              └── same browser ──►  quadra-api  :3001   (REST + Swagger /api)
                                        │
                                        └── TCP ──►  PostgreSQL (quadra-postgres:5432 on Docker network)
```

- **Web → API:** the SPA uses `VITE_API_URL` (see `quadra-web`). The API enables CORS with credentials for dev (default origin **`http://localhost:5173`** in `src/main.ts`, overridable with **`CORS_ORIGIN`**).
- **API → DB:** inside Docker, `DATABASE_URL` uses hostname **`quadra-postgres`**. From the **host** (e.g. `npm run start:dev` on your machine with infra up), point `DATABASE_URL` at **`localhost:5433`** to reach the same database through the published port.

### One-command full stack (typical)

From the machine that has **all three** repos checked out next to each other:

```bash
cd quadra-infra
docker compose -f docker-compose-full.yml up --build
```

That starts **postgres**, **quadra-api** on **http://localhost:3001**, and **quadra-web** on **http://localhost:5173**. Apply Prisma migrations yourself when the schema changes (see [CLAUDE.md](CLAUDE.md)).

### API-only container (after DB is up)

If you already started **`quadra-infra/docker-compose.yml`** (Postgres + network) and only want the API container from this repo:

```bash
cd quadra-api
docker compose up --build
```

---

## What problem it solves

Organizations often keep schedules, results, rosters, and history in **scattered tools** (spreadsheets, chats, social networks). The product aims to **centralize operations**: schedules, matches, participation, manual stats entry, and a **sporting history** view — with **strict data isolation per organization (tenant)**.

---

## Product scope (high level)

**In scope for the product vision**

- Authentication and authorization; organization and team lifecycle; invites and memberships.
- Championships and matches; manual result and statistics entry; calendars and basic indicators.
- Evolution path for more features after the core tenant and membership layer is stable.

**Explicitly out of scope for the first product version**

- Real-time push; advanced auto-bracketing / calendar automation; heavy analytics; native mobile app; complex financial modules.

The **API in this repository** does not implement the full product yet. Today it covers the **multi-tenant core**, **auth/session**, and **platform-admin user management**; championships, matches, and statistics modules are **not** in the schema yet. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ROADMAP-GAPS.md](docs/ROADMAP-GAPS.md) for the live technical picture.

---

## Domain rules that shape the backend

These product decisions are fixed in the domain model and APIs you build here:

**Multi-tenant isolation**

- Operational data is **scoped by organization**. Users must not see another tenant’s operational data.
- After login, the user **selects an active organization** for the session; listings (championships, matches, history, etc.) are **filtered to that organization** unless the product explicitly defines otherwise.
- Initial UX assumption: **no** cross-organization “global dashboard” for the same user; everything is experienced in the **active org context** (a possible unified view is deferred).

**Global identities, tenant-scoped relationships**

- **User** is a **global** identity: the same person can participate in **multiple organizations**, which remain isolated from each other operationally.
- **Team** is also **global**: one team record can be linked to **several organizations** via **`OrganizationTeamAffiliation`** (status lifecycle: `PENDING` → `ACTIVE` or `REJECTED` in Prisma). Invites, rosters, and competition data under each org stay **tenant-scoped**.

**Roles and memberships**

- Each user has **exactly one role per organization**; the role lives on **`OrganizationUserAffiliation`**, not on a “global profile role”.
- Session roles in the API align with: **`ORG_ADMIN`**, **`TEAM_ADMIN`**, **`ATHLETE`**, **`COACHING_STAFF`** (see Prisma enum and [src/auth/docs/README.md](src/auth/docs/README.md)).
- **`ORG_ADMIN`**: no team binding (`teamId` null) — administers the whole organization.
- **`TEAM_ADMIN`**, **`ATHLETE`**, **`COACHING_STAFF`**: **`teamId` is required** — the user is always bound to a specific team inside the org. Service-layer validation enforces this together with DB rules.

**Other consolidated rules**

- A user may be linked to **more than one team** (across contexts); a team may enter **many championships**.
- An athlete **must not** play the same championship for two different teams.
- Coaching staff is a **distinct role** from athlete.
- **Jersey number** is contextual to the user–team affiliation in that organization.
- Stats and bracketing are **manual** in the first version (no automated engine requirement in v1).

---

## Documentation in this repository

| Audience | Document |
| -------- | -------- |
| Agent and developer rules (commands, Prisma restrictions, planning) | [CLAUDE.md](CLAUDE.md) |
| Architecture hub, document map, current implementation snapshot | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Database naming, migrations, DB-only SQL | [docs/DATABASE.md](docs/DATABASE.md) |
| HTTP errors, response envelope, pagination | [docs/HTTP-LAYER.md](docs/HTTP-LAYER.md) |
| Repository layout | [docs/PROJECT-LAYOUT.md](docs/PROJECT-LAYOUT.md) |
| Tests policy | [docs/TESTING-STRATEGY.md](docs/TESTING-STRATEGY.md) |
| Known gaps / next milestones | [docs/ROADMAP-GAPS.md](docs/ROADMAP-GAPS.md) |

Project-wide Markdown under `docs/` uses **UPPERCASE** filenames. Nest modules may add **`src/<domain>/docs/README.md`**; the architecture doc lists them.

---

## Quick start (API on the host)

For **API-only** iteration on your machine (no API container), with Postgres reachable (e.g. infra up and `DATABASE_URL` pointing at **`localhost:5433`**):

```bash
npm install
npm run prisma:generate
npm run start:dev
```

Environment variables: [CLAUDE.md](CLAUDE.md) (Local Environment). Prefer the **Docker** section above when you need the **full stack** or the same wiring as CI/teammates.

---

## Common commands

```bash
npm run start:dev    # API in watch mode
npm test             # unit tests (services only, per project convention)
npm run lint
npm run prisma:generate
```

**Migrations:** automated agents must **not** run `prisma migrate` commands; humans apply migrations when ready. Full policy in [CLAUDE.md](CLAUDE.md).

---

## License

Private / thesis project — see [package.json](package.json) (`license` field).
