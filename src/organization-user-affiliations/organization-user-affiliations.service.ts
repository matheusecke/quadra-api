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

type UserInviteLocator =
  | { inviteId: number; userId: number }
  | { tokenHash: string; userId: number };

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

  private async assertCanManage(
    client: Pick<Prisma.TransactionClient, 'organizationUserAffiliation'>,
    organizationId: number,
    target: { userId: number; teamId: number | null; role: OrgRole },
    actor: OrganizationActor,
  ): Promise<void> {
    if (actor.role === OrgRole.ORG_ADMIN) {
      if (target.userId === actor.userId && target.role === OrgRole.ORG_ADMIN) {
        throw ApiException.forbidden(
          'You cannot change your own organization administrator affiliation',
        );
      }
      return;
    }

    const own = await client.organizationUserAffiliation.findFirst({
      where: {
        organizationId,
        userId: actor.userId,
        role: OrgRole.TEAM_ADMIN,
        status: AffiliationStatus.ACTIVE,
        isDeleted: false,
        teamId: target.teamId,
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
      select: { id: true },
    });
    if (
      !own ||
      target.teamId === null ||
      (target.role !== OrgRole.ATHLETE &&
        target.role !== OrgRole.COACHING_STAFF)
    ) {
      throw ApiException.forbidden(
        'You can only manage users from your own team',
      );
    }
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
    return this.transitionUserInvite(
      { tokenHash: AffiliationToken.hash(dto.token), userId: currentUserId },
      dto.decision,
    );
  }

  async updateMember(
    organizationId: number,
    affiliationId: number,
    dto: UpdateUserAffiliationDto,
    actorUserId: number,
  ): Promise<UserAffiliationResponseDto> {
    if (dto.jerseyNumber === undefined && dto.position === undefined) {
      throw ApiException.badRequest('At least one editable field is required');
    }
    const target = await this.prisma.organizationUserAffiliation.findFirst({
      where: {
        id: affiliationId,
        organizationId,
        status: AffiliationStatus.ACTIVE,
        isDeleted: false,
      },
      select: {
        id: true,
        userId: true,
        teamId: true,
        role: true,
        jerseyNumber: true,
        position: true,
      },
    });
    if (!target) throw ApiException.notFound('Affiliation not found');
    await this.assertCanManage(this.prisma, organizationId, target, {
      userId: actorUserId,
      role: OrgRole.TEAM_ADMIN,
    });

    const jerseyNumber =
      dto.jerseyNumber === undefined ? target.jerseyNumber : dto.jerseyNumber;
    const position =
      dto.position === undefined ? target.position : dto.position;
    if (
      target.role === OrgRole.ATHLETE &&
      (jerseyNumber === null || position === null)
    ) {
      throw ApiException.badRequest(
        'Athlete jerseyNumber and position are required',
      );
    }
    return this.prisma.organizationUserAffiliation.update({
      where: { id: affiliationId },
      data: {
        ...(dto.jerseyNumber !== undefined
          ? { jerseyNumber: dto.jerseyNumber }
          : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
      },
      select: affiliationSelect,
    });
  }

  async resend(
    organizationId: number,
    affiliationId: number,
    actor: OrganizationActor,
  ): Promise<PendingUserInviteBundle> {
    const target = await this.prisma.organizationUserAffiliation.findFirst({
      where: { id: affiliationId, organizationId, isDeleted: false },
      select: {
        id: true,
        userId: true,
        teamId: true,
        role: true,
        status: true,
      },
    });
    if (!target) throw ApiException.notFound('Affiliation not found');
    if (target.status !== AffiliationStatus.PENDING) {
      throw ApiException.unprocessable('Affiliation must be PENDING to resend');
    }
    await this.assertCanManage(this.prisma, organizationId, target, actor);

    const { raw, hash, expiresAt } = AffiliationToken.generate();
    const rotated = await this.prisma.organizationUserAffiliation.updateMany({
      where: {
        id: target.id,
        userId: target.userId,
        status: AffiliationStatus.PENDING,
        isDeleted: false,
      },
      data: { inviteToken: hash, inviteExpiresAt: expiresAt },
    });
    if (rotated.count !== 1) {
      throw ApiException.unprocessable('Invite is no longer pending');
    }
    const affiliation =
      await this.prisma.organizationUserAffiliation.findUnique({
        where: { id: target.id },
        select: affiliationSelect,
      });
    if (!affiliation) throw ApiException.notFound('Affiliation not found');
    return { affiliation, inviteToken: raw, inviteExpiresAt: expiresAt };
  }

  async remove(
    organizationId: number,
    affiliationId: number,
    actor: OrganizationActor,
  ): Promise<void> {
    await this.runSerializable(async (tx) => {
      const target = await tx.organizationUserAffiliation.findFirst({
        where: { id: affiliationId, organizationId, isDeleted: false },
        select: {
          id: true,
          userId: true,
          teamId: true,
          role: true,
          status: true,
        },
      });
      if (!target) throw ApiException.notFound('Affiliation not found');
      if (target.status !== AffiliationStatus.PENDING) {
        throw ApiException.unprocessable(
          'Affiliation must be PENDING to cancel',
        );
      }
      await this.assertCanManage(tx, organizationId, target, actor);

      const removed = await tx.organizationUserAffiliation.updateMany({
        where: {
          id: target.id,
          userId: target.userId,
          status: AffiliationStatus.PENDING,
          isDeleted: false,
        },
        data: { isDeleted: true, inviteToken: null, inviteExpiresAt: null },
      });
      if (removed.count !== 1) {
        throw ApiException.unprocessable('Invite is no longer pending');
      }

      if (target.role === OrgRole.TEAM_ADMIN && target.teamId !== null) {
        await this.closePendingTeamAfterLastAdmin(
          tx,
          organizationId,
          target.teamId,
        );
      }
    });
  }

  async deactivate(
    organizationId: number,
    affiliationId: number,
    actor: OrganizationActor,
  ): Promise<UserAffiliationResponseDto> {
    const target = await this.prisma.organizationUserAffiliation.findFirst({
      where: { id: affiliationId, organizationId, isDeleted: false },
      select: {
        id: true,
        userId: true,
        teamId: true,
        role: true,
        status: true,
      },
    });
    if (!target) throw ApiException.notFound('Affiliation not found');
    await this.assertCanManage(this.prisma, organizationId, target, actor);
    if (target.status !== AffiliationStatus.ACTIVE) {
      throw ApiException.unprocessable(
        'Affiliation must be ACTIVE to deactivate',
      );
    }
    return this.prisma.organizationUserAffiliation.update({
      where: { id: target.id },
      data: { status: AffiliationStatus.INACTIVE },
      select: affiliationSelect,
    });
  }

  async activate(
    organizationId: number,
    affiliationId: number,
    actor: OrganizationActor,
  ): Promise<UserAffiliationResponseDto> {
    return this.runSerializable(async (tx) => {
      const target = await tx.organizationUserAffiliation.findFirst({
        where: { id: affiliationId, organizationId, isDeleted: false },
        select: {
          id: true,
          userId: true,
          teamId: true,
          role: true,
          status: true,
        },
      });
      if (!target) throw ApiException.notFound('Affiliation not found');
      await this.assertCanManage(tx, organizationId, target, actor);
      if (target.status !== AffiliationStatus.INACTIVE) {
        throw ApiException.unprocessable(
          'Affiliation must be INACTIVE to activate',
        );
      }

      if (target.teamId !== null) {
        const teamAffiliation = await tx.organizationTeamAffiliation.findFirst({
          where: {
            organizationId,
            teamId: target.teamId,
            status: AffiliationStatus.ACTIVE,
            isDeleted: false,
            team: { is: { status: EntityStatus.ACTIVE, isDeleted: false } },
          },
          select: { id: true },
        });
        if (!teamAffiliation) {
          throw ApiException.unprocessable(
            'Team affiliation is inactive; activate it before activating users',
          );
        }
      }

      const conflict = await tx.organizationUserAffiliation.findFirst({
        where: {
          userId: target.userId,
          organizationId,
          id: { not: target.id },
          status: AffiliationStatus.ACTIVE,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (conflict) {
        throw ApiException.conflict('User already has an active affiliation');
      }
      return tx.organizationUserAffiliation.update({
        where: { id: target.id },
        data: { status: AffiliationStatus.ACTIVE },
        select: affiliationSelect,
      });
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
    await this.transitionUserInvite({ inviteId, userId }, decision);
  }

  private async transitionUserInvite(
    locator: UserInviteLocator,
    decision: InviteDecision,
  ): Promise<UserAffiliationResponseDto> {
    return this.runSerializable(async (tx) => {
      const affiliation = await tx.organizationUserAffiliation.findFirst({
        where: {
          ...('inviteId' in locator
            ? { id: locator.inviteId, userId: locator.userId }
            : { inviteToken: locator.tokenHash }),
          isDeleted: false,
          user: { is: { isDeleted: false, status: EntityStatus.ACTIVE } },
          organization: {
            is: { isDeleted: false, status: EntityStatus.ACTIVE },
          },
        },
        select: inviteTransitionSelect,
      });
      if (!affiliation) throw ApiException.notFound('Invite not found');
      if ('tokenHash' in locator && affiliation.userId !== locator.userId) {
        throw ApiException.forbidden(
          'You can only respond to your own invites',
        );
      }
      if (affiliation.status !== AffiliationStatus.PENDING) {
        throw ApiException.unprocessable('Invite is no longer pending');
      }

      const isExpired =
        affiliation.inviteExpiresAt !== null &&
        affiliation.inviteExpiresAt.getTime() < Date.now();
      if (decision === InviteDecision.ACCEPT && isExpired) {
        throw ApiException.unprocessable('Invite has expired');
      }

      if (decision === InviteDecision.ACCEPT && affiliation.teamId !== null) {
        const team = await tx.team.findFirst({
          where: {
            id: affiliation.teamId,
            status: EntityStatus.ACTIVE,
            isDeleted: false,
          },
          select: { id: true },
        });
        const teamAffiliation = team
          ? await tx.organizationTeamAffiliation.findFirst({
              where: {
                organizationId: affiliation.organizationId,
                teamId: affiliation.teamId,
                isDeleted: false,
              },
              select: { id: true, status: true },
            })
          : null;
        if (
          !teamAffiliation ||
          (affiliation.role === OrgRole.TEAM_ADMIN
            ? teamAffiliation.status !== AffiliationStatus.PENDING &&
              teamAffiliation.status !== AffiliationStatus.ACTIVE
            : teamAffiliation.status !== AffiliationStatus.ACTIVE)
        ) {
          throw ApiException.unprocessable(
            'Team affiliation is inactive; activate it before inviting users',
          );
        }
        if (
          affiliation.role === OrgRole.TEAM_ADMIN &&
          teamAffiliation.status === AffiliationStatus.PENDING
        ) {
          await tx.organizationTeamAffiliation.update({
            where: { id: teamAffiliation.id },
            data: {
              status: AffiliationStatus.ACTIVE,
              inviteToken: null,
              inviteExpiresAt: null,
            },
          });
        }
      }

      const result = await tx.organizationUserAffiliation.updateMany({
        where: {
          id: affiliation.id,
          userId: locator.userId,
          status: AffiliationStatus.PENDING,
          isDeleted: false,
        },
        data:
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
              },
      });
      if (result.count !== 1) {
        throw ApiException.unprocessable('Invite is no longer pending');
      }

      if (
        decision === InviteDecision.REJECT &&
        affiliation.role === OrgRole.TEAM_ADMIN &&
        affiliation.teamId !== null
      ) {
        await this.closePendingTeamAfterLastAdmin(
          tx,
          affiliation.organizationId,
          affiliation.teamId,
        );
      }

      const updated = await tx.organizationUserAffiliation.findUnique({
        where: { id: affiliation.id },
        select: affiliationSelect,
      });
      if (!updated) throw ApiException.notFound('Invite not found');
      return updated;
    });
  }

  private async closePendingTeamAfterLastAdmin(
    tx: Prisma.TransactionClient,
    organizationId: number,
    teamId: number,
  ): Promise<void> {
    const teamAffiliation = await tx.organizationTeamAffiliation.findFirst({
      where: {
        organizationId,
        teamId,
        status: AffiliationStatus.PENDING,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!teamAffiliation) return;

    const remainingAdmin = await tx.organizationUserAffiliation.findFirst({
      where: {
        organizationId,
        teamId,
        role: OrgRole.TEAM_ADMIN,
        status: AffiliationStatus.PENDING,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (remainingAdmin) return;

    await tx.organizationTeamAffiliation.update({
      where: { id: teamAffiliation.id },
      data: { isDeleted: true, inviteToken: null, inviteExpiresAt: null },
    });
    const otherHistoryCount = await tx.organizationTeamAffiliation.count({
      where: { teamId, id: { not: teamAffiliation.id } },
    });
    if (otherHistoryCount === 0) {
      await tx.team.update({
        where: { id: teamId },
        data: { isDeleted: true, status: EntityStatus.INACTIVE },
      });
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
