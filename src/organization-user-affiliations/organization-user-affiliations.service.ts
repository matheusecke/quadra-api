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
import { CreateUserAffiliationDto } from './dto/create-user-affiliation.dto';
import {
  UserInviteResponseDto,
  InviteDecision,
} from './dto/user-invite-response.dto';
import { UpdateUserAffiliationDto } from './dto/update-user-affiliation.dto';
import { UpdateUserAffiliationStatusDto } from './dto/update-user-affiliation-status.dto';
import { ListUserAffiliationsQueryDto } from './dto/list-user-affiliations-query.dto';
import type { MyInviteDto } from '../auth/dto/my-invite.dto';

const affiliationSelect = {
  id: true,
  userId: true,
  organizationId: true,
  role: true,
  teamId: true,
  jerseyNumber: true,
  status: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true } },
  team: { select: { id: true, name: true } },
};

const myInviteSelect = {
  id: true,
  userId: true,
  organizationId: true,
  role: true,
  teamId: true,
  jerseyNumber: true,
  status: true,
  createdAt: true,
  inviteExpiresAt: true,
  organization: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
} satisfies Prisma.OrganizationUserAffiliationSelect;

const inviteTransitionSelect = {
  id: true,
  userId: true,
  organizationId: true,
  role: true,
  teamId: true,
  jerseyNumber: true,
  status: true,
  inviteExpiresAt: true,
  isDeleted: true,
} satisfies Prisma.OrganizationUserAffiliationSelect;

type PendingInviteRecord = Prisma.OrganizationUserAffiliationGetPayload<{
  select: typeof myInviteSelect;
}>;

type InviteTransitionRecord = Prisma.OrganizationUserAffiliationGetPayload<{
  select: typeof inviteTransitionSelect;
}>;

