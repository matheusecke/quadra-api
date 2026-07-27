import { Injectable } from '@nestjs/common';
import {
  MatchStatus,
  Prisma,
  TournamentFormat,
  TournamentStatus,
} from '@prisma/client';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { SetTiebreaksDto } from './dto/set-tiebreaks.dto';
import {
  StandingsState,
  StandingsTableResponseDto,
} from './dto/standings-response.dto';
import { RankingMatch, RankingTeam, rankTable } from './standings-ranking';

const PENDING_STATUSES: MatchStatus[] = [
  MatchStatus.SCHEDULED,
  MatchStatus.LIVE,
  MatchStatus.POSTPONED,
];

export const standingsTeamSelect = {
  id: true,
  teamId: true,
  displayNameSnapshot: true,
  tiebreakOrder: true,
  tiebreakBlockKey: true,
} satisfies Prisma.TournamentTeamSelect;

export const standingsMatchSelect = {
  id: true,
  status: true,
  tournamentGroupId: true,
  teams: {
    where: { isDeleted: false },
    select: {
      tournamentTeamId: true,
      finalScore: true,
      result: true,
      lossType: true,
    },
  },
} satisfies Prisma.MatchSelect;

type StandingsMatch = Prisma.MatchGetPayload<{
  select: typeof standingsMatchSelect;
}>;

type StandingsScope = {
  group: { id: number; name: string } | null;
  teamIds: Set<number>;
};

