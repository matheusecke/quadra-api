import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TournamentFormat,
  TournamentStatus,
  TournamentTeamStatus,
} from '@prisma/client';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentGroupDto } from './dto/create-tournament-group.dto';
import { CreateTournamentGroupTeamDto } from './dto/create-tournament-group-team.dto';
import { TournamentGroupResponseDto } from './dto/tournament-group-response.dto';
import { TournamentGroupTeamResponseDto } from './dto/tournament-group-team-response.dto';
import { UpdateTournamentGroupDto } from './dto/update-tournament-group.dto';

export const tournamentGroupSelect = {
  id: true,
  tournamentId: true,
  name: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TournamentGroupSelect;

export const tournamentGroupTeamSelect = {
  id: true,
  tournamentId: true,
  tournamentGroupId: true,
  tournamentTeamId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TournamentGroupTeamSelect;

const tournamentGroupTargetSelect = {
  ...tournamentGroupSelect,
  tournament: { select: { status: true, format: true } },
} satisfies Prisma.TournamentGroupSelect;

type TournamentGroupTarget = Prisma.TournamentGroupGetPayload<{
  select: typeof tournamentGroupTargetSelect;
}>;

const tournamentGroupTeamTargetSelect = {
  ...tournamentGroupTeamSelect,
  tournament: { select: { status: true, format: true } },
} satisfies Prisma.TournamentGroupTeamSelect;

type TournamentGroupTeamTarget = Prisma.TournamentGroupTeamGetPayload<{
  select: typeof tournamentGroupTeamTargetSelect;
}>;

@Injectable()
export class TournamentGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async findGroups(
    organizationId: number,
    tournamentId: number,
  ): Promise<TournamentGroupResponseDto[]> {
    await this.findTournamentOrThrow(organizationId, tournamentId);
    return this.prisma.tournamentGroup.findMany({
      where: { tournamentId, organizationId, isDeleted: false },
      orderBy: [
        { sortOrder: { sort: 'asc', nulls: 'last' } },
        { name: 'asc' },
        { id: 'asc' },
      ],
      select: tournamentGroupSelect,
    });
  }

  async findGroupTeams(
    organizationId: number,
    tournamentId: number,
  ): Promise<TournamentGroupTeamResponseDto[]> {
    await this.findTournamentOrThrow(organizationId, tournamentId);
    return this.prisma.tournamentGroupTeam.findMany({
      where: { tournamentId, organizationId, isDeleted: false },
      orderBy: [
        { tournamentGroupId: 'asc' },
        { tournamentTeamId: 'asc' },
        { id: 'asc' },
      ],
      select: tournamentGroupTeamSelect,
    });
  }

  async assignTeam(
    organizationId: number,
    dto: CreateTournamentGroupTeamDto,
  ): Promise<TournamentGroupTeamResponseDto> {
    const group = await this.findGroupOrThrow(
      organizationId,
      dto.tournamentGroupId,
    );
    this.assertMutable(group.tournament.status);
    this.assertGroupFormat(group.tournament.format);

    const registration = await this.prisma.tournamentTeam.findFirst({
      where: {
        id: dto.tournamentTeamId,
        organizationId,
        isDeleted: false,
      },
      select: { id: true, tournamentId: true, status: true },
    });
    if (!registration) {
      throw ApiException.notFound('Tournament team not found');
    }
    if (registration.status !== TournamentTeamStatus.ACTIVE) {
      throw ApiException.unprocessable(
        'The tournament team registration is not active.',
        'INACTIVE_REGISTRATION',
      );
    }
    if (registration.tournamentId !== group.tournamentId) {
      throw ApiException.unprocessable(
        'The group and tournament team must belong to the same tournament.',
        'INVALID_GROUP_ASSIGNMENT',
      );
    }

    const duplicate = await this.prisma.tournamentGroupTeam.findFirst({
      where: {
        tournamentId: group.tournamentId,
        tournamentTeamId: registration.id,
        organizationId,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw ApiException.conflict(
        'Team already assigned to a group in this tournament.',
        'TEAM_ALREADY_ASSIGNED',
      );
    }

    return this.prisma.tournamentGroupTeam.create({
      data: {
        organizationId,
        tournamentId: group.tournamentId,
        tournamentGroupId: group.id,
        tournamentTeamId: registration.id,
      },
      select: tournamentGroupTeamSelect,
    });
  }

  async removeTeam(organizationId: number, id: number): Promise<void> {
    const membership = await this.findMembershipOrThrow(organizationId, id);
    this.assertMutable(membership.tournament.status);
    this.assertGroupFormat(membership.tournament.format);
    await this.prisma.tournamentGroupTeam.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async createGroup(
    organizationId: number,
    tournamentId: number,
    dto: CreateTournamentGroupDto,
  ): Promise<TournamentGroupResponseDto> {
    const tournament = await this.findTournamentOrThrow(
      organizationId,
      tournamentId,
    );
    this.assertMutable(tournament.status);
    this.assertGroupFormat(tournament.format);

    const duplicate = await this.prisma.tournamentGroup.findFirst({
      where: {
        tournamentId,
        organizationId,
        name: dto.name,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw ApiException.conflict(
        'A group with this name already exists in the tournament.',
        'DUPLICATE_RECORD',
      );
    }

    const order = await this.prisma.tournamentGroup.aggregate({
      where: { tournamentId, organizationId, isDeleted: false },
      _max: { sortOrder: true },
    });
    return this.prisma.tournamentGroup.create({
      data: {
        organizationId,
        tournamentId,
        name: dto.name,
        sortOrder: (order._max.sortOrder ?? 0) + 1,
      },
      select: tournamentGroupSelect,
    });
  }

  async updateGroup(
    organizationId: number,
    id: number,
    dto: UpdateTournamentGroupDto,
  ): Promise<TournamentGroupResponseDto> {
    const group = await this.findGroupOrThrow(organizationId, id);
    this.assertMutable(group.tournament.status);
    this.assertGroupFormat(group.tournament.format);

    const { tournament, ...current } = group;
    void tournament;
    if (dto.name === undefined) return current;

    const duplicate = await this.prisma.tournamentGroup.findFirst({
      where: {
        tournamentId: group.tournamentId,
        organizationId,
        name: dto.name,
        id: { not: id },
        isDeleted: false,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw ApiException.conflict(
        'A group with this name already exists in the tournament.',
        'DUPLICATE_RECORD',
      );
    }

    return this.prisma.tournamentGroup.update({
      where: { id },
      data: { name: dto.name },
      select: tournamentGroupSelect,
    });
  }

  async removeGroup(organizationId: number, id: number): Promise<void> {
    const group = await this.findGroupOrThrow(organizationId, id);
    this.assertMutable(group.tournament.status);
    this.assertGroupFormat(group.tournament.format);

    const membership = await this.prisma.tournamentGroupTeam.findFirst({
      where: { tournamentGroupId: id, organizationId, isDeleted: false },
      select: { id: true },
    });
    if (membership) {
      throw ApiException.conflict(
        'The group must be empty before it can be deleted.',
        'GROUP_NOT_EMPTY',
      );
    }

    await this.prisma.tournamentGroup.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  private async findTournamentOrThrow(
    organizationId: number,
    tournamentId: number,
  ): Promise<{
    id: number;
    status: TournamentStatus;
    format: TournamentFormat;
  }> {
    const tournament = await this.prisma.tournament.findFirst({
      where: { id: tournamentId, organizationId, isDeleted: false },
      select: { id: true, status: true, format: true },
    });
    if (!tournament) throw ApiException.notFound('Tournament not found');
    return tournament;
  }

  private async findGroupOrThrow(
    organizationId: number,
    id: number,
  ): Promise<TournamentGroupTarget> {
    const group = await this.prisma.tournamentGroup.findFirst({
      where: {
        id,
        organizationId,
        isDeleted: false,
        tournament: { organizationId, isDeleted: false },
      },
      select: tournamentGroupTargetSelect,
    });
    if (!group) throw ApiException.notFound('Tournament group not found');
    return group;
  }

  private async findMembershipOrThrow(
    organizationId: number,
    id: number,
  ): Promise<TournamentGroupTeamTarget> {
    const membership = await this.prisma.tournamentGroupTeam.findFirst({
      where: {
        id,
        organizationId,
        isDeleted: false,
        tournament: { organizationId, isDeleted: false },
      },
      select: tournamentGroupTeamTargetSelect,
    });
    if (!membership) {
      throw ApiException.notFound('Tournament group membership not found');
    }
    return membership;
  }

  private assertMutable(status: TournamentStatus): void {
    if (
      status === TournamentStatus.COMPLETED ||
      status === TournamentStatus.CANCELLED
    ) {
      throw ApiException.conflict(
        'The tournament structure can no longer be changed.',
        'TOURNAMENT_NOT_MUTABLE',
      );
    }
  }

  private assertGroupFormat(format: TournamentFormat): void {
    if (
      format !== TournamentFormat.GROUP_STAGE &&
      format !== TournamentFormat.GROUP_STAGE_KNOCKOUT
    ) {
      throw ApiException.unprocessable(
        'This tournament format does not have a group stage.',
        'INVALID_TOURNAMENT_FORMAT',
      );
    }
  }
}
