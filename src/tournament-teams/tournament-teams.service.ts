import { Injectable } from '@nestjs/common';
import {
  AffiliationStatus,
  EntityStatus,
  Prisma,
  TournamentStatus,
  TournamentTeamStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateTournamentTeamDto } from './dto/create-tournament-team.dto';
import { ListTournamentTeamsQueryDto } from './dto/list-tournament-teams-query.dto';
import { TournamentTeamResponseDto } from './dto/tournament-team-response.dto';

export const tournamentTeamSelect = {
  id: true,
  tournamentId: true,
  teamId: true,
  status: true,
  seed: true,
  tiebreakOrder: true,
  tiebreakBlockKey: true,
  displayNameSnapshot: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TournamentTeamSelect;

@Injectable()
export class TournamentTeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: number,
    tournamentId: number,
    query: ListTournamentTeamsQueryDto,
  ): Promise<{ count: number; data: TournamentTeamResponseDto[] }> {
    await this.findTournamentOrThrow(organizationId, tournamentId);

    const filters: Prisma.TournamentTeamWhereInput[] = [
      { tournamentId, isDeleted: false },
    ];

    if (query.status) filters.push({ status: query.status });
    if (query.q) {
      filters.push({
        displayNameSnapshot: { contains: query.q, mode: 'insensitive' },
      });
    }
    if (query.ids) filters.push({ id: { in: query.ids } });

    const where: Prisma.TournamentTeamWhereInput = { AND: filters };
    const skip = (query.page - 1) * query.limit;

    const [count, data] = await Promise.all([
      this.prisma.tournamentTeam.count({ where }),
      this.prisma.tournamentTeam.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ displayNameSnapshot: 'asc' }, { id: 'asc' }],
        select: tournamentTeamSelect,
      }),
    ]);

    return { count, data };
  }

  async create(
    organizationId: number,
    tournamentId: number,
    dto: CreateTournamentTeamDto,
  ): Promise<TournamentTeamResponseDto> {
    const tournament = await this.findTournamentOrThrow(
      organizationId,
      tournamentId,
    );
    this.assertMutable(tournament.status);

    const team = await this.prisma.team.findFirst({
      where: { id: dto.teamId, status: EntityStatus.ACTIVE, isDeleted: false },
      select: { id: true, name: true },
    });
    if (!team) {
      throw ApiException.unprocessable(
        'The team is not active.',
        'INVALID_TEAM',
      );
    }

    const affiliation = await this.prisma.organizationTeamAffiliation.findFirst({
      where: {
        organizationId,
        teamId: dto.teamId,
        status: AffiliationStatus.ACTIVE,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!affiliation) {
      throw ApiException.unprocessable(
        'The team is not actively affiliated with this organization.',
        'INVALID_TEAM',
      );
    }

    const existing = await this.prisma.tournamentTeam.findFirst({
      where: { tournamentId, teamId: dto.teamId, isDeleted: false },
      select: { id: true, status: true },
    });

    if (existing) {
      if (existing.status === TournamentTeamStatus.ACTIVE) {
        throw ApiException.conflict(
          'This team is already active in the tournament.',
          'DUPLICATE_RECORD',
        );
      }

      return this.prisma.tournamentTeam.update({
        where: { id: existing.id },
        data: {
          organizationTeamAffiliationId: affiliation.id,
          status: TournamentTeamStatus.ACTIVE,
        },
        select: tournamentTeamSelect,
      });
    }

    return this.prisma.tournamentTeam.create({
      data: {
        organizationId,
        tournamentId,
        teamId: dto.teamId,
        organizationTeamAffiliationId: affiliation.id,
        displayNameSnapshot: team.name,
      },
      select: tournamentTeamSelect,
    });
  }

  private async findTournamentOrThrow(
    organizationId: number,
    tournamentId: number,
  ): Promise<{ id: number; status: TournamentStatus }> {
    const tournament = await this.prisma.tournament.findFirst({
      where: { id: tournamentId, organizationId, isDeleted: false },
      select: { id: true, status: true },
    });
    if (!tournament) throw ApiException.notFound('Tournament not found');
    return tournament;
  }

  private assertMutable(status: TournamentStatus): void {
    if (
      status === TournamentStatus.COMPLETED ||
      status === TournamentStatus.CANCELLED
    ) {
      throw ApiException.conflict(
        'The tournament no longer accepts registration changes.',
        'TOURNAMENT_NOT_MUTABLE',
      );
    }
  }
}
