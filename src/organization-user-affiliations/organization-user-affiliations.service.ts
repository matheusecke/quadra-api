import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AffiliationToken } from '../common/utils/affiliation-token.util';
import { ApiException } from '../common/exceptions/api.exception';
import {
  AffiliationStatus,
  BasketballPosition,
  EntityStatus,
  OrgRole,
  Prisma,
} from '@prisma/client';
import { CreateTeamMemberAffiliationDto } from './dto/create-team-member-affiliation.dto';
import {
  UserInviteResponseDto,
  InviteDecision,
} from './dto/user-invite-response.dto';
import { UpdateUserAffiliationDto } from './dto/update-user-affiliation.dto';
import { UpdateUserAffiliationStatusDto } from './dto/update-user-affiliation-status.dto';
import { ListUserAffiliationsQueryDto } from './dto/list-user-affiliations-query.dto';
import type { UserAffiliationResponseDto } from './dto/user-affiliation-response.dto';
import type { UserAffiliationListItemDto } from './dto/user-affiliation-list-item.dto';
import type { MyInviteDto } from '../auth/dto/my-invite.dto';

const affiliationSelect = {
  id: true,
  userId: true,
  organizationId: true,
  role: true,
  teamId: true,
  jerseyNumber: true,
  position: true,
  status: true,
  inviteExpiresAt: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true } },
  team: { select: { id: true, name: true } },
};

export type OrganizationActor = {
  userId: number;
  role: OrgRole;
};

export type PendingUserInviteInput = {
  organizationId: number;
  userId: number;
  role: OrgRole;
  teamId: number | null;
  jerseyNumber: number | null;
  position: BasketballPosition | null;
  createdByUserId: number;
};

