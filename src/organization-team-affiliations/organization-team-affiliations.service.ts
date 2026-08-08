import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AffiliationToken } from '../common/utils/affiliation-token.util';
import { ApiException } from '../common/exceptions/api.exception';
import {
  AffiliationStatus,
  EntityStatus,
  OrgRole,
  Prisma,
} from '@prisma/client';
import { slugify } from '../common/utils/slugify';
import { OrganizationUserAffiliationsService } from '../organization-user-affiliations/organization-user-affiliations.service';
import { CreateTeamAffiliationDto } from './dto/create-team-affiliation.dto';
import {
  InviteDecision,
  TeamInviteResponseDto,
} from './dto/team-invite-response.dto';
import { UpdateTeamAffiliationStatusDto } from './dto/update-team-affiliation-status.dto';
import { ListTeamAffiliationsQueryDto } from './dto/list-team-affiliations-query.dto';
import type { TeamAffiliationResponseDto } from './dto/team-affiliation-response.dto';
import type { UserAffiliationResponseDto } from '../organization-user-affiliations/dto/user-affiliation-response.dto';

const teamIdentitySelect = {
  id: true,
  name: true,
  shortName: true,
  city: true,
  state: true,
} satisfies Prisma.TeamSelect;

type TeamIdentity = Prisma.TeamGetPayload<{
  select: typeof teamIdentitySelect;
}>;

const affiliationSelect = {
  id: true,
  organizationId: true,
  teamId: true,
  status: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  team: { select: teamIdentitySelect },
};

export type TeamOnboardingResult = {
  teamAffiliation: TeamAffiliationResponseDto;
  userAffiliation: UserAffiliationResponseDto;
  inviteToken: string;
  inviteExpiresAt: Date;
};

