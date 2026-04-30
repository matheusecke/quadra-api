import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EntityStatus } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import type { JwtPayload, OrgRole } from './interfaces/jwt-payload.interface';
import type { LoginResponseDto } from './dto/login-response.dto';
import type { OrgAffiliationDto } from './dto/org-affiliation.dto';
import type { MeResponseDto } from './dto/me-response.dto';
import type { TokenResponseDto } from './dto/token-response.dto';
import type { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';

export interface LoginResult extends LoginResponseDto {
  rawRefreshToken: string;
}

interface TokenUser {
  id: number;
  email: string;
  isSystemAdmin: boolean;
}

interface LoginUser extends TokenUser {
  name: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async register(dto: RegisterDto): Promise<LoginResult> {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.usersService.create(
        {
          email: dto.email,
          name: dto.name,
          password: dto.password,
          isSystemAdmin: false,
        },
        tx,
      );

      return this.issueLoginResult(user, [], tx);
    });
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { email, isDeleted: false, status: EntityStatus.ACTIVE },
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

    const affiliations = await this.prisma.organizationUserAffiliation.findMany(
      {
        where: { userId: user.id, isDeleted: false },
        select: {
          organizationId: true,
          role: true,
          teamId: true,
          organization: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    );

    return this.issueLoginResult(user, this.mapAffiliations(affiliations));
  }

  async refreshAccessToken(
    rawToken: string,
  ): Promise<{ accessToken: string; newRawRefreshToken: string }> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

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
            status: true,
            isDeleted: true,
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

    if (stored.user.isDeleted || stored.user.status !== EntityStatus.ACTIVE) {
      throw ApiException.unauthorized('Refresh token is invalid or expired.');
    }

    const accessToken = this.signAccessToken(stored.user);
    const newRawRefreshToken = await this.createRefreshToken(stored.userId);

    return { accessToken, newRawRefreshToken };
  }

  async createRefreshToken(
    userId: number,
    client: Pick<PrismaService, 'refreshToken'> = this.prisma,
  ): Promise<string> {
    const rawToken = crypto.randomUUID();
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const expiresAt = new Date(Date.now() + this.refreshExpiryMs());

    await client.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return rawToken;
  }

  async logout(
    userId: number,
    rawRefreshToken: string | undefined,
  ): Promise<void> {
    if (!rawRefreshToken) return;

    const tokenHash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

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
      where: { id: userId, isDeleted: false, status: EntityStatus.ACTIVE },
      select: { id: true, email: true, name: true, isSystemAdmin: true },
    });

    if (!user) {
      throw ApiException.notFound('User not found.');
    }

    return { ...user, organizationId, role };
  }

  async getUserOrgs(userId: number): Promise<OrgAffiliationDto[]> {
    await this.ensureActiveUser(userId);

    const affiliations = await this.prisma.organizationUserAffiliation.findMany(
      {
        where: { userId, isDeleted: false },
        select: {
          organizationId: true,
          role: true,
          teamId: true,
          organization: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    );

    return this.mapAffiliations(affiliations);
  }

  async chooseOrg(
    userId: number,
    organizationId: number,
  ): Promise<TokenResponseDto> {
    const affiliation = await this.prisma.organizationUserAffiliation.findFirst(
      {
        where: {
          userId,
          organizationId,
          isDeleted: false,
          user: { is: { isDeleted: false, status: EntityStatus.ACTIVE } },
        },
        select: {
          userId: true,
          organizationId: true,
          role: true,
          user: {
            select: {
              id: true,
              email: true,
              isSystemAdmin: true,
              status: true,
              isDeleted: true,
            },
          },
        },
      },
    );

    if (!affiliation) {
      throw ApiException.forbidden(
        'No active affiliation with this organization.',
      );
    }

    return {
      accessToken: this.signAccessToken(
        affiliation.user,
        affiliation.organizationId,
        affiliation.role,
      ),
    };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false, status: EntityStatus.ACTIVE },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw ApiException.notFound('User not found.');
    }

    const passwordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw ApiException.badRequest(
        'Current password is incorrect.',
        'WRONG_CURRENT_PASSWORD',
      );
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

  private async ensureActiveUser(userId: number): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false, status: EntityStatus.ACTIVE },
      select: { id: true },
    });

    if (!user) {
      throw ApiException.notFound('User not found.');
    }
  }

  private async issueLoginResult(
    user: LoginUser,
    organizations: OrgAffiliationDto[],
    client: Pick<PrismaService, 'refreshToken'> = this.prisma,
  ): Promise<LoginResult> {
    const accessToken = this.signAccessToken(user);
    const rawRefreshToken = await this.createRefreshToken(user.id, client);

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

  private signAccessToken(
    user: TokenUser,
    organizationId: number | null = null,
    role: OrgRole | null = null,
  ): string {
    return this.jwtService.sign(this.buildPayload(user, organizationId, role));
  }

  private buildPayload(
    user: TokenUser,
    organizationId: number | null,
    role: OrgRole | null,
  ): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      isSystemAdmin: user.isSystemAdmin,
      organizationId,
      role,
    };
  }

  private mapAffiliations(
    affiliations: Array<{
      organizationId: number;
      role: OrgRole;
      teamId: number | null;
      organization: { name: string; slug: string };
    }>,
  ): OrgAffiliationDto[] {
    return affiliations.map((a) => ({
      organizationId: a.organizationId,
      organizationName: a.organization.name,
      organizationSlug: a.organization.slug,
      role: a.role,
      teamId: a.teamId,
    }));
  }

  private refreshExpiryMs(): number {
    const value =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const match = value.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 86_400_000;
    const units: Record<string, number> = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return parseInt(match[1], 10) * (units[match[2]] ?? 1_000);
  }
}
