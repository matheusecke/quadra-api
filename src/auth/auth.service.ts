import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  AffiliationStatus,
  EntityStatus,
  OrgRole,
  Prisma,
} from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import type { LoginResponseDto } from './dto/login-response.dto';
import type { OrgAffiliationDto } from './dto/org-affiliation.dto';
import type { MeResponseDto } from './dto/me-response.dto';
import type { TokenResponseDto } from './dto/token-response.dto';
import type { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';
import { OrganizationUserAffiliationsService } from '../organization-user-affiliations/organization-user-affiliations.service';
import { InviteDecision } from '../organization-user-affiliations/dto/user-invite-response.dto';
import type { MyInviteDto } from './dto/my-invite.dto';

export interface LoginResult extends LoginResponseDto {
  rawRefreshToken: string;
}

interface ChooseOrgResult extends TokenResponseDto {
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

type ResolvedOrgContext = {
  organizationId: number | null;
  role: OrgRole | null;
};

type OrgContextReadClient = Pick<PrismaService, 'organizationUserAffiliation'>;

type UsableOrgAffiliation = {
  userId: number;
  organizationId: number;
  role: OrgRole;
  teamId: number | null;
  organization: { name: string; slug: string };
  user: TokenUser;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly organizationUserAffiliationsService: OrganizationUserAffiliationsService,
  ) {}

  async register(dto: RegisterDto): Promise<LoginResult> {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.usersService.create(
        {
          email: dto.email,
          name: dto.name,
          password: dto.password,
          birthDate: this.parseDateOnly(dto.birthDate),
          height: dto.height ?? null,
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

    const affiliations = await this.findUsableOrgAffiliations(
      this.prisma,
      user.id,
    );

    return this.issueLoginResult(user, this.mapAffiliations(affiliations));
  }

  async refreshAccessToken(
    rawToken: string,
  ): Promise<{ accessToken: string; newRawRefreshToken: string }> {
    const tokenHash = this.hashToken(rawToken);

    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.refreshToken.findFirst({
        where: { tokenHash, isRevoked: false },
        select: {
          id: true,
          userId: true,
          organizationId: true,
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

      await this.consumeRefreshToken(tx, stored.id);

      if (stored.user.isDeleted || stored.user.status !== EntityStatus.ACTIVE) {
        throw ApiException.unauthorized('Refresh token is invalid or expired.');
      }

      const orgContext = await this.getActiveOrgContext(
        tx,
        stored.userId,
        stored.organizationId,
      );
      const accessToken = this.signAccessToken(
        stored.user,
        orgContext.organizationId,
        orgContext.role,
      );
      const newRawRefreshToken = await this.createRefreshToken(
        stored.userId,
        tx,
        orgContext.organizationId,
      );

      return { accessToken, newRawRefreshToken };
    });
  }

  async createRefreshToken(
    userId: number,
    client: Pick<PrismaService, 'refreshToken'> = this.prisma,
    organizationId: number | null = null,
  ): Promise<string> {
    const rawToken = crypto.randomUUID();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.refreshExpiryMs());

    await client.refreshToken.create({
      data: { userId, organizationId, tokenHash, expiresAt },
    });

    return rawToken;
  }

  private parseDateOnly(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;

    const tokenHash = this.hashToken(rawRefreshToken);

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, isRevoked: false },
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

  async getUserOrgs(
    userId: number,
    filters: { name?: string } = {},
  ): Promise<OrgAffiliationDto[]> {
    await this.ensureActiveUser(userId);

    const affiliations = await this.findUsableOrgAffiliations(
      this.prisma,
      userId,
      undefined,
      filters,
    );

    return this.mapAffiliations(affiliations);
  }

  async getInvites(userId: number): Promise<MyInviteDto[]> {
    return this.organizationUserAffiliationsService.findPendingInvitesForUser(
      userId,
    );
  }

  async respondToInvite(
    userId: number,
    inviteId: number,
    decision: InviteDecision,
  ): Promise<void> {
    await this.organizationUserAffiliationsService.respondToInviteForUser(
      userId,
      inviteId,
      decision,
    );
  }

  async chooseOrg(
    userId: number,
    organizationId: number,
    rawRefreshToken: string,
  ): Promise<ChooseOrgResult> {
    const tokenHash = this.hashToken(rawRefreshToken);

    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.refreshToken.findFirst({
        where: { tokenHash, isRevoked: false },
        select: { id: true, userId: true, expiresAt: true },
      });

      if (
        !stored ||
        stored.userId !== userId ||
        stored.expiresAt < new Date()
      ) {
        throw ApiException.unauthorized('Refresh token is invalid or expired.');
      }

      const [affiliation] = await this.findUsableOrgAffiliations(
        tx,
        userId,
        organizationId,
      );

      if (!affiliation) {
        throw ApiException.forbidden(
          'No active affiliation with this organization.',
        );
      }

      await this.consumeRefreshToken(tx, stored.id);

      const newRawRefreshToken = await this.createRefreshToken(
        userId,
        tx,
        affiliation.organizationId,
      );

      return {
        rawRefreshToken: newRawRefreshToken,
        accessToken: this.signAccessToken(
          affiliation.user,
          affiliation.organizationId,
          affiliation.role,
        ),
      };
    });
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

  getRefreshCookieMaxAgeMs(): number {
    return this.refreshExpiryMs();
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private async consumeRefreshToken(
    client: Pick<PrismaService, 'refreshToken'>,
    id: number,
  ): Promise<void> {
    const result = await client.refreshToken.updateMany({
      where: { id, isRevoked: false },
      data: { isRevoked: true },
    });

    if (result.count !== 1) {
      throw ApiException.unauthorized('Refresh token is invalid or expired.');
    }
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

  // Prisma cannot express equality between the outer affiliation's
  // organizationId and the nested team affiliation's organizationId within a
  // single relation filter, so this correlates them in memory. The nested
  // select is bounded to active, non-deleted team links, so there is no N+1.
  private async findUsableOrgAffiliations(
    client: OrgContextReadClient,
    userId: number,
    organizationId?: number,
    filters: { name?: string } = {},
  ): Promise<UsableOrgAffiliation[]> {
    const name = filters.name?.trim();
    const rows = await client.organizationUserAffiliation.findMany({
      where: {
        userId,
        ...(organizationId !== undefined ? { organizationId } : {}),
        isDeleted: false,
        status: AffiliationStatus.ACTIVE,
        user: { is: { isDeleted: false, status: EntityStatus.ACTIVE } },
        organization: {
          is: {
            isDeleted: false,
            status: EntityStatus.ACTIVE,
            ...(name
              ? {
                  name: { contains: name, mode: Prisma.QueryMode.insensitive },
                }
              : {}),
          },
        },
      },
      select: {
        userId: true,
        organizationId: true,
        role: true,
        teamId: true,
        organization: { select: { name: true, slug: true } },
        user: { select: { id: true, email: true, isSystemAdmin: true } },
        team: {
          select: {
            status: true,
            isDeleted: true,
            organizationAffiliations: {
              where: { status: AffiliationStatus.ACTIVE, isDeleted: false },
              select: { organizationId: true },
            },
          },
        },
      },
    });

    return rows
      .filter((row) => {
        if (row.role === OrgRole.ORG_ADMIN) return row.teamId === null;
        return (
          row.teamId !== null &&
          row.team !== null &&
          !row.team.isDeleted &&
          row.team.status === EntityStatus.ACTIVE &&
          row.team.organizationAffiliations.some(
            (link) => link.organizationId === row.organizationId,
          )
        );
      })
      .map((row) => ({
        userId: row.userId,
        organizationId: row.organizationId,
        role: row.role,
        teamId: row.teamId,
        organization: row.organization,
        user: row.user,
      }));
  }

  private async getActiveOrgContext(
    client: OrgContextReadClient,
    userId: number,
    organizationId: number | null,
  ): Promise<ResolvedOrgContext> {
    if (organizationId === null) return { organizationId: null, role: null };
    const [affiliation] = await this.findUsableOrgAffiliations(
      client,
      userId,
      organizationId,
    );
    return affiliation
      ? { organizationId: affiliation.organizationId, role: affiliation.role }
      : { organizationId: null, role: null };
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