@Injectable()
export class OrganizationTeamAffiliationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userAffiliations: OrganizationUserAffiliationsService,
  ) {}

  async create(
    organizationId: number,
    dto: CreateTeamAffiliationDto,
    actorUserId: number,
  ): Promise<TeamOnboardingResult> {
    if ((dto.teamId === undefined) === (dto.teamName === undefined)) {
      throw ApiException.badRequest(
        'Exactly one of teamId or teamName is required',
      );
    }

    try {
      return await this.runSerializable(async (tx) => {
        let team: TeamIdentity;
        if (dto.teamName !== undefined) {
          const slug = slugify(dto.teamName);
          if (
            await tx.team.findFirst({
              where: { slug, isDeleted: false },
              select: { id: true },
            })
          ) {
            throw ApiException.conflict(
              'A team with this name already exists.',
            );
          }
          team = await tx.team.create({
            data: {
              name: dto.teamName,
              shortName: this.deriveShortName(dto.teamName),
              slug,
              city: null,
              state: null,
              status: EntityStatus.ACTIVE,
            },
            select: teamIdentitySelect,
          });
        } else {
          if (dto.teamId === undefined) {
            throw ApiException.badRequest(
              'Exactly one of teamId or teamName is required',
            );
          }
          const found = await tx.team.findFirst({
            where: {
              id: dto.teamId,
              status: EntityStatus.ACTIVE,
              isDeleted: false,
            },
            select: teamIdentitySelect,
          });
          if (!found) throw ApiException.notFound('Team not found');
          team = found;
        }

        let teamAffiliation = await tx.organizationTeamAffiliation.findFirst({
          where: { organizationId, teamId: team.id, isDeleted: false },
          select: affiliationSelect,
        });
        if (teamAffiliation?.status === AffiliationStatus.INACTIVE) {
          throw ApiException.unprocessable(
            'Team affiliation is inactive; activate it before inviting users',
          );
        }
        if (
          teamAffiliation &&
          teamAffiliation.status !== AffiliationStatus.PENDING &&
          teamAffiliation.status !== AffiliationStatus.ACTIVE
        ) {
          throw ApiException.unprocessable(
            'Team affiliation must be PENDING or ACTIVE to invite administrators',
          );
        }
        if (!teamAffiliation) {
          teamAffiliation = await tx.organizationTeamAffiliation.create({
            data: {
              organizationId,
              teamId: team.id,
              status: AffiliationStatus.PENDING,
              createdByUserId: actorUserId,
              inviteToken: null,
              inviteExpiresAt: null,
            },
            select: affiliationSelect,
          });
        }

        const userInvite = await this.userAffiliations.createPendingInvite(tx, {
          organizationId,
          userId: dto.adminUserId,
          role: OrgRole.TEAM_ADMIN,
          teamId: team.id,
          jerseyNumber: null,
          position: null,
          createdByUserId: actorUserId,
        });
        return {
          teamAffiliation,
          userAffiliation: userInvite.affiliation,
          inviteToken: userInvite.inviteToken,
          inviteExpiresAt: userInvite.inviteExpiresAt,
        };
      });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        if (dto.teamName !== undefined) {
          throw ApiException.conflict('A team with this name already exists.');
        }
        throw ApiException.conflict(
          'Team already has a live affiliation with this organization',
        );
      }
      throw error;
    }
  }

  async findAll(orgId: number, query: ListTeamAffiliationsQueryDto) {
    const { page, limit, status, q, inviteExpired } = query;
    const skip = (page - 1) * limit;
    const where = {
      organizationId: orgId,
      isDeleted: false,
      ...(inviteExpired
        ? {
            status: AffiliationStatus.PENDING,
            inviteExpiresAt: { lt: new Date() },
          }
        : status
          ? { status }
          : {}),
      ...(q
        ? { team: { name: { contains: q, mode: 'insensitive' as const } } }
        : {}),
    };
    const [count, data] = await Promise.all([
      this.prisma.organizationTeamAffiliation.count({ where }),
      this.prisma.organizationTeamAffiliation.findMany({
        where,
        select: affiliationSelect,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { count, data };
  }

  async findById(orgId: number, id: number) {
    const aff = await this.prisma.organizationTeamAffiliation.findUnique({
      where: { id, organizationId: orgId, isDeleted: false },
      select: affiliationSelect,
    });
    if (!aff) throw ApiException.notFound('Affiliation not found');
    return aff;
  }

  async respondToInvite(dto: TeamInviteResponseDto) {
    const tokenHash = AffiliationToken.hash(dto.token);
    const aff = await this.prisma.organizationTeamAffiliation.findFirst({
      where: { inviteToken: tokenHash, isDeleted: false },
    });
    if (!aff) throw ApiException.notFound('Invite not found');
    if (aff.status !== AffiliationStatus.PENDING)
      throw ApiException.unprocessable('Invite is no longer pending');
    if (aff.inviteExpiresAt && aff.inviteExpiresAt < new Date())
      throw ApiException.unprocessable('Invite has expired');

    if (dto.decision === InviteDecision.ACCEPT) {
      return this.prisma.organizationTeamAffiliation.update({
        where: { id: aff.id },
        data: {
          status: AffiliationStatus.ACTIVE,
          inviteToken: null,
          inviteExpiresAt: null,
        },
        select: affiliationSelect,
      });
    }

    return this.prisma.organizationTeamAffiliation.update({
      where: { id: aff.id },
      data: { isDeleted: true, inviteToken: null, inviteExpiresAt: null },
      select: affiliationSelect,
    });
  }

  async resend(orgId: number, id: number) {
    const aff = await this.prisma.organizationTeamAffiliation.findUnique({
      where: { id, organizationId: orgId, isDeleted: false },
    });
    if (!aff) throw ApiException.notFound('Affiliation not found');
    if (aff.status !== AffiliationStatus.PENDING)
      throw ApiException.unprocessable(
        'Can only resend invite for PENDING affiliations',
      );

    const { raw, hash, expiresAt } = AffiliationToken.generate();
    const updated = await this.prisma.organizationTeamAffiliation.update({
      where: { id },
      data: { inviteToken: hash, inviteExpiresAt: expiresAt },
      select: affiliationSelect,
    });
    return { affiliation: updated, inviteToken: raw };
  }

  async remove(orgId: number, id: number) {
    const aff = await this.prisma.organizationTeamAffiliation.findUnique({
      where: { id, organizationId: orgId, isDeleted: false },
    });
    if (!aff) throw ApiException.notFound('Affiliation not found');
    await this.prisma.organizationTeamAffiliation.update({
      where: { id },
      data: { isDeleted: true, inviteToken: null, inviteExpiresAt: null },
    });
  }

  async updateStatus(
    orgId: number,
    id: number,
    dto: UpdateTeamAffiliationStatusDto,
  ) {
    const aff = await this.prisma.organizationTeamAffiliation.findUnique({
      where: { id, organizationId: orgId, isDeleted: false },
    });
    if (!aff) throw ApiException.notFound('Affiliation not found');
    return this.prisma.organizationTeamAffiliation.update({
      where: { id },
      data: { status: dto.status },
      select: affiliationSelect,
    });
  }

  async findByTeam(teamId: number, query: ListTeamAffiliationsQueryDto) {
    const { page, limit, status, q, inviteExpired } = query;
    const skip = (page - 1) * limit;
    const where = {
      teamId,
      isDeleted: false,
      ...(inviteExpired
        ? {
            status: AffiliationStatus.PENDING,
            inviteExpiresAt: { lt: new Date() },
          }
        : status
          ? { status }
          : {}),
      ...(q
        ? {
            organization: {
              name: { contains: q, mode: 'insensitive' as const },
            },
          }
        : {}),
    };
    const [count, data] = await Promise.all([
      this.prisma.organizationTeamAffiliation.count({ where }),
      this.prisma.organizationTeamAffiliation.findMany({
        where,
        select: affiliationSelect,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { count, data };
  }

  private deriveShortName(name: string): string {
    const words: string[] =
      name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .match(/[A-Z0-9]+/g) ?? [];
    if (words.length === 0) {
      throw ApiException.badRequest(
        'Team name must contain an alphanumeric character',
      );
    }
    if (words.length === 1) return words[0].slice(0, 3);
    if (words.length >= 3)
      return words
        .slice(0, 3)
        .map((word) => word[0])
        .join('');

    const [first, second] = words;
    const secondPart = second.slice(0, 2);
    const missing = 2 - secondPart.length;
    const filler = (first.slice(1) + second.slice(2)).slice(0, missing);
    return (first[0] + filler + secondPart).slice(0, 3);
  }

  private async runSerializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let retry = 0; retry <= 3; retry += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!this.isPrismaError(error, 'P2034')) throw error;
        if (retry === 3) throw this.concurrentModification();
      }
    }
    throw this.concurrentModification();
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === code
    );
  }

  private concurrentModification(): ApiException {
    return ApiException.conflict(
      'The resource changed during this operation. Retry the request.',
      'CONCURRENT_MODIFICATION',
    );
  }
}