export type PendingUserInviteBundle = {
  affiliation: UserAffiliationResponseDto;
  inviteToken: string;
  inviteExpiresAt: Date;
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

  async createPendingInvite(
    tx: Prisma.TransactionClient,
    input: PendingUserInviteInput,
  ): Promise<PendingUserInviteBundle> {
    const user = await tx.user.findFirst({
      where: {
        id: input.userId,
        isDeleted: false,
        status: EntityStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!user) throw ApiException.notFound('User not found');

    const existing = await tx.organizationUserAffiliation.findMany({
      where: {
        userId: input.userId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      select: { id: true, status: true },
    });
    if (existing.some((row) => row.status === AffiliationStatus.ACTIVE)) {
      throw ApiException.conflict('User already has an active affiliation');
    }
    if (existing.some((row) => row.status === AffiliationStatus.PENDING)) {
      throw ApiException.conflict('User already has a pending invite');
    }

    const inactiveIds = existing
      .filter((row) => row.status === AffiliationStatus.INACTIVE)
      .map((row) => row.id);
    if (inactiveIds.length > 0) {
      await tx.organizationUserAffiliation.updateMany({
        where: {
          id: { in: inactiveIds },
          status: AffiliationStatus.INACTIVE,
          isDeleted: false,
        },
        data: { isDeleted: true },
      });
    }

    const { raw, hash, expiresAt } = AffiliationToken.generate();
    const affiliation = await tx.organizationUserAffiliation.create({
      data: {
        ...input,
        status: AffiliationStatus.PENDING,
        inviteToken: hash,
        inviteExpiresAt: expiresAt,
      },
      select: affiliationSelect,
    });
    return { affiliation, inviteToken: raw, inviteExpiresAt: expiresAt };
  }

  async createOrganizationAdmin(
    organizationId: number,
    userId: number,
    actorUserId: number,
  ): Promise<PendingUserInviteBundle> {
    try {
      return await this.runSerializable((tx) =>
        this.createPendingInvite(tx, {
          organizationId,
          userId,
          role: OrgRole.ORG_ADMIN,
          teamId: null,
          jerseyNumber: null,
          position: null,
          createdByUserId: actorUserId,
        }),
      );
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw ApiException.conflict(
          'User affiliation changed during invitation',
        );
      }
      throw error;
    }
  }

  async createTeamMember(
    organizationId: number,
    routeTeamId: number,
    dto: CreateTeamMemberAffiliationDto,
    actorUserId: number,
  ): Promise<PendingUserInviteBundle> {
    if (
      dto.role === OrgRole.ATHLETE &&
      (dto.jerseyNumber === undefined ||
        dto.jerseyNumber === null ||
        dto.position === undefined ||
        dto.position === null)
    ) {
      throw ApiException.badRequest(
        'Athlete jerseyNumber and position are required',
      );
    }

    try {
      return await this.runSerializable(async (tx) => {
        const actor = await tx.organizationUserAffiliation.findFirst({
          where: {
            organizationId,
            userId: actorUserId,
            teamId: routeTeamId,
            role: OrgRole.TEAM_ADMIN,
            status: AffiliationStatus.ACTIVE,
            isDeleted: false,
          },
          select: { id: true },
        });
        if (!actor) {
          throw ApiException.forbidden(
            'You can only manage users from your own team',
          );
        }

        const teamAffiliation = await tx.organizationTeamAffiliation.findFirst({
          where: {
            organizationId,
            teamId: routeTeamId,
            status: AffiliationStatus.ACTIVE,
            isDeleted: false,
            team: { is: { status: EntityStatus.ACTIVE, isDeleted: false } },
          },
          select: { id: true },
        });
        if (!teamAffiliation) {
          throw ApiException.unprocessable(
            'Team affiliation is inactive; activate it before inviting users',
          );
        }

        return this.createPendingInvite(tx, {
          organizationId,
          userId: dto.userId,
          role: dto.role,
          teamId: routeTeamId,
          jerseyNumber: dto.jerseyNumber ?? null,
          position: dto.position ?? null,
          createdByUserId: actorUserId,
        });
      });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw ApiException.conflict(
          'User affiliation changed during invitation',
        );
      }
      throw error;
    }
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

  async findAll(
    organizationId: number,
    query: ListUserAffiliationsQueryDto,
    actor: OrganizationActor,
  ): Promise<{ count: number; data: UserAffiliationListItemDto[] }> {
    const { page, limit, status, role, q, inviteExpired } = query;
    let effectiveTeamId = query.teamId;

    if (actor.role === OrgRole.TEAM_ADMIN) {
      const ownAffiliation =
        await this.prisma.organizationUserAffiliation.findFirst({
          where: {
            organizationId,
            userId: actor.userId,
            role: OrgRole.TEAM_ADMIN,
            status: AffiliationStatus.ACTIVE,
            isDeleted: false,
            teamId: { not: null },
            team: {
              is: {
                status: EntityStatus.ACTIVE,
                isDeleted: false,
                organizationAffiliations: {
                  some: {
                    organizationId,
                    status: AffiliationStatus.ACTIVE,
                    isDeleted: false,
                  },
                },
              },
            },
          },
          select: { teamId: true },
        });
      if (!ownAffiliation || ownAffiliation.teamId === null) {
        throw ApiException.forbidden(
          'You can only manage users from your own team',
        );
      }
      effectiveTeamId = ownAffiliation.teamId;
    }

    const where: Prisma.OrganizationUserAffiliationWhereInput = {
      organizationId,
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
      ...(effectiveTeamId !== undefined ? { teamId: effectiveTeamId } : {}),
      ...(q
        ? {
            user: {
              is: {
                OR: [
                  {
                    name: {
                      contains: q,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                  {
                    email: {
                      contains: q,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                ],
              },
            },
          }
        : {}),
    };
    const [count, data] = await Promise.all([
      this.prisma.organizationUserAffiliation.count({ where }),
      this.prisma.organizationUserAffiliation.findMany({
        where,
        select: affiliationSelect,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const now = Date.now();
    return {
      count,
      data: data.map((row) => ({
        ...row,
        isInviteExpired:
          row.status === AffiliationStatus.PENDING &&
          row.inviteExpiresAt !== null &&
          row.inviteExpiresAt.getTime() < now,
        canManage:
          actor.role === OrgRole.ORG_ADMIN
            ? row.userId !== actor.userId
            : row.teamId === effectiveTeamId &&
              (row.role === OrgRole.ATHLETE ||
                row.role === OrgRole.COACHING_STAFF),
      })),
    };
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
  ): Promise<void> {
    const affiliation = await this.prisma.organizationUserAffiliation.findFirst(
      {
        where: {
          id: inviteId,
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
        select: inviteTransitionSelect,
      },
    );

    if (!affiliation) {
      throw ApiException.notFound('Invite not found');
    }

    await this.resolveInviteTransition(affiliation, decision, {
      allowExpiredReject: true,
    });
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
