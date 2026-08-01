import { Injectable } from '@nestjs/common';
import {
  LossType,
  MatchSide,
  MatchStatus,
  Prisma,
  TournamentFormat,
  TournamentStatus,
  TournamentTeamStatus,
} from '@prisma/client';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  ListMatchesQueryDto,
  ListTournamentMatchesQueryDto,
} from './dto/list-matches-query.dto';
import {
  MatchDetailResponseDto,
  MatchScoreSource,
  MatchSummaryResponseDto,
  MatchTeamResponseDto,
  PlayerMatchStatisticResponseDto,
} from './dto/match-response.dto';

const matchTeamReadSelect = {
  side: true,
  tournamentTeamId: true,
  finalScore: true,
  result: true,
  lossType: true,
  isWinner: true,
  tournamentTeam: { select: { displayNameSnapshot: true } },
} satisfies Prisma.MatchTeamSelect;

export const matchSummarySelect = {
  id: true,
  tournamentId: true,
  tournamentGroupId: true,
  matchNumber: true,
  status: true,
  scheduledAt: true,
  startedAt: true,
  endedAt: true,
  venueName: true,
  teams: {
    where: { isDeleted: false },
    select: matchTeamReadSelect,
  },
  periods: {
    where: { isDeleted: false },
    select: { homePoints: true, awayPoints: true },
  },
  bracketSlots: {
    where: {
      isDeleted: false,
      round: { is: { isDeleted: false } },
    },
    orderBy: [{ id: 'asc' }],
    take: 1,
    select: {
      round: { select: { id: true, number: true, label: true } },
    },
  },
} satisfies Prisma.MatchSelect;

