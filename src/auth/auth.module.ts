import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OrgRoleGuard } from './guards/org-role.guard';
import { SystemAdminGuard } from './guards/system-admin.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ?? '15m') as StringValue,
        },
      }),
    }),
  ],
  providers: [JwtStrategy, JwtAuthGuard, OrgRoleGuard, SystemAdminGuard],
  exports: [JwtModule, JwtAuthGuard, OrgRoleGuard, SystemAdminGuard],
})
export class AuthModule {}
