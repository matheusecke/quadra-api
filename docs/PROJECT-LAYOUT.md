# Project layout

Source tree for agents that need file paths without loading the full architecture hub.

## `src/` application tree

```text
src/
├── main.ts
├── app.module.ts
│
├── prisma/
│   ├── docs/
│   │   └── README.md
│   ├── prisma.module.ts
│   └── prisma.service.ts
│
├── common/
│   ├── dto/
│   │   ├── pagination-defaults.dto.ts
│   │   └── pagination-response.dto.ts
│   ├── exceptions/
│   │   └── api.exception.ts
│   ├── filters/
│   │   ├── api-exception.filter.ts
│   │   └── prisma-exception.filter.ts
│   ├── interceptors/
│   │   ├── pagination.interceptor.ts
│   │   └── response-transform.interceptor.ts
│   ├── pipes/
│   │   ├── validation.factory.ts
│   │   └── parse-int-api.pipe.ts
│   └── utils/
│       └── slugify.ts
│
├── auth/
│   ├── docs/
│   │   └── README.md
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── decorators/
│   ├── dto/
│   ├── guards/
│   ├── interfaces/
│   └── strategies/
│
├── users/
│   ├── docs/
│   │   └── README.md
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── dto/
│
├── organizations/
│   ├── docs/
│   │   └── README.md
│   ├── organizations.module.ts
│   ├── organizations.controller.ts
│   ├── organizations.service.ts
│   └── dto/
│
├── teams/
│   ├── docs/
│   │   └── README.md
│   ├── teams.module.ts
│   ├── teams.controller.ts
│   ├── teams.service.ts
│   └── dto/
│
└── statistics/
    ├── docs/README.md
    ├── dto/statistics-response.dto.ts
    ├── statistics.module.ts
    ├── statistics.service.ts
    └── statistics.service.spec.ts
```

## `prisma/` schema tree

```text
prisma/
├── schema/
│   ├── enums.prisma
│   ├── schema.prisma
│   ├── user.prisma
│   ├── organization.prisma
│   ├── team.prisma
│   ├── refresh-token.prisma
│   ├── organization-user-affiliation.prisma
│   └── organization-team-affiliation.prisma
└── migrations/
```

## App composition

Registered in `src/app.module.ts`:

- `ConfigModule` (global)
- `ThrottlerModule` + global `ThrottlerGuard` (`APP_GUARD` in `app.module.ts`) — default rate limit; stricter `@Throttle` on selected routes; `/api` excluded for Swagger. **Full trade-offs, proxy and replica behavior, evolution path:** [HTTP-LAYER.md#rate-limiting](./HTTP-LAYER.md#rate-limiting).
- `PrismaModule`, `AuthModule`, `UsersModule`, `OrganizationsModule`, `TeamsModule`, `OrganizationTeamAffiliationsModule`, `OrganizationUserAffiliationsModule`
- Global `ResponseTransformInterceptor` via `APP_INTERCEPTOR`
- `StatisticsModule` is **not** registered directly in `AppModule`. It is an internal, Prisma-free, controller-free module imported by `AthletesModule` and `TournamentsModule` to share pure aggregation, shooting/TS%/EFF derivation, and deterministic leader ranking.

Bootstrap (`src/main.ts`): `cookie-parser`, shutdown hooks, CORS with credentials, `ValidationPipe`, global filters, Swagger at `/api`, default port `3001`.

See [HTTP-LAYER.md](./HTTP-LAYER.md) for filters and response shape.