export const matchDetailSelect = {
  ...matchSummarySelect,
  periods: {
    where: { isDeleted: false },
    orderBy: [{ periodNumber: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      periodNumber: true,
      periodType: true,
      homePoints: true,
      awayPoints: true,
      startedAt: true,
      endedAt: true,
    },
  },
  playerStatistics: {
    where: { isDeleted: false },
    select: {
      tournamentRosterId: true,
      pts: true,
      fgm: true,
      fga: true,
      threeFgm: true,
      threeFga: true,
      ftm: true,
      fta: true,
      reb: true,
      ast: true,
      stl: true,
      blk: true,
      tov: true,
      pf: true,
      minutesSeconds: true,
      matchTeam: { select: { side: true } },
      matchRoster: {
        select: { displayNameSnapshot: true, isDeleted: true },
      },
      tournamentRoster: {
        select: {
          tournamentTeamId: true,
          displayNameSnapshot: true,
        },
      },
    },
  },
  mvpMatchRoster: {
    select: {
      tournamentRosterId: true,
      displayNameSnapshot: true,
      isDeleted: true,
    },
  },
} satisfies Prisma.MatchSelect;

export const matchUpdateTargetSelect = {
  id: true,
  tournamentId: true,
  tournamentGroupId: true,
  matchNumber: true,
  scheduledAt: true,
  venueName: true,
  status: true,
  tournament: { select: { format: true } },
  teams: {
    where: { isDeleted: false },
    select: { id: true, side: true, tournamentTeamId: true },
  },
  bracketSlots: {
    where: { isDeleted: false },
    orderBy: [{ id: 'asc' }],
    take: 1,
    select: {
      id: true,
      homeTournamentTeamId: true,
      awayTournamentTeamId: true,
    },
  },
} satisfies Prisma.MatchSelect;

type MatchSummaryRow = Prisma.MatchGetPayload<{
  select: typeof matchSummarySelect;
}>;
type MatchDetailRow = Prisma.MatchGetPayload<{
  select: typeof matchDetailSelect;
}>;
type MatchUpdateTarget = Prisma.MatchGetPayload<{
  select: typeof matchUpdateTargetSelect;
}>;
type MatchClient = Pick<
  Prisma.TransactionClient,
  | 'match'
  | 'matchTeam'
  | 'tournament'
  | 'tournamentGroup'
  | 'tournamentTeam'
  | 'tournamentGroupTeam'
  | 'tournamentBracketSlot'
  | 'matchPeriod'
  | 'matchRoster'
  | 'playerMatchStatistic'
>;

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: number,
    query: ListMatchesQueryDto,
  ): Promise<{ count: number; data: MatchSummaryResponseDto[] }> {
    return this.list(organizationId, query);
  }

  async findAllByTournament(
    organizationId: number,
    tournamentId: number,
    query: ListTournamentMatchesQueryDto,
  ): Promise<{ count: number; data: MatchSummaryResponseDto[] }> {
    await this.findTournamentOrThrow(organizationId, tournamentId);
    return this.list(organizationId, query, tournamentId);
  }

  private async findTournamentOrThrow(
    organizationId: number,
    tournamentId: number,
  ): Promise<{
    id: number;
    format: TournamentFormat;
    status: TournamentStatus;
  }> {
    const tournament = await this.prisma.tournament.findFirst({
      where: { id: tournamentId, organizationId, isDeleted: false },
      select: { id: true, format: true, status: true },
    });
    if (!tournament) throw ApiException.notFound('Tournament not found');
    return tournament;
  }

  private async list(
    organizationId: number,
    query: ListMatchesQueryDto | ListTournamentMatchesQueryDto,
    tournamentId?: number,
  ): Promise<{ count: number; data: MatchSummaryResponseDto[] }> {
    const where = this.buildWhere(organizationId, query, tournamentId);
    const [count, rows] = await Promise.all([
      this.prisma.match.count({ where }),
      this.prisma.match.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
        select: matchSummarySelect,
      }),
    ]);
    return { count, data: rows.map((row) => this.toSummary(row)) };
  }

  private buildWhere(
    organizationId: number,
    query: ListMatchesQueryDto | ListTournamentMatchesQueryDto,
    tournamentId?: number,
  ): Prisma.MatchWhereInput {
    const filters: Prisma.MatchWhereInput[] = [];
    if (query.q) {
      filters.push({
        teams: {
          some: {
            isDeleted: false,
            tournamentTeam: {
              displayNameSnapshot: {
                contains: query.q,
                mode: 'insensitive',
              },
            },
          },
        },
      });
    }
    if (query.tournamentTeamIds) {
      filters.push({
        teams: {
          some: {
            isDeleted: false,
            tournamentTeamId: { in: query.tournamentTeamIds },
          },
        },
      });
    }
    return {
      organizationId,
      isDeleted: false,
      tournament: { organizationId, isDeleted: false },
      ...(query.ids ? { id: { in: query.ids } } : {}),
      ...(tournamentId !== undefined
        ? { tournamentId }
        : 'tournamentId' in query && query.tournamentId !== undefined
          ? { tournamentId: query.tournamentId }
          : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(filters.length > 0 ? { AND: filters } : {}),
    };
  }

  private toSummary(row: MatchSummaryRow): MatchSummaryResponseDto {
    const isFinished = row.status === MatchStatus.FINISHED;
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      tournamentGroupId: row.tournamentGroupId,
      matchNumber: row.matchNumber,
      status: row.status,
      scheduledAt: row.scheduledAt,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      venueName: row.venueName,
      bracketRound: row.bracketSlots[0]?.round ?? null,
      scoreSource: this.deriveScoreSource(row),
      homeTeam: this.toTeam(row, MatchSide.HOME, isFinished),
      awayTeam: this.toTeam(row, MatchSide.AWAY, isFinished),
    };
  }

  private toTeam(
    row: MatchSummaryRow,
    side: MatchSide,
    includeResult: boolean,
  ): MatchTeamResponseDto {
    const team = row.teams.find((candidate) => candidate.side === side);
    if (!team) {
      throw new Error(`Active ${side} MatchTeam invariant violated`);
    }
    return {
      tournamentTeamId: team.tournamentTeamId,
      teamName: team.tournamentTeam.displayNameSnapshot,
      score: includeResult ? team.finalScore : null,
      result: includeResult ? team.result : null,
      lossType: includeResult ? team.lossType : null,
      isWinner: includeResult ? team.isWinner : null,
    };
  }

  async findOne(
    organizationId: number,
    id: number,
  ): Promise<MatchDetailResponseDto> {
    const row = await this.findMatchOrThrow(organizationId, id);
    return this.toDetail(row);
  }

  private async findMatchOrThrow(
    organizationId: number,
    id: number,
  ): Promise<MatchDetailRow> {
    const row = await this.prisma.match.findFirst({
      where: {
        id,
        organizationId,
        isDeleted: false,
        tournament: { organizationId, isDeleted: false },
      },
      select: matchDetailSelect,
    });
    if (!row) throw ApiException.notFound('Match not found');
    return row;
  }

  private toDetail(row: MatchDetailRow): MatchDetailResponseDto {
    const isForfeit = row.teams.some(
      (team) => team.lossType === LossType.FORFEIT,
    );
    const periods = isForfeit
      ? []
      : [...row.periods]
          .sort(
            (left, right) =>
              left.periodNumber - right.periodNumber || left.id - right.id,
          )
          .map((period) => ({
            periodNumber: period.periodNumber,
            periodType: period.periodType,
            homePoints: period.homePoints,
            awayPoints: period.awayPoints,
            startedAt: period.startedAt,
            endedAt: period.endedAt,
          }));
    const playerStats = isForfeit
      ? []
      : row.playerStatistics
          .map((stat) => this.toPlayerStat(stat))
          .sort(
            (left, right) =>
              left.sideOrder - right.sideOrder ||
              left.value.displayName.localeCompare(right.value.displayName) ||
              left.value.tournamentRosterId - right.value.tournamentRosterId,
          )
          .map(({ value }) => value);
    return {
      ...this.toSummary(row),
      periods,
      playerStats,
      mvp:
        !isForfeit && row.mvpMatchRoster && !row.mvpMatchRoster.isDeleted
          ? {
              tournamentRosterId: row.mvpMatchRoster.tournamentRosterId,
              displayName: row.mvpMatchRoster.displayNameSnapshot,
            }
          : null,
    };
  }

  private toPlayerStat(stat: MatchDetailRow['playerStatistics'][number]): {
    sideOrder: number;
    value: PlayerMatchStatisticResponseDto;
  } {
    const { matchTeam, matchRoster, tournamentRoster, ...metrics } = stat;
    return {
      sideOrder: matchTeam.side === MatchSide.HOME ? 0 : 1,
      value: {
        ...metrics,
        tournamentTeamId: tournamentRoster.tournamentTeamId,
        displayName:
          matchRoster && !matchRoster.isDeleted
            ? matchRoster.displayNameSnapshot
            : tournamentRoster.displayNameSnapshot,
      },
    };
  }

  private deriveScoreSource(row: MatchSummaryRow): MatchScoreSource | null {
    if (row.status !== MatchStatus.FINISHED) return null;
    if (row.teams.some((team) => team.lossType === LossType.FORFEIT)) {
      return 'AWARDED';
    }
    if (row.teams.some((team) => team.lossType === LossType.DEFAULT)) {
      const homeTotal = row.periods.reduce(
        (total, period) => total + period.homePoints,
        0,
      );
      const awayTotal = row.periods.reduce(
        (total, period) => total + period.awayPoints,
        0,
      );
      const home = row.teams.find((team) => team.side === MatchSide.HOME);
      const away = row.teams.find((team) => team.side === MatchSide.AWAY);
      if (home?.finalScore !== homeTotal || away?.finalScore !== awayTotal) {
        return 'AWARDED';
      }
    }
    return 'PERIODS';
  }
}
