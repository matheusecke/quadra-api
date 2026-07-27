import { ExecutionContext, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { TeamsModule } from './teams/teams.module';
import { OrganizationTeamAffiliationsModule } from './organization-team-affiliations/organization-team-affiliations.module';
import { OrganizationUserAffiliationsModule } from './organization-user-affiliations/organization-user-affiliations.module';
import { SeasonsModule } from './seasons/seasons.module';
import { TournamentCategoriesModule } from './tournament-categories/tournament-categories.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { AthletesModule } from './athletes/athletes.module';
import { TournamentTeamsModule } from './tournament-teams/tournament-teams.module';
import { TournamentRostersModule } from './tournament-rosters/tournament-rosters.module';
import { TournamentGroupsModule } from './tournament-groups/tournament-groups.module';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

/**
 * Rate limiting (`@nestjs/throttler`):
 * - `ThrottlerGuard` is registered globally so defaults apply to every HTTP route.
 * - Default: 120 requests / 60s / tracker (IP by library default) — tuned for SPA-style read traffic.
 * - Stricter per-route limits use `@Throttle` on controllers (e.g. auth, invite resend).
 * - Requests under `/api` are skipped so Swagger UI and OpenAPI JSON are not throttled.
 * - Behind reverse proxies: without correct `trust proxy` / forwarded headers, every client may
 *   appear as the same IP (shared bucket). With multiple app replicas, in-memory counters are per
 *   instance (effective ceiling scales with replica count) unless you add shared storage or edge limits.
 * Full trade-offs, operational notes, and evolution path: docs/HTTP-LAYER.md (Rate limiting).
 */
function skipThrottlerForSwaggerPath(context: ExecutionContext): boolean {
  // Skip Swagger UI and OpenAPI JSON under `/api`.
  if (context.getType() !== 'http') {
    return false;
  }
  const req = context.switchToHttp().getRequest<{ url?: string }>();
  const url = req?.url ?? '';
  return url.startsWith('/api');
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      skipIf: skipThrottlerForSwaggerPath,
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    TeamsModule,
    OrganizationTeamAffiliationsModule,
    OrganizationUserAffiliationsModule,
    SeasonsModule,
    TournamentCategoriesModule,
    TournamentsModule,
    AthletesModule,
    TournamentTeamsModule,
    TournamentRostersModule,
    TournamentGroupsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useFactory: (reflector: Reflector) =>
        new ResponseTransformInterceptor(reflector),
      inject: [Reflector],
    },
  ],
})
export class AppModule {}
