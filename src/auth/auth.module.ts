import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OrgRoleGuard } from './guards/org-role.guard';
import { SystemAdminGuard } from './guards/system-admin.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { OrganizationUserAffiliationsModule } from '../organization-user-affiliations/organization-user-affiliations.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    UsersModule,
    OrganizationUserAffiliationsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ??
            '15m') as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    OrgRoleGuard,
    SystemAdminGuard,
  ],
  exports: [JwtModule, JwtAuthGuard, OrgRoleGuard, SystemAdminGuard],
})
export class AuthModule {}
