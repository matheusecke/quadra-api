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
└── teams/
    ├── docs/
    │   └── README.md
    ├── teams.module.ts
    ├── teams.controller.ts
    ├── teams.service.ts
    └── dto/
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
- `ThrottlerModule` (default rate limit; auth routes use stricter `@Throttle` where needed)
- `PrismaModule`, `AuthModule`, `UsersModule`, `OrganizationsModule`, `TeamsModule`
- Global `ResponseTransformInterceptor` via `APP_INTERCEPTOR`

Bootstrap (`src/main.ts`): `cookie-parser`, shutdown hooks, CORS with credentials, `ValidationPipe`, global filters, Swagger at `/api`, default port `3001`.

See [HTTP-LAYER.md](./HTTP-LAYER.md) for filters and response shape.