@Injectable()
export class OrganizationUserAffiliationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    orgId: number,
    dto: CreateUserAffiliationDto,
    currentUserId: number,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId, isDeleted: false, status: 'ACTIVE' },
    });
    if (!user) throw ApiException.notFound('User not found or inactive');

    const existing = await this.prisma.organizationUserAffiliation.findFirst({
      where: {
        userId: dto.userId,
        organizationId: orgId,
        isDeleted: false,
        status: { in: [AffiliationStatus.PENDING, AffiliationStatus.ACTIVE] },
      },
    });
    if (existing)
      throw ApiException.conflict(
        'User already has a pending or active affiliation in this organization',
      );

    if (dto.role !== OrgRole.ORG_ADMIN) {
      if (!dto.teamId)
        throw ApiException.unprocessable(
          'teamId is required for non-ORG_ADMIN roles',
        );
      const teamAff = await this.prisma.organizationTeamAffiliation.findFirst({
        where: {
          organizationId: orgId,
          teamId: dto.teamId,
          isDeleted: false,
          status: AffiliationStatus.ACTIVE,
        },
      });
      if (!teamAff)
        throw ApiException.unprocessable(
          'Team is not actively affiliated with this organization',
        );
    }

    const { raw, hash, expiresAt } = AffiliationToken.generate();
    const affiliation = await this.prisma.organizationUserAffiliation.create({
      data: {
        userId: dto.userId,
        organizationId: orgId,
        role: dto.role,
        teamId: dto.teamId ?? null,
        jerseyNumber: dto.jerseyNumber ?? null,
        status: AffiliationStatus.PENDING,
        createdByUserId: currentUserId,
        inviteToken: hash,
        inviteExpiresAt: expiresAt,
      },
      select: affiliationSelect,
    });

    return { affiliation, inviteToken: raw };
  }

  async findAll(orgId: number, query: ListUserAffiliationsQueryDto) {
    const { page, limit, status, role, teamId, q, inviteExpired } = query;
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
      ...(role ? { role } : {}),
      ...(teamId ? { teamId } : {}),
      ...(q
        ? {
            user: {
              OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { email: { contains: q, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };
    const [count, data] = await Promise.all([
      this.prisma.organizationUserAffiliation.count({ where }),
      this.prisma.organizationUserAffiliation.findMany({
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
    const aff = await this.prisma.organizationUserAffiliation.findUnique({
      where: { id, organizationId: orgId, isDeleted: false },
      select: affiliationSelect,
    });
    if (!aff) throw ApiException.notFound('Affiliation not found');
    return aff;
  }

  async respondToInvite(dto: UserInviteResponseDto, currentUserId: number) {
    const tokenHash = AffiliationToken.hash(dto.token);
    const affiliation = await this.prisma.organizationUserAffiliation.findFirst(
      {
        where: { inviteToken: tokenHash, isDeleted: false },
        select: inviteTransitionSelect,
      },
    );

    if (!affiliation) {
      throw ApiException.notFound('Invite not found');
    }

    if (affiliation.userId !== currentUserId) {
      throw ApiException.forbidden('You can only respond to your own invites');
    }

    await this.resolveInviteTransition(affiliation, dto.decision, {
      allowExpiredReject: false,
    });

    const updated = await this.prisma.organizationUserAffiliation.findUnique({
      where: { id: affiliation.id },
      select: affiliationSelect,
    });

    if (!updated) {
      throw ApiException.notFound('Invite not found');
    }

    return updated;
  }

  async update(orgId: number, id: number, dto: UpdateUserAffiliationDto) {
    const aff = await this.prisma.organizationUserAffiliation.findUnique({
      where: {
        id,
        organizationId: orgId,
        isDeleted: false,
        status: AffiliationStatus.ACTIVE,
      },
    });
    if (!aff) throw ApiException.notFound('Active affiliation not found');

    const newRole = dto.role ?? aff.role;
    const newTeamId = dto.teamId !== undefined ? dto.teamId : aff.teamId;

    if (newRole !== OrgRole.ORG_ADMIN) {
      if (!newTeamId)
        throw ApiException.unprocessable(
          'teamId is required for non-ORG_ADMIN roles',
        );
      const teamAff = await this.prisma.organizationTeamAffiliation.findFirst({
        where: {
          organizationId: orgId,
          teamId: newTeamId,
          isDeleted: false,
          status: AffiliationStatus.ACTIVE,
        },
      });
      if (!teamAff)
        throw ApiException.unprocessable(
          'Team is not actively affiliated with this organization',
        );
    }

    const data: Record<string, unknown> = {};
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.teamId !== undefined) data.teamId = dto.teamId;
    if (dto.jerseyNumber !== undefined) data.jerseyNumber = dto.jerseyNumber;
    if (newRole === OrgRole.ORG_ADMIN) {
      data.teamId = null;
      data.jerseyNumber = null;
    }

    return this.prisma.organizationUserAffiliation.update({
      where: { id },
      data,
      select: affiliationSelect,
    });
  }

  async resend(orgId: number, id: number) {
    const aff = await this.prisma.organizationUserAffiliation.findUnique({
      where: { id, organizationId: orgId, isDeleted: false },
    });
    if (!aff) throw ApiException.notFound('Affiliation not found');
    if (aff.status !== AffiliationStatus.PENDING)
      throw ApiException.unprocessable(
        'Can only resend invite for PENDING affiliations',
      );

    const { raw, hash, expiresAt } = AffiliationToken.generate();
    const updated = await this.prisma.organizationUserAffiliation.update({
      where: { id },
      data: { inviteToken: hash, inviteExpiresAt: expiresAt },
      select: affiliationSelect,
    });
    return { affiliation: updated, inviteToken: raw };
  }

  async remove(
    orgId: number,
    id: number,
    currentUserId: number,
    isSystemAdmin: boolean,
  ) {
    const aff = await this.prisma.organizationUserAffiliation.findUnique({
      where: { id, organizationId: orgId, isDeleted: false },
    });
    if (!aff) throw ApiException.notFound('Affiliation not found');
    if (!isSystemAdmin && aff.userId === currentUserId)
      throw ApiException.unprocessable(
        'You cannot remove your own affiliation',
      );

    await this.prisma.organizationUserAffiliation.update({
      where: { id },
      data: { isDeleted: true, inviteToken: null, inviteExpiresAt: null },
    });
  }

  async updateStatus(
    orgId: number,
    id: number,
    dto: UpdateUserAffiliationStatusDto,
  ) {
    const aff = await this.prisma.organizationUserAffiliation.findUnique({
      where: { id, organizationId: orgId, isDeleted: false },
    });
    if (!aff) throw ApiException.notFound('Affiliation not found');
    return this.prisma.organizationUserAffiliation.update({
      where: { id },
      data: { status: dto.status },
      select: affiliationSelect,
    });
  }

  async findPendingInvitesForUser(userId: number): Promise<MyInviteDto[]> {
    const affiliations = await this.prisma.organizationUserAffiliation.findMany(
      {
        where: {
          userId,
          status: AffiliationStatus.PENDING,
          isDeleted: false,
          user: { is: { isDeleted: false, status: EntityStatus.ACTIVE } },
          organization: {
            is: { isDeleted: false, status: EntityStatus.ACTIVE },
          },
          OR: [
            { teamId: null },
            { team: { is: { isDeleted: false, status: EntityStatus.ACTIVE } } },
          ],
        },
        select: myInviteSelect,
        orderBy: { createdAt: 'desc' },
      },
    );

    return affiliations.map((affiliation) =>
      this.mapToMyInviteDto(affiliation),
    );
  }

  async respondToInviteForUser(
    userId: number,
    inviteId: number,
    decision: InviteDecision,
  ): Promise<MyInviteDto> {
    const affiliation = await this.prisma.organizationUserAffiliation.findFirst(
      {
        where: { id: inviteId, userId, isDeleted: false },
        select: inviteTransitionSelect,
      },
    );

    if (!affiliation) {
      throw ApiException.notFound('Invite not found');
    }

    await this.resolveInviteTransition(affiliation, decision, {
      allowExpiredReject: true,
    });

    const updated = await this.prisma.organizationUserAffiliation.findUnique({
      where: { id: affiliation.id },
      select: myInviteSelect,
    });

    if (!updated) {
      throw ApiException.notFound('Invite not found');
    }

    return this.mapToMyInviteDto(updated);
  }

  private async resolveInviteTransition(
    affiliation: InviteTransitionRecord,
    decision: InviteDecision,
    options: { allowExpiredReject: boolean },
  ): Promise<void> {
    if (affiliation.status !== AffiliationStatus.PENDING) {
      throw ApiException.unprocessable('Invite is no longer pending');
    }

    const isExpired =
      affiliation.inviteExpiresAt !== null &&
      affiliation.inviteExpiresAt.getTime() < Date.now();

    if (
      isExpired &&
      (decision === InviteDecision.ACCEPT || !options.allowExpiredReject)
    ) {
      throw ApiException.unprocessable('Invite has expired');
    }

    const data =
      decision === InviteDecision.ACCEPT
        ? {
            status: AffiliationStatus.ACTIVE,
            inviteToken: null,
            inviteExpiresAt: null,
          }
        : {
            isDeleted: true,
            inviteToken: null,
            inviteExpiresAt: null,
          };

    const result = await this.prisma.organizationUserAffiliation.updateMany({
      where: {
        id: affiliation.id,
        userId: affiliation.userId,
        status: AffiliationStatus.PENDING,
        isDeleted: false,
      },
      data,
    });

    if (result.count !== 1) {
      throw ApiException.unprocessable('Invite is no longer pending');
    }
  }

  private mapToMyInviteDto(affiliation: PendingInviteRecord): MyInviteDto {
    return {
      id: affiliation.id,
      organizationId: affiliation.organizationId,
      organizationName: affiliation.organization.name,
      role: affiliation.role,
      teamId: affiliation.teamId,
      teamName: affiliation.team?.name ?? null,
      jerseyNumber: affiliation.jerseyNumber,
      status: AffiliationStatus.PENDING,
      sentAt: affiliation.createdAt.toISOString(),
      expiresAt: affiliation.inviteExpiresAt?.toISOString() ?? null,
      isExpired:
        affiliation.inviteExpiresAt !== null &&
        affiliation.inviteExpiresAt.getTime() < Date.now(),
    };
  }
}
