import { Injectable } from '@nestjs/common';
import { Prisma, TournamentFormat, TournamentStatus } from '@prisma/client';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentGroupResponseDto } from './dto/tournament-group-response.dto';
import { TournamentGroupTeamResponseDto } from './dto/tournament-group-team-response.dto';

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
}
