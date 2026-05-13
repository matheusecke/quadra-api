import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { TeamsModule } from './teams/teams.module';
import { OrganizationTeamAffiliationsModule } from './organization-team-affiliations/organization-team-affiliations.module';
import { OrganizationUserAffiliationsModule } from './organization-user-affiliations/organization-user-affiliations.module';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    TeamsModule,
    OrganizationTeamAffiliationsModule,
    OrganizationUserAffiliationsModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useFactory: (reflector: Reflector) =>
        new ResponseTransformInterceptor(reflector),
      inject: [Reflector],
    },
  ],
})
export class AppModule {}
