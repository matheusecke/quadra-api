import { Injectable } from '@nestjs/common';
import {
  AffiliationStatus,
  EntityStatus,
  MatchResult,
  MatchStatus,
  Prisma,
  TournamentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { UpdateTeamStatusDto } from './dto/update-team-status.dto';
import { ListTeamsQueryDto } from './dto/list-teams-query.dto';
import { TeamResponseDto } from './dto/team-response.dto';
import {
  TeamMatchResponseDto,
  TeamProfileStatus,
  TeamStatisticsResponseDto,
  TeamSummaryResponseDto,
  TeamTournamentResponseDto,
} from './dto/team-profile-response.dto';
import {
  TeamMatchesQueryDto,
  TeamTournamentsQueryDto,
} from './dto/team-profile-query.dto';
import {
  STATISTIC_METRICS,
  StatisticsService,
  type StatisticLine,
} from '../statistics/statistics.service';
import { deriveMatchScoreSource } from '../matches/match-score-source';

const teamSelect = {
  id: true,
  name: true,
  shortName: true,
  slug: true,
  city: true,
  state: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TeamSelect;

const teamProfileSelect = (organizationId: number) =>
  ({
    id: true,
    name: true,
    shortName: true,
    city: true,
    state: true,
    status: true,
    organizationAffiliations: {
      where: {
        organizationId,
        isDeleted: false,
        status: AffiliationStatus.ACTIVE,
      },
      take: 1,
      select: { id: true },
    },
  }) satisfies Prisma.TeamSelect;

const statisticMetricSelect = {
  minutesSeconds: true,
  pts: true,
  reb: true,
  ast: true,
  stl: true,
  blk: true,
  tov: true,
  pf: true,
  fgm: true,
  fga: true,
  threeFgm: true,
  threeFga: true,
  ftm: true,
  fta: true,
} satisfies Prisma.PlayerMatchStatisticSelect;

const teamStatisticMatchSelect = {
  id: true,
  tournamentTeamId: true,
  finalScore: true,
  result: true,
  lossType: true,
  playerStatistics: {
    where: { isDeleted: false },
    select: statisticMetricSelect,
  },
  match: {
    select: {
      status: true,
      periods: {
        where: { isDeleted: false },
        select: { homePoints: true, awayPoints: true },
      },
      teams: {
        where: {
          isDeleted: false,
          tournamentTeam: { is: { isDeleted: false } },
        },
        select: {
          id: true,
          side: true,
          finalScore: true,
          lossType: true,
        },
      },
    },
  },
} satisfies Prisma.MatchTeamSelect;

const teamProfileMatchSelect = {
  id: true,
  status: true,
  scheduledAt: true,
  venueName: true,
  tournament: {
    select: {
      id: true,
      name: true,
      seasonId: true,
      season: { select: { label: true } },
    },
  },
  periods: {
    where: { isDeleted: false },
    select: { homePoints: true, awayPoints: true },
  },
  teams: {
    where: {
      isDeleted: false,
      tournamentTeam: { is: { isDeleted: false } },
    },
    select: {
      side: true,
      tournamentTeamId: true,
      finalScore: true,
      result: true,
      lossType: true,
      isWinner: true,
      tournamentTeam: {
        select: {
          teamId: true,
          displayNameSnapshot: true,
        },
      },
    },
  },
} satisfies Prisma.MatchSelect;

const teamTournamentHistorySelect = {
  id: true,
  teamId: true,
  displayNameSnapshot: true,
  status: true,
  tournament: {
    select: {
      id: true,
      name: true,
      seasonId: true,
      status: true,
      startsAt: true,
      endsAt: true,
      championTournamentTeamId: true,
      season: { select: { label: true } },
    },
  },
} satisfies Prisma.TournamentTeamSelect;

type TeamProfileRow = Prisma.TeamGetPayload<{
  select: ReturnType<typeof teamProfileSelect>;
}>;
type TeamStatisticMatchRow = Prisma.MatchTeamGetPayload<{
  select: typeof teamStatisticMatchSelect;
}>;
type TeamProfileMatchRow = Prisma.MatchGetPayload<{
  select: typeof teamProfileMatchSelect;
}>;
type TeamTournamentHistoryRow = Prisma.TournamentTeamGetPayload<{
  select: typeof teamTournamentHistorySelect;
}>;

const round = (value: number): number => Math.round(value * 1000) / 1000;
const average = (values: readonly number[]): number | null =>
  values.length === 0
    ? null
    : round(values.reduce((sum, value) => sum + value, 0) / values.length);

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statistics: StatisticsService,
  ) {}

  async create(dto: CreateTeamDto): Promise<TeamResponseDto> {
    const slug = slugify(dto.name);

    const existing = await this.prisma.team.findFirst({
      where: { slug, isDeleted: false },
      select: { id: true },
    });

    if (existing) {
      throw ApiException.conflict(
        'A team with this name already exists.',
        'DUPLICATE_RECORD',
      );
    }

    return this.prisma.team.create({
      data: { name: dto.name, shortName: dto.shortName, slug },
      select: teamSelect,
    });
  }

  async findAll(
    organizationId: number,
    query: ListTeamsQueryDto,
  ): Promise<{ count: number; data: TeamResponseDto[] }> {
    const filters: Prisma.TeamWhereInput[] = [
      { isDeleted: false },
      {
        organizationAffiliations: {
          some: {
            organizationId,
            isDeleted: false,
            status: AffiliationStatus.ACTIVE,
          },
        },
      },
    ];

    if (query.status) filters.push({ status: query.status });
    if (query.q) {
      filters.push({ name: { contains: query.q, mode: 'insensitive' } });
    }
    if (query.ids) filters.push({ id: { in: query.ids } });

    const where: Prisma.TeamWhereInput = { AND: filters };
    const skip = (query.page - 1) * query.limit;

    const [count, data] = await Promise.all([
      this.prisma.team.count({ where }),
      this.prisma.team.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: teamSelect,
      }),
    ]);

    return { count, data };
  }

  async findById(id: number): Promise<TeamResponseDto> {
    const team = await this.prisma.team.findFirst({
      where: { id, isDeleted: false },
      select: teamSelect,
    });

    if (!team) {
      throw ApiException.notFound('Team not found');
    }

    return team;
  }

  async findSummary(
    organizationId: number,
    teamId: number,
  ): Promise<TeamSummaryResponseDto> {
    const team = await this.findVisibleTeamOrThrow(organizationId, teamId);
    const [titles, rows] = await Promise.all([
      this.prisma.tournament.findMany({
        where: {
          organizationId,
          isDeleted: false,
          status: TournamentStatus.COMPLETED,
          championTournamentTeam: {
            is: { organizationId, teamId, isDeleted: false },
          },
        },
        orderBy: [
          { startsAt: { sort: 'desc', nulls: 'last' } },
          { id: 'desc' },
        ],
        select: {
          id: true,
          name: true,
          seasonId: true,
          startsAt: true,
          endsAt: true,
          season: { select: { label: true } },
        },
      }),
      this.findTeamStatisticRows(organizationId, teamId),
    ]);
    return {
      team: {
        id: team.id,
        name: team.name,
        shortName: team.shortName,
        city: team.city,
        state: team.state,
        status:
          team.status === EntityStatus.INACTIVE
            ? TeamProfileStatus.INACTIVE
            : team.organizationAffiliations.length > 0
              ? TeamProfileStatus.ACTIVE
              : TeamProfileStatus.HISTORICAL,
      },
      titles: titles.map((title) => ({
        tournament: {
          id: title.id,
          name: title.name,
          seasonId: title.seasonId,
          seasonLabel: title.season.label,
          startsAt: title.startsAt,
          endsAt: title.endsAt,
        },
      })),
      statistics: this.composeTeamStatistics(rows),
    };
  }

  async findMatches(
    organizationId: number,
    teamId: number,
    query: TeamMatchesQueryDto,
  ): Promise<{ count: number; data: TeamMatchResponseDto[] }> {
    await this.findVisibleTeamOrThrow(organizationId, teamId);
    if (query.scope === 'history') {
      const where = this.buildTeamMatchWhere(organizationId, teamId, [
        MatchStatus.FINISHED,
        MatchStatus.CANCELLED,
      ]);
      const [count, rows] = await Promise.all([
        this.prisma.match.count({ where }),
        this.prisma.match.findMany({
          where,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
          select: teamProfileMatchSelect,
        }),
      ]);
      return {
        count,
        data: rows.map((row) => this.toTeamMatch(row, teamId)),
      };
    }

    const liveWhere = this.buildTeamMatchWhere(
      organizationId,
      teamId,
      MatchStatus.LIVE,
    );
    const queuedWhere = this.buildTeamMatchWhere(organizationId, teamId, [
      MatchStatus.SCHEDULED,
      MatchStatus.POSTPONED,
    ]);
    const [liveCount, queuedCount] = await Promise.all([
      this.prisma.match.count({ where: liveWhere }),
      this.prisma.match.count({ where: queuedWhere }),
    ]);
    const skip = (query.page - 1) * query.limit;
    const liveTake = Math.min(query.limit, Math.max(liveCount - skip, 0));
    const queuedSkip = Math.max(skip - liveCount, 0);
    const queuedTake = query.limit - liveTake;
    const [liveRows, queuedRows] = await Promise.all([
      liveTake === 0
        ? Promise.resolve([] as TeamProfileMatchRow[])
        : this.prisma.match.findMany({
            where: liveWhere,
            skip,
            take: liveTake,
            orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
            select: teamProfileMatchSelect,
          }),
      queuedTake === 0
        ? Promise.resolve([] as TeamProfileMatchRow[])
        : this.prisma.match.findMany({
            where: queuedWhere,
            skip: queuedSkip,
            take: queuedTake,
            orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
            select: teamProfileMatchSelect,
          }),
    ]);
    return {
      count: liveCount + queuedCount,
      data: [...liveRows, ...queuedRows].map((row) =>
        this.toTeamMatch(row, teamId),
      ),
    };
  }

  async findTournaments(
    organizationId: number,
    teamId: number,
    query: TeamTournamentsQueryDto,
  ): Promise<{ count: number; data: TeamTournamentResponseDto[] }> {
    await this.findVisibleTeamOrThrow(organizationId, teamId);
    const where: Prisma.TournamentTeamWhereInput = {
      organizationId,
      teamId,
      isDeleted: false,
      tournament: { is: { organizationId, isDeleted: false } },
    };
    const [count, rows] = await Promise.all([
      this.prisma.tournamentTeam.count({ where }),
      this.prisma.tournamentTeam.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [
          { tournament: { startsAt: { sort: 'desc', nulls: 'last' } } },
          { tournamentId: 'desc' },
          { id: 'asc' },
        ],
        select: teamTournamentHistorySelect,
      }),
    ]);
    if (rows.length === 0) return { count, data: [] };

    const statisticRows = await this.findTeamStatisticRows(
      organizationId,
      teamId,
      rows.map((row) => row.id),
    );
    const statisticsByParticipation = new Map<
      number,
      TeamStatisticMatchRow[]
    >();
    for (const statisticRow of statisticRows) {
      const statistics = statisticsByParticipation.get(
        statisticRow.tournamentTeamId,
      );
      if (statistics) statistics.push(statisticRow);
      else {
        statisticsByParticipation.set(statisticRow.tournamentTeamId, [
          statisticRow,
        ]);
      }
    }

    return {
      count,
      data: rows.map((row) => ({
        tournament: {
          id: row.tournament.id,
          name: row.tournament.name,
          seasonId: row.tournament.seasonId,
          seasonLabel: row.tournament.season.label,
          status: row.tournament.status,
          startsAt: row.tournament.startsAt,
          endsAt: row.tournament.endsAt,
        },
        team: {
          tournamentTeamId: row.id,
          teamId: row.teamId,
          name: row.displayNameSnapshot,
          status: row.status,
          isChampion: row.tournament.championTournamentTeamId === row.id,
        },
        statistics: this.composeTeamStatistics(
          statisticsByParticipation.get(row.id) ?? [],
        ),
      })),
    };
  }

  async update(id: number, dto: UpdateTeamDto): Promise<TeamResponseDto> {
    const existing = await this.prisma.team.findFirst({
      where: { id, isDeleted: false },
      select: { id: true, slug: true },
    });

    if (!existing) {
      throw ApiException.notFound('Team not found');
    }

    const newSlug = slugify(dto.name);

    if (newSlug !== existing.slug) {
      const conflict = await this.prisma.team.findFirst({
        where: { slug: newSlug, isDeleted: false, id: { not: id } },
        select: { id: true },
      });

      if (conflict) {
        throw ApiException.conflict(
          'A team with this name already exists.',
          'DUPLICATE_RECORD',
        );
      }
    }

    return this.prisma.team.update({
      where: { id },
      data: { name: dto.name, slug: newSlug },
      select: teamSelect,
    });
  }

  async updateStatus(
    id: number,
    dto: UpdateTeamStatusDto,
  ): Promise<TeamResponseDto> {
    const existing = await this.prisma.team.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    });

    if (!existing) {
      throw ApiException.notFound('Team not found');
    }

    return this.prisma.team.update({
      where: { id },
      data: { status: dto.status },
      select: teamSelect,
    });
  }

  async softDelete(id: number): Promise<void> {
    const existing = await this.prisma.team.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    });

    if (!existing) {
      throw ApiException.notFound('Team not found');
    }

    await this.prisma.team.update({
      where: { id },
      data: { isDeleted: true, status: EntityStatus.INACTIVE },
    });
  }

  private async findVisibleTeamOrThrow(
    organizationId: number,
    teamId: number,
  ): Promise<TeamProfileRow> {
    const team = await this.prisma.team.findFirst({
      where: {
        id: teamId,
        isDeleted: false,
        OR: [
          {
            organizationAffiliations: {
              some: {
                organizationId,
                isDeleted: false,
                status: AffiliationStatus.ACTIVE,
              },
            },
          },
          {
            tournamentTeams: {
              some: {
                organizationId,
                isDeleted: false,
                tournament: { is: { organizationId, isDeleted: false } },
              },
            },
          },
        ],
      },
      select: teamProfileSelect(organizationId),
    });
    if (!team) throw ApiException.notFound('Team not found');
    return team;
  }

  private buildTeamMatchWhere(
    organizationId: number,
    teamId: number,
    status: MatchStatus | readonly MatchStatus[],
  ): Prisma.MatchWhereInput {
    return {
      organizationId,
      isDeleted: false,
      status: typeof status === 'string' ? status : { in: [...status] },
      tournament: { is: { organizationId, isDeleted: false } },
      teams: {
        some: {
          organizationId,
          isDeleted: false,
          tournamentTeam: {
            is: { organizationId, teamId, isDeleted: false },
          },
        },
      },
    };
  }

  private toTeamMatch(
    row: TeamProfileMatchRow,
    teamId: number,
  ): TeamMatchResponseDto {
    const team = row.teams.find(
      (entry) => entry.tournamentTeam.teamId === teamId,
    );
    const opponent = row.teams.find((entry) => entry !== team);
    if (!team || !opponent) {
      throw new Error('Active team match participants invariant violated');
    }
    const includeResult = row.status === MatchStatus.FINISHED;
    const participant = (
      entry: (typeof row.teams)[number],
    ): TeamMatchResponseDto['team'] => ({
      tournamentTeamId: entry.tournamentTeamId,
      teamId: entry.tournamentTeam.teamId,
      name: entry.tournamentTeam.displayNameSnapshot,
      score: includeResult ? entry.finalScore : null,
      result: includeResult ? entry.result : null,
      lossType: includeResult ? entry.lossType : null,
      isWinner: includeResult ? entry.isWinner : null,
    });
    return {
      match: {
        id: row.id,
        status: row.status,
        scheduledAt: row.scheduledAt,
        venueName: row.venueName,
        scoreSource: deriveMatchScoreSource(row),
      },
      tournament: {
        id: row.tournament.id,
        name: row.tournament.name,
        seasonId: row.tournament.seasonId,
        seasonLabel: row.tournament.season.label,
      },
      team: participant(team),
      opponent: participant(opponent),
    };
  }

  private findTeamStatisticRows(
    organizationId: number,
    teamId: number,
    tournamentTeamIds?: readonly number[],
  ): Promise<TeamStatisticMatchRow[]> {
    return this.prisma.matchTeam.findMany({
      where: {
        organizationId,
        isDeleted: false,
        tournamentTeam: {
          is: {
            organizationId,
            teamId,
            isDeleted: false,
            ...(tournamentTeamIds
              ? { id: { in: [...tournamentTeamIds] } }
              : {}),
            tournament: { is: { organizationId, isDeleted: false } },
          },
        },
        match: {
          is: {
            organizationId,
            isDeleted: false,
            status: MatchStatus.FINISHED,
            tournament: { is: { organizationId, isDeleted: false } },
          },
        },
      },
      select: teamStatisticMatchSelect,
    });
  }

  private composeTeamStatistics(
    rows: readonly TeamStatisticMatchRow[],
  ): TeamStatisticsResponseDto {
    const resultRows = rows.filter((row) => row.result !== null);
    const scoredRows = rows.flatMap((row) => {
      const opponent = row.match.teams.find((team) => team.id !== row.id);
      if (
        deriveMatchScoreSource(row.match) !== 'PERIODS' ||
        row.finalScore === null ||
        opponent?.finalScore === null ||
        opponent?.finalScore === undefined
      ) {
        return [];
      }
      return [[row.finalScore, opponent.finalScore] as const];
    });
    const boxScore = this.statistics.aggregate(
      rows.map((row) => this.toTeamStatisticLine(row.playerStatistics)),
    );

    return {
      results: {
        measuredGames: resultRows.length,
        winRate: average(
          resultRows.map((row) => (row.result === MatchResult.WIN ? 1 : 0)),
        ),
        scoreMeasuredGames: scoredRows.length,
        pointsForPerGame: average(scoredRows.map(([pointsFor]) => pointsFor)),
        pointsAgainstPerGame: average(
          scoredRows.map(([, pointsAgainst]) => pointsAgainst),
        ),
        pointDiffPerGame: average(
          scoredRows.map(
            ([pointsFor, pointsAgainst]) => pointsFor - pointsAgainst,
          ),
        ),
      },
      boxScore: {
        measuredGames: this.selectBoxMetrics(boxScore.measuredGames),
        perGame: this.selectBoxMetrics(boxScore.perGame),
        shooting: boxScore.shooting,
        efficiency: {
          measuredGames: boxScore.efficiency.measuredGames,
          perGame: boxScore.efficiency.perGame,
        },
      },
    };
  }

  private toTeamStatisticLine(
    lines: readonly StatisticLine[],
  ): StatisticLine {
    return Object.fromEntries(
      STATISTIC_METRICS.map((metric) => {
        const values = lines
          .map((line) => line[metric])
          .filter((value): value is number => value !== null);
        return [
          metric,
          values.length === 0
            ? null
            : values.reduce((sum, value) => sum + value, 0),
        ];
      }),
    ) as StatisticLine;
  }

  private selectBoxMetrics<T>(values: {
    reb: T;
    ast: T;
    stl: T;
    blk: T;
    tov: T;
    pf: T;
  }) {
    const { reb, ast, stl, blk, tov, pf } = values;
    return { reb, ast, stl, blk, tov, pf };
  }
}
