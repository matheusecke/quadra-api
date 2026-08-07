import { Injectable } from '@nestjs/common';
import {
  AffiliationStatus,
  BasketballPosition,
  EntityStatus,
  MatchStatus,
  OrgRole,
  Prisma,
  RosterRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import { StatisticsService } from '../statistics/statistics.service';
import { StatisticsResponseDto } from '../statistics/dto/statistics-response.dto';
import { ListAthletesQueryDto } from './dto/list-athletes-query.dto';
import {
  ListAthleteMatchesQueryDto,
  ListAthleteTournamentsQueryDto,
} from './dto/athlete-history-query.dto';
import { AthleteCatalogResponseDto } from './dto/athlete-catalog-response.dto';
import {
  AthleteMatchResponseDto,
  AthleteProfileResponseDto,
  AthleteTournamentResponseDto,
} from './dto/athlete-response.dto';

const athleteSelect = {
  teamId: true,
  role: true,
  jerseyNumber: true,
  position: true,
  user: {
    select: { id: true, name: true, status: true },
  },
} satisfies Prisma.OrganizationUserAffiliationSelect;

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

const athleteMatchHistorySelect = (organizationId: number) =>
  ({
    tournamentRosterId: true,
    ...statisticMetricSelect,
    matchRoster: { select: { displayNameSnapshot: true } },
    tournamentRoster: {
      select: {
        tournamentId: true,
        tournamentTeamId: true,
        displayNameSnapshot: true,
        tournamentTeam: {
          select: { teamId: true, displayNameSnapshot: true },
        },
      },
    },
    matchTeam: {
      select: {
        id: true,
        tournamentTeamId: true,
        finalScore: true,
        result: true,
        lossType: true,
      },
    },
    match: {
      select: {
        id: true,
        scheduledAt: true,
        tournament: {
          select: { id: true, name: true, seasonId: true, startsAt: true },
        },
        teams: {
          where: {
            organizationId,
            isDeleted: false,
            tournamentTeam: { is: { organizationId } },
          },
          select: {
            id: true,
            tournamentTeamId: true,
            finalScore: true,
            result: true,
            lossType: true,
            tournamentTeam: {
              select: { teamId: true, displayNameSnapshot: true },
            },
          },
        },
      },
    },
  }) satisfies Prisma.PlayerMatchStatisticSelect;

const athleteTournamentHistorySelect = {
  ...statisticMetricSelect,
  tournamentRoster: {
    select: {
      tournamentTeamId: true,
      tournamentTeam: {
        select: { teamId: true, displayNameSnapshot: true },
      },
    },
  },
  match: {
    select: {
      tournament: {
        select: { id: true, name: true, seasonId: true, startsAt: true },
      },
    },
  },
} satisfies Prisma.PlayerMatchStatisticSelect;

type AthleteMatchHistoryRow = Prisma.PlayerMatchStatisticGetPayload<{
  select: ReturnType<typeof athleteMatchHistorySelect>;
}>;
type AthleteTournamentHistoryRow = Prisma.PlayerMatchStatisticGetPayload<{
  select: typeof athleteTournamentHistorySelect;
}>;

type AthleteIdentity = {
  id: number;
  name: string;
  status: EntityStatus;
  organizationAffiliations: Array<{
    teamId: number | null;
    jerseyNumber: number | null;
    position: BasketballPosition | null;
  }>;
};

@Injectable()
export class AthletesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statistics: StatisticsService,
  ) {}

  async findAll(
    organizationId: number,
    query: ListAthletesQueryDto,
  ): Promise<{ count: number; data: AthleteCatalogResponseDto[] }> {
    const user: Prisma.UserWhereInput = {
      isDeleted: false,
      status: EntityStatus.ACTIVE,
      ...(query.ids ? { id: { in: query.ids } } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const where: Prisma.OrganizationUserAffiliationWhereInput = {
      organizationId,
      isDeleted: false,
      status: AffiliationStatus.ACTIVE,
      role: query.role ?? { in: [OrgRole.ATHLETE, OrgRole.COACHING_STAFF] },
      ...(query.teamId ? { teamId: query.teamId } : {}),
      user,
    };

    const [count, rows] = await Promise.all([
      this.prisma.organizationUserAffiliation.count({ where }),
      this.prisma.organizationUserAffiliation.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ user: { name: 'asc' } }, { userId: 'asc' }],
        select: athleteSelect,
      }),
    ]);

    return {
      count,
      data: rows.map((row) => ({
        id: row.user.id,
        name: row.user.name,
        teamId: row.teamId as number,
        role: row.role as RosterRole,
        jerseyNumber: row.jerseyNumber,
        position: row.position,
        status: row.user.status,
      })),
    };
  }

  async findOne(
    organizationId: number,
    id: number,
  ): Promise<AthleteProfileResponseDto> {
    const athlete = await this.findAthleteOrThrow(organizationId, id);
    const current = athlete.organizationAffiliations[0];
    return {
      id: athlete.id,
      name: athlete.name,
      currentTeamId: current?.teamId ?? null,
      jerseyNumber: current?.jerseyNumber ?? null,
      position: current?.position ?? null,
      status: athlete.status,
    };
  }

  async findStatistics(
    organizationId: number,
    id: number,
  ): Promise<StatisticsResponseDto> {
    await this.findAthleteOrThrow(organizationId, id);
    const rows = await this.prisma.playerMatchStatistic.findMany({
      where: this.buildStatisticWhere(organizationId, id),
      select: statisticMetricSelect,
    });
    return this.statistics.aggregate(rows);
  }

  async findMatches(
    organizationId: number,
    id: number,
    query: ListAthleteMatchesQueryDto,
  ): Promise<{ count: number; data: AthleteMatchResponseDto[] }> {
    await this.findAthleteOrThrow(organizationId, id);
    const filters: Prisma.PlayerMatchStatisticWhereInput[] = [
      {
        OR: [
          { matchRosterId: null },
          { matchRoster: { is: { organizationId, isDeleted: false } } },
        ],
      },
    ];
    if (query.ids) filters.push({ matchId: { in: query.ids } });
    if (query.tournamentId !== undefined) {
      filters.push({ match: { tournamentId: query.tournamentId } });
    }
    const where = this.buildStatisticWhere(organizationId, id, filters);
    const [count, rows] = await Promise.all([
      this.prisma.playerMatchStatistic.count({ where }),
      this.prisma.playerMatchStatistic.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ match: { scheduledAt: 'desc' } }, { matchId: 'desc' }],
        select: athleteMatchHistorySelect(organizationId),
      }),
    ]);
    return { count, data: rows.map((row) => this.toMatchHistory(row)) };
  }

  async findTournaments(
    organizationId: number,
    id: number,
    query: ListAthleteTournamentsQueryDto,
  ): Promise<{ count: number; data: AthleteTournamentResponseDto[] }> {
    await this.findAthleteOrThrow(organizationId, id);
    const filters: Prisma.PlayerMatchStatisticWhereInput[] = [];
    if (query.ids) {
      filters.push({ match: { tournamentId: { in: query.ids } } });
    }
    if (query.seasonId !== undefined) {
      filters.push({ match: { tournament: { seasonId: query.seasonId } } });
    }
    const rows = await this.prisma.playerMatchStatistic.findMany({
      where: this.buildStatisticWhere(organizationId, id, filters),
      select: athleteTournamentHistorySelect,
    });
    const groups = new Map<string, AthleteTournamentHistoryRow[]>();
    for (const row of rows) {
      const key = `${row.match.tournament.id}:${row.tournamentRoster.tournamentTeamId}`;
      const group = groups.get(key);
      if (group) group.push(row);
      else groups.set(key, [row]);
    }
    const data = [...groups.values()]
      .map((group): AthleteTournamentResponseDto => {
        const first = group[0];
        return {
          tournament: first.match.tournament,
          team: {
            tournamentTeamId: first.tournamentRoster.tournamentTeamId,
            teamId: first.tournamentRoster.tournamentTeam.teamId,
            name: first.tournamentRoster.tournamentTeam.displayNameSnapshot,
          },
          statistics: this.statistics.aggregate(group),
        };
      })
      .sort((left, right) => {
        const leftTime = left.tournament.startsAt?.getTime() ?? null;
        const rightTime = right.tournament.startsAt?.getTime() ?? null;
        if (leftTime === null && rightTime !== null) return 1;
        if (leftTime !== null && rightTime === null) return -1;
        return (
          (rightTime ?? 0) - (leftTime ?? 0) ||
          right.tournament.id - left.tournament.id ||
          left.team.tournamentTeamId - right.team.tournamentTeamId
        );
      });
    const start = (query.page - 1) * query.limit;
    return { count: data.length, data: data.slice(start, start + query.limit) };
  }

  private async findAthleteOrThrow(
    organizationId: number,
    id: number,
  ): Promise<AthleteIdentity> {
    const currentAffiliation = {
      organizationId,
      isDeleted: false,
      status: AffiliationStatus.ACTIVE,
      role: OrgRole.ATHLETE,
      team: { is: { isDeleted: false } },
    } satisfies Prisma.OrganizationUserAffiliationWhereInput;
    const historicalRoster = {
      organizationId,
      isDeleted: false,
      role: RosterRole.ATHLETE,
      tournament: { is: { organizationId, isDeleted: false } },
      tournamentTeam: {
        is: {
          organizationId,
          isDeleted: false,
          team: { is: { isDeleted: false } },
        },
      },
    } satisfies Prisma.TournamentRosterWhereInput;
    const athlete = await this.prisma.user.findFirst({
      where: {
        id,
        isDeleted: false,
        OR: [
          { organizationAffiliations: { some: currentAffiliation } },
          { tournamentRosters: { some: historicalRoster } },
        ],
      },
      select: {
        id: true,
        name: true,
        status: true,
        organizationAffiliations: {
          where: currentAffiliation,
          orderBy: [{ id: 'asc' }],
          take: 1,
          select: { teamId: true, jerseyNumber: true, position: true },
        },
      },
    });
    if (!athlete) throw ApiException.notFound('Athlete not found');
    return athlete;
  }

  private buildStatisticWhere(
    organizationId: number,
    userId: number,
    filters: Prisma.PlayerMatchStatisticWhereInput[] = [],
  ): Prisma.PlayerMatchStatisticWhereInput {
    return {
      organizationId,
      userId,
      isDeleted: false,
      match: {
        organizationId,
        isDeleted: false,
        status: MatchStatus.FINISHED,
        tournament: { is: { organizationId, isDeleted: false } },
      },
      matchTeam: {
        organizationId,
        isDeleted: false,
        tournamentTeam: {
          is: {
            organizationId,
            isDeleted: false,
            team: { is: { isDeleted: false } },
          },
        },
      },
      tournamentRoster: {
        organizationId,
        isDeleted: false,
        role: RosterRole.ATHLETE,
        tournament: { is: { organizationId, isDeleted: false } },
        tournamentTeam: {
          is: {
            organizationId,
            isDeleted: false,
            team: { is: { isDeleted: false } },
          },
        },
      },
      ...(filters.length > 0 ? { AND: filters } : {}),
    };
  }

  private toMatchHistory(row: AthleteMatchHistoryRow): AthleteMatchResponseDto {
    const {
      tournamentRosterId,
      matchRoster,
      tournamentRoster,
      matchTeam,
      match,
      ...metrics
    } = row;
    const opponent = match.teams.find((team) => team.id !== matchTeam.id);
    if (
      !opponent ||
      matchTeam.result === null ||
      matchTeam.finalScore === null ||
      opponent.finalScore === null
    ) {
      throw new Error('Finished match statistics invariant violated');
    }
    return {
      match: { id: match.id, scheduledAt: match.scheduledAt },
      tournament: { id: match.tournament.id, name: match.tournament.name },
      athleteName:
        matchRoster?.displayNameSnapshot ??
        tournamentRoster.displayNameSnapshot,
      team: {
        tournamentTeamId: tournamentRoster.tournamentTeamId,
        teamId: tournamentRoster.tournamentTeam.teamId,
        name: tournamentRoster.tournamentTeam.displayNameSnapshot,
      },
      opponent: {
        tournamentTeamId: opponent.tournamentTeamId,
        teamId: opponent.tournamentTeam.teamId,
        name: opponent.tournamentTeam.displayNameSnapshot,
      },
      result: {
        result: matchTeam.result,
        lossType: matchTeam.lossType,
        pointsFor: matchTeam.finalScore,
        pointsAgainst: opponent.finalScore,
      },
      stats: { tournamentRosterId, ...metrics },
      derived: this.statistics.derive(metrics),
    };
  }
}
