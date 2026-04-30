import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import type { JwtPayload, OrgRole } from './interfaces/jwt-payload.interface';
import type { LoginResponseDto } from './dto/login-response.dto';
import type { OrgAffiliationDto } from './dto/org-affiliation.dto';
import type { MeResponseDto } from './dto/me-response.dto';
import type { TokenResponseDto } from './dto/token-response.dto';

export interface LoginResult extends LoginResponseDto {
  rawRefreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { email, isDeleted: false },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        isSystemAdmin: true,
        status: true,
      },
    });

    if (!user) {
      throw ApiException.unauthorized('Invalid credentials.');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw ApiException.unauthorized('Invalid credentials.');
    }

    const affiliations = await this.prisma.organizationUserAffiliation.findMany({
      where: { userId: user.id, isDeleted: false },
      select: {
        organizationId: true,
        role: true,
        teamId: true,
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      isSystemAdmin: user.isSystemAdmin,
      organizationId: null,
      role: null,
    };

    const accessToken = this.jwtService.sign(payload);
    const rawRefreshToken = await this.createRefreshToken(user.id);

    const organizations: OrgAffiliationDto[] = affiliations.map((a) => ({
      organizationId: a.organizationId,
      organizationName: a.organization.name,
      organizationSlug: a.organization.slug,
      role: a.role,
      teamId: a.teamId,
    }));

    return {
      rawRefreshToken,
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSystemAdmin: user.isSystemAdmin,
      },
      organizations,
    };
  }

  async refreshAccessToken(rawToken: string): Promise<{ accessToken: string; newRawRefreshToken: string }> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, isRevoked: false },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            email: true,
            isSystemAdmin: true,
          },
        },
      },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw ApiException.unauthorized('Refresh token is invalid or expired.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    const payload: JwtPayload = {
      sub: stored.user.id,
      email: stored.user.email,
      isSystemAdmin: stored.user.isSystemAdmin,
      organizationId: null,
      role: null,
    };

    const accessToken = this.jwtService.sign(payload);
    const newRawRefreshToken = await this.createRefreshToken(stored.userId);

    return { accessToken, newRawRefreshToken };
  }

  async createRefreshToken(userId: number): Promise<string> {
    const rawToken = crypto.randomUUID();
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + this.refreshExpiryMs());

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return rawToken;
  }

  async logout(userId: number, rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;

    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  async getMe(
    userId: number,
    organizationId: number | null,
    role: OrgRole | null,
  ): Promise<MeResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { id: true, email: true, name: true, isSystemAdmin: true },
    });

    if (!user) {
      throw ApiException.notFound('User not found.');
    }

    return { ...user, organizationId, role };
  }

  async getUserOrgs(userId: number): Promise<OrgAffiliationDto[]> {
    const affiliations = await this.prisma.organizationUserAffiliation.findMany({
      where: { userId, isDeleted: false },
      select: {
        organizationId: true,
        role: true,
        teamId: true,
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    return affiliations.map((a) => ({
      organizationId: a.organizationId,
      organizationName: a.organization.name,
      organizationSlug: a.organization.slug,
      role: a.role,
      teamId: a.teamId,
    }));
  }

  async chooseOrg(userId: number, organizationId: number): Promise<TokenResponseDto> {
    const affiliation = await this.prisma.organizationUserAffiliation.findFirst({
      where: { userId, organizationId, isDeleted: false },
      select: {
        userId: true,
        organizationId: true,
        role: true,
        user: {
          select: { id: true, email: true, isSystemAdmin: true },
        },
      },
    });

    if (!affiliation) {
      throw ApiException.forbidden('No active affiliation with this organization.');
    }

    const payload: JwtPayload = {
      sub: affiliation.user.id,
      email: affiliation.user.email,
      isSystemAdmin: affiliation.user.isSystemAdmin,
      organizationId: affiliation.organizationId,
      role: affiliation.role,
    };

    return { accessToken: this.jwtService.sign(payload) };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw ApiException.notFound('User not found.');
    }

    const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordValid) {
      throw ApiException.badRequest('Current password is incorrect.', 'WRONG_CURRENT_PASSWORD');
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  private refreshExpiryMs(): number {
    const value = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const match = value.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 86_400_000;
    const units: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return parseInt(match[1], 10) * (units[match[2]] ?? 1_000);
  }
}
