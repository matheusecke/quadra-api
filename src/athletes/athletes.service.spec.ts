import { Test, TestingModule } from '@nestjs/testing';
import {
  AffiliationStatus,
  BasketballPosition,
  EntityStatus,
  MatchStatus,
  OrgRole,
  RosterRole,
} from '@prisma/client';
import { AthletesService } from './athletes.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatisticsService } from '../statistics/statistics.service';

const mockPrisma: any = {
  organizationUserAffiliation: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  user: { findFirst: jest.fn() },
  playerMatchStatistic: { count: jest.fn(), findMany: jest.fn() },
};

const emptyAggregate = {
  gamesPlayed: 0,
  measuredGames: {},
  totals: {},
  perGame: {},
  shooting: {},
  efficiency: { measuredGames: 0, total: null, perGame: null },
};
const mockStatistics = {
  aggregate: jest.fn(),
  derive: jest.fn(),
};

const affiliationRow = {
  teamId: 8,
  role: OrgRole.ATHLETE,
  jerseyNumber: 7,
  position: BasketballPosition.PG,
  user: {
    id: 165,
    name: 'Rafael Moura',
    status: EntityStatus.ACTIVE,
  },
};

describe('AthletesService', () => {
  let service: AthletesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AthletesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StatisticsService, useValue: mockStatistics },
      ],
    }).compile();

    service = module.get<AthletesService>(AthletesService);
  });

  describe('findAll', () => {
    it('lists both eligible roles with active tenant and user filters by default', async () => {
      mockPrisma.organizationUserAffiliation.count.mockResolvedValue(1);
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([
        affiliationRow,
      ]);

      const result = await service.findAll(42, { page: 1, limit: 10 });

      const where = {
        organizationId: 42,
        isDeleted: false,
        status: AffiliationStatus.ACTIVE,
        role: { in: [OrgRole.ATHLETE, OrgRole.COACHING_STAFF] },
        user: { isDeleted: false, status: EntityStatus.ACTIVE },
      };
      expect(mockPrisma.organizationUserAffiliation.count).toHaveBeenCalledWith(
        { where },
      );
      expect(result.data).toEqual([
        {
          id: 165,
          name: 'Rafael Moura',
          teamId: 8,
          role: OrgRole.ATHLETE,
          jerseyNumber: 7,
          position: BasketballPosition.PG,
          status: EntityStatus.ACTIVE,
        },
      ]);
    });

    it('combines q, ids, teamId and role and orders by user identity', async () => {
      mockPrisma.organizationUserAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);

      await service.findAll(42, {
        page: 2,
        limit: 5,
        q: 'rafael',
        ids: [165, 166],
        teamId: 8,
        role: OrgRole.ATHLETE,
      });

      expect(
        mockPrisma.organizationUserAffiliation.findMany,
      ).toHaveBeenCalledWith({
        where: {
          organizationId: 42,
          isDeleted: false,
          status: AffiliationStatus.ACTIVE,
          role: OrgRole.ATHLETE,
          teamId: 8,
          user: {
            isDeleted: false,
            status: EntityStatus.ACTIVE,
            id: { in: [165, 166] },
            name: { contains: 'rafael', mode: 'insensitive' },
          },
        },
        skip: 5,
        take: 5,
        orderBy: [{ user: { name: 'asc' } }, { userId: 'asc' }],
        select: expect.any(Object),
      });
    });
  });

  describe('findOne', () => {
    it('returns the active athlete affiliation fields and user status', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 165,
        name: 'Rafael Moura',
        status: EntityStatus.ACTIVE,
        organizationAffiliations: [
          {
            teamId: 8,
            jerseyNumber: 7,
            position: BasketballPosition.PG,
          },
        ],
      });

      await expect(service.findOne(42, 165)).resolves.toEqual({
        id: 165,
        name: 'Rafael Moura',
        currentTeamId: 8,
        jerseyNumber: 7,
        position: BasketballPosition.PG,
        status: EntityStatus.ACTIVE,
      });
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 165, isDeleted: false }),
        }),
      );
    });

    it('keeps a historical-only athlete visible with null current fields', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 165,
        name: 'Rafael Moura',
        status: EntityStatus.INACTIVE,
        organizationAffiliations: [],
      });

      await expect(service.findOne(42, 165)).resolves.toMatchObject({
        currentTeamId: null,
        jerseyNumber: null,
        position: null,
        status: EntityStatus.INACTIVE,
      });
    });

    it('returns the same 404 for missing, deleted, cross-tenant, or ineligible users', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.findOne(42, 165)).rejects.toMatchObject({
        status: 404,
        response: {
          error: {
            title: 'Not Found',
            message: 'Athlete not found',
            code: 'RECORD_NOT_FOUND',
            data: {},
          },
          statusCode: 404,
        },
      });
    });
  });

  describe('findStatistics', () => {
    it('loads only visible finished rows and delegates nullable aggregation', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 165,
        name: 'Rafael Moura',
        status: EntityStatus.ACTIVE,
        organizationAffiliations: [],
      });
      const rows = [
        {
          minutesSeconds: 1980,
          pts: 24,
          reb: 8,
          ast: 5,
          stl: 2,
          blk: 1,
          tov: 3,
          pf: 2,
          fgm: 9,
          fga: 17,
          threeFgm: 3,
          threeFga: 7,
          ftm: 3,
          fta: 4,
        },
      ];
      mockPrisma.playerMatchStatistic.findMany.mockResolvedValue(rows);
      mockStatistics.aggregate.mockReturnValue({
        ...emptyAggregate,
        gamesPlayed: 1,
      });

      await expect(service.findStatistics(42, 165)).resolves.toMatchObject({
        gamesPlayed: 1,
      });
      expect(mockPrisma.playerMatchStatistic.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          organizationId: 42,
          userId: 165,
          isDeleted: false,
          match: expect.objectContaining({
            organizationId: 42,
            status: MatchStatus.FINISHED,
            isDeleted: false,
            tournament: { is: { organizationId: 42, isDeleted: false } },
          }),
          matchTeam: expect.objectContaining({
            organizationId: 42,
            isDeleted: false,
          }),
          tournamentRoster: expect.objectContaining({
            organizationId: 42,
            role: RosterRole.ATHLETE,
            isDeleted: false,
          }),
        }),
        select: expect.any(Object),
      });
      expect(mockStatistics.aggregate).toHaveBeenCalledWith(rows);
    });

    it('returns the calculator empty shape for an eligible athlete with no rows', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 165,
        name: 'Rafael Moura',
        status: EntityStatus.ACTIVE,
        organizationAffiliations: [],
      });
      mockPrisma.playerMatchStatistic.findMany.mockResolvedValue([]);
      mockStatistics.aggregate.mockReturnValue(emptyAggregate);

      await expect(service.findStatistics(42, 165)).resolves.toBe(
        emptyAggregate,
      );
    });
  });
});
