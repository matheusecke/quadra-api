# Project layout

Source tree for agents that need file paths without loading the full architecture hub.

## `src/` application tree

```text
src/
├── main.ts
├── app.module.ts
│
├── prisma/
│   ├── docs/README.md
│   ├── prisma.module.ts
│   └── prisma.service.ts
│
├── common/
│   ├── dto/
│   ├── exceptions/
│   ├── filters/
│   ├── interceptors/
│   ├── pipes/
│   ├── swagger/
│   └── utils/
│
├── health/
│   ├── health.module.ts
│   └── health.controller.ts
│
├── auth/
│   ├── docs/README.md
│   ├── auth.module.ts / .controller.ts / .service.ts
│   ├── decorators/ · dto/ · guards/ · interfaces/ · strategies/
│
├── users/
│   ├── docs/README.md
│   └── users.module.ts / .controller.ts / .service.ts / dto/
│
├── organizations/
│   ├── docs/README.md
│   └── organizations.module.ts / .controller.ts / .service.ts / dto/
│
├── teams/
│   ├── docs/README.md
│   └── teams.module.ts / .controller.ts / .service.ts / dto/
│
├── organization-team-affiliations/
│   ├── docs/README.md
│   └── organization-team-affiliations.module.ts / .controller.ts / .service.ts / dto/
│
├── organization-user-affiliations/
│   ├── docs/README.md
│   └── organization-user-affiliations.module.ts / .controller.ts / .service.ts / dto/
│
├── seasons/
│   ├── docs/README.md
│   └── seasons.module.ts / .controller.ts / .service.ts / dto/
│
├── tournament-categories/
│   ├── docs/README.md
│   └── tournament-categories.module.ts / .controller.ts / .service.ts / dto/
│
├── tournaments/
│   ├── docs/README.md
│   └── tournaments.module.ts / .controller.ts / .service.ts / dto/
│
├── athletes/
│   ├── docs/README.md
│   └── athletes.module.ts / .controller.ts / .service.ts / dto/
│
├── tournament-teams/
│   ├── docs/README.md
│   └── tournament-teams.module.ts / .controller.ts / .service.ts / dto/
│
├── tournament-rosters/
│   ├── docs/README.md
│   └── tournament-rosters.module.ts / .controller.ts / .service.ts / dto/
│
├── tournament-groups/
│   ├── docs/README.md
│   └── tournament-groups.module.ts / .controller.ts / .service.ts / dto/
│
├── tournament-brackets/
│   ├── docs/README.md
│   └── tournament-brackets.module.ts / .controller.ts / .service.ts / dto/
│
├── matches/
│   ├── docs/README.md
│   └── matches.module.ts / .controller.ts / .service.ts / dto/
│
├── standings/
│   ├── docs/README.md
│   └── standings.module.ts / .controller.ts / .service.ts / standings-ranking.ts / dto/
│
└── statistics/
    ├── docs/README.md
    ├── statistics.module.ts / .service.ts / .service.spec.ts
    └── dto/statistics-response.dto.ts
```

## `prisma/` schema tree

```text
prisma/
├── schema/
│   ├── schema.prisma
│   ├── enums.prisma
│   ├── user.prisma
│   ├── refresh-token.prisma
│   ├── organization.prisma
│   ├── team.prisma
│   ├── organization-user-affiliation.prisma
│   ├── organization-team-affiliation.prisma
│   ├── season.prisma
│   ├── tournament-category.prisma
│   ├── tournament.prisma
│   ├── tournament-team.prisma
│   ├── tournament-roster.prisma
│   ├── tournament-group.prisma
│   ├── tournament-group-team.prisma
│   ├── tournament-bracket-round.prisma
│   ├── tournament-bracket-slot.prisma
│   ├── match.prisma
│   ├── match-team.prisma
│   ├── match-period.prisma
│   ├── match-roster.prisma
│   └── player-match-statistic.prisma
└── migrations/
```

## App composition

Registered in `src/app.module.ts`, in this order:

- `ConfigModule` (global)
- `ThrottlerModule` + global `ThrottlerGuard` (`APP_GUARD`) — default rate limit; stricter `@Throttle` on selected routes; `/api` excluded for Swagger. **Full trade-offs, proxy and replica behavior, evolution path:** [HTTP-LAYER.md#rate-limiting](./HTTP-LAYER.md#rate-limiting).
- `HealthModule`, `PrismaModule`, `AuthModule`, `UsersModule`, `OrganizationsModule`, `TeamsModule`, `OrganizationTeamAffiliationsModule`, `OrganizationUserAffiliationsModule`, `SeasonsModule`, `TournamentCategoriesModule`, `TournamentsModule`, `AthletesModule`, `TournamentTeamsModule`, `TournamentRostersModule`, `TournamentGroupsModule`, `TournamentBracketsModule`, `MatchesModule`, `StandingsModule`
- Global `ResponseTransformInterceptor` via `APP_INTERCEPTOR`
- `StatisticsModule` is **not** registered directly in `AppModule`. It is an internal, Prisma-free, controller-free module imported by `AthletesModule` and `TournamentsModule` to share pure aggregation, shooting/TS%/EFF derivation, and deterministic leader ranking.

Bootstrap (`src/main.ts`): `cookie-parser`, shutdown hooks, CORS with credentials, `ValidationPipe`, global filters, Swagger at `/api`, default port `3001`.

See [HTTP-LAYER.md](./HTTP-LAYER.md) for filters and response shape.
