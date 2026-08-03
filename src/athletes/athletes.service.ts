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
import { AthleteCatalogResponseDto } from './dto/athlete-catalog-response.dto';
import { AthleteProfileResponseDto } from './dto/athlete-response.dto';

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
}