@Injectable()
export class StandingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findStandings(
    organizationId: number,
    tournamentId: number,
    groupId?: number,
  ): Promise<StandingsTableResponseDto[]> {
    const tournament = await this.findTournamentOrThrow(
      organizationId,
      tournamentId,
    );
    if (tournament.format === TournamentFormat.KNOCKOUT) return [];

    const registrations = await this.prisma.tournamentTeam.findMany({
      where: { tournamentId, organizationId, isDeleted: false },
      select: standingsTeamSelect,
    });
    const teams: RankingTeam[] = registrations.map((registration) => ({
      tournamentTeamId: registration.id,
      teamId: registration.teamId,
      teamName: registration.displayNameSnapshot,
      tiebreakOrder: registration.tiebreakOrder,
      tiebreakBlockKey: registration.tiebreakBlockKey,
    }));

    const matches = await this.prisma.match.findMany({
      where: {
        tournamentId,
        organizationId,
        isDeleted: false,
        status: { in: [...PENDING_STATUSES, MatchStatus.FINISHED] },
      },
      select: standingsMatchSelect,
    });

    const scopes = await this.resolveScopes(
      organizationId,
      tournamentId,
      tournament.format,
      teams,
      groupId,
    );
    return scopes.map((scope) => this.buildTable(scope, teams, matches));
  }

  async setTiebreaks(
    organizationId: number,
    tournamentId: number,
    dto: SetTiebreaksDto,
  ): Promise<StandingsTableResponseDto[]> {
    const tournament = await this.findTournamentOrThrow(
      organizationId,
      tournamentId,
    );
    this.assertMutable(tournament.status);

    const blockKey = dto.entries
      .map((entry) => entry.tournamentTeamId)
      .sort((left, right) => left - right)
      .join('-');
    const tables = await this.findStandings(organizationId, tournamentId);
    this.assertCurrentBlock(tables, blockKey);

    const orders = dto.entries
      .map((entry) => entry.order)
      .sort((left, right) => left - right);
    if (orders.some((order, index) => order !== index + 1)) {
      throw ApiException.unprocessable(
        'The tiebreak order must be a complete permutation of 1..n.',
        'INVALID_TIEBREAK_ORDER',
      );
    }

    // The block check already proved every id is a registration of this
    // tournament in this organization, so `where: { id }` cannot cross a tenant.
    await this.prisma.$transaction(async (tx) => {
      for (const entry of dto.entries) {
        await tx.tournamentTeam.update({
          where: { id: entry.tournamentTeamId },
          data: { tiebreakOrder: entry.order, tiebreakBlockKey: blockKey },
        });
      }
    });

    return this.findStandings(organizationId, tournamentId);
  }

  async clearTiebreaks(
    organizationId: number,
    tournamentId: number,
    blockKey: string,
  ): Promise<void> {
    const tournament = await this.findTournamentOrThrow(
      organizationId,
      tournamentId,
    );
    this.assertMutable(tournament.status);

    const tables = await this.findStandings(organizationId, tournamentId);
    this.assertCurrentBlock(tables, blockKey);

    // Keys from older blocks stay written but inert; they are addressed by
    // their own key, never by this one.
    await this.prisma.tournamentTeam.updateMany({
      where: {
        tournamentId,
        organizationId,
        isDeleted: false,
        tiebreakBlockKey: blockKey,
      },
      data: { tiebreakOrder: null, tiebreakBlockKey: null },
    });
  }

  private async resolveScopes(
    organizationId: number,
    tournamentId: number,
    format: TournamentFormat,
    teams: readonly RankingTeam[],
    groupId?: number,
  ): Promise<StandingsScope[]> {
    if (format === TournamentFormat.LEAGUE) {
      if (groupId !== undefined) return [];
      return [
        {
          group: null,
          teamIds: new Set(teams.map((team) => team.tournamentTeamId)),
        },
      ];
    }

    const groups = await this.prisma.tournamentGroup.findMany({
      where: {
        tournamentId,
        organizationId,
        isDeleted: false,
        ...(groupId === undefined ? {} : { id: groupId }),
      },
      orderBy: [
        { sortOrder: { sort: 'asc', nulls: 'last' } },
        { name: 'asc' },
        { id: 'asc' },
      ],
      select: { id: true, name: true },
    });
    if (groups.length === 0) return [];

    const memberships = await this.prisma.tournamentGroupTeam.findMany({
      where: { tournamentId, organizationId, isDeleted: false },
      select: { tournamentGroupId: true, tournamentTeamId: true },
    });
    return groups.map((group) => ({
      group,
      teamIds: new Set(
        memberships
          .filter((membership) => membership.tournamentGroupId === group.id)
          .map((membership) => membership.tournamentTeamId),
      ),
    }));
  }

  private buildTable(
    scope: StandingsScope,
    teams: readonly RankingTeam[],
    matches: readonly StandingsMatch[],
  ): StandingsTableResponseDto {
    const scopeMatches = matches.filter(
      (match) =>
        (scope.group === null || match.tournamentGroupId === scope.group.id) &&
        match.teams.length === 2 &&
        match.teams.every((side) => scope.teamIds.has(side.tournamentTeamId)),
    );
    const pendingMatches = scopeMatches.filter((match) =>
      PENDING_STATUSES.includes(match.status),
    ).length;
    const counted = scopeMatches
      .filter((match) => match.status === MatchStatus.FINISHED)
      .map(toRankingMatch)
      .filter((match): match is RankingMatch => match !== null);

    const standingsState: StandingsState =
      counted.length === 0 ? 'EMPTY' : pendingMatches > 0 ? 'PARTIAL' : 'FINAL';

    return {
      group: scope.group,
      standingsState,
      pendingMatches,
      rows: rankTable(
        teams.filter((team) => scope.teamIds.has(team.tournamentTeamId)),
        counted,
      ),
    };
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

  private assertMutable(status: TournamentStatus): void {
    if (
      status === TournamentStatus.COMPLETED ||
      status === TournamentStatus.CANCELLED
    ) {
      throw ApiException.conflict(
        'The tournament standings can no longer be changed.',
        'TOURNAMENT_NOT_MUTABLE',
      );
    }
  }

  private assertCurrentBlock(
    tables: readonly StandingsTableResponseDto[],
    blockKey: string,
  ): void {
    const isCurrent = tables.some((table) =>
      table.rows.some((row) => row.tieBlockKey === blockKey),
    );
    if (!isCurrent) {
      throw ApiException.conflict(
        'The submitted teams are not a current tied block.',
        'TIE_BLOCK_MISMATCH',
      );
    }
  }
}

/** An incomplete result is not a played game — it is skipped, not counted as zero. */
function toRankingMatch(match: StandingsMatch): RankingMatch | null {
  const [home, away] = match.teams;
  if (
    home.finalScore === null ||
    away.finalScore === null ||
    home.result === null ||
    away.result === null
  ) {
    return null;
  }
  return [
    {
      tournamentTeamId: home.tournamentTeamId,
      finalScore: home.finalScore,
      result: home.result,
      lossType: home.lossType,
    },
    {
      tournamentTeamId: away.tournamentTeamId,
      finalScore: away.finalScore,
      result: away.result,
      lossType: away.lossType,
    },
  ];
}
