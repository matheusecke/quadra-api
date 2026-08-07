import { Test, TestingModule } from '@nestjs/testing';
import {
  AffiliationStatus,
  BasketballPosition,
  EntityStatus,
  LossType,
  MatchResult,
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

const historyRow = {
  tournamentRosterId: 88,
  userId: 165,
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
  matchRoster: {
    displayNameSnapshot: 'Rafael Moura (match)',
    isDeleted: false,
  },
  tournamentRoster: {
    tournamentId: 12,
    tournamentTeamId: 41,
    displayNameSnapshot: 'Rafael Moura (tournament)',
    tournamentTeam: {
      teamId: 8,
      displayNameSnapshot: 'Engenharia PUC',
    },
  },
  matchTeam: {
    id: 701,
    tournamentTeamId: 41,
    finalScore: 78,
    result: MatchResult.WIN,
    lossType: null,
  },
  match: {
    id: 501,
    scheduledAt: new Date('2026-08-15T19:30:00.000Z'),
    tournament: {
      id: 12,
      name: 'Intercursos 2026',
      seasonId: 7,
      startsAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    teams: [
      {
        id: 701,
        tournamentTeamId: 41,
        finalScore: 78,
        result: MatchResult.WIN,
        lossType: null,
        tournamentTeam: {
          teamId: 8,
          displayNameSnapshot: 'Engenharia PUC',
        },
      },
      {
        id: 702,
        tournamentTeamId: 42,
        finalScore: 70,
        result: MatchResult.LOSS,
        lossType: LossType.NORMAL,
        tournamentTeam: {
          teamId: 9,
          displayNameSnapshot: 'Direito PUC',
        },
      },
    ],
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

  describe('findMatches', () => {
    it('combines filters, paginates in stable match order, and maps snapshots/results', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 165,
        name: 'Rafael Moura',
        status: EntityStatus.ACTIVE,
        organizationAffiliations: [],
      });
      mockPrisma.playerMatchStatistic.count.mockResolvedValue(1);
      mockPrisma.playerMatchStatistic.findMany.mockResolvedValue([historyRow]);
      mockStatistics.derive.mockReturnValue({
        fgPct: 0.529,
        threeFgPct: 0.429,
        ftPct: 0.75,
        trueShootingPct: 0.64,
        efficiency: 28,
      });

      const result = await service.findMatches(42, 165, {
        page: 2,
        limit: 5,
        ids: [501, 498],
        tournamentId: 12,
      });

      expect(mockPrisma.playerMatchStatistic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
          orderBy: [{ match: { scheduledAt: 'desc' } }, { matchId: 'desc' }],
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              {
                OR: [
                  { matchRosterId: null },
                  {
                    matchRoster: {
                      is: { organizationId: 42, isDeleted: false },
                    },
                  },
                ],
              },
              { matchId: { in: [501, 498] } },
              { match: { tournamentId: 12 } },
            ]),
          }),
        }),
      );
      expect(result).toEqual({
        count: 1,
        data: [
          {
            match: { id: 501, scheduledAt: historyRow.match.scheduledAt },
            tournament: { id: 12, name: 'Intercursos 2026' },
            athleteName: 'Rafael Moura (match)',
            team: { tournamentTeamId: 41, teamId: 8, name: 'Engenharia PUC' },
            opponent: { tournamentTeamId: 42, teamId: 9, name: 'Direito PUC' },
            result: {
              result: MatchResult.WIN,
              lossType: null,
              pointsFor: 78,
              pointsAgainst: 70,
            },
            stats: expect.objectContaining({ tournamentRosterId: 88, pts: 24 }),
            derived: {
              fgPct: 0.529,
              threeFgPct: 0.429,
              ftPct: 0.75,
              trueShootingPct: 0.64,
              efficiency: 28,
            },
          },
        ],
      });
    });

    it('falls back to the tournament-roster name and returns an empty 200 service page', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 165,
        name: 'Rafael Moura',
        status: EntityStatus.ACTIVE,
        organizationAffiliations: [],
      });
      mockPrisma.playerMatchStatistic.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);
      mockPrisma.playerMatchStatistic.findMany
        .mockResolvedValueOnce([{ ...historyRow, matchRoster: null }])
        .mockResolvedValueOnce([]);
      mockStatistics.derive.mockReturnValue({
        fgPct: null,
        threeFgPct: null,
        ftPct: null,
        trueShootingPct: null,
        efficiency: null,
      });

      const fallback = await service.findMatches(42, 165, {
        page: 1,
        limit: 10,
      });
      expect(fallback.data[0].athleteName).toBe('Rafael Moura (tournament)');
      await expect(
        service.findMatches(42, 165, { page: 1, limit: 10 }),
      ).resolves.toEqual({ count: 0, data: [] });
    });

    it('keeps opponents from soft-deleted teams, pinning only organizationId', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 165,
        name: 'Rafael Moura',
        status: EntityStatus.ACTIVE,
        organizationAffiliations: [],
      });
      mockPrisma.playerMatchStatistic.count.mockResolvedValue(1);
      mockPrisma.playerMatchStatistic.findMany.mockResolvedValue([historyRow]);
      mockStatistics.derive.mockReturnValue({
        fgPct: 0.529,
        threeFgPct: 0.429,
        ftPct: 0.75,
        trueShootingPct: 0.64,
        efficiency: 28,
      });

      await service.findMatches(42, 165, { page: 1, limit: 10 });

      expect(mockPrisma.playerMatchStatistic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            match: expect.objectContaining({
              select: expect.objectContaining({
                teams: expect.objectContaining({
                  where: {
                    organizationId: 42,
                    isDeleted: false,
                    tournamentTeam: { is: { organizationId: 42 } },
                  },
                }),
              }),
            }),
          }),
        }),
      );
    });
  });

  describe('findTournaments', () => {
    it('combines filters, groups before pagination, and applies the complete stable order', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 165,
        name: 'Rafael Moura',
        status: EntityStatus.ACTIVE,
        organizationAffiliations: [],
      });
      const secondTeam = {
        ...historyRow,
        tournamentRosterId: 89,
        tournamentRoster: {
          ...historyRow.tournamentRoster,
          tournamentTeamId: 43,
          tournamentTeam: {
            teamId: 10,
            displayNameSnapshot: 'Medicina PUC',
          },
        },
      };
      const sameStartHigherTournament = {
        ...historyRow,
        tournamentRosterId: 90,
        tournamentRoster: {
          ...historyRow.tournamentRoster,
          tournamentId: 13,
          tournamentTeamId: 44,
          tournamentTeam: {
            teamId: 11,
            displayNameSnapshot: 'Arquitetura PUC',
          },
        },
        match: {
          ...historyRow.match,
          id: 502,
          tournament: {
            ...historyRow.match.tournament,
            id: 13,
            name: 'Intercampi 2026',
          },
        },
      };
      const newerTournament = {
        ...sameStartHigherTournament,
        tournamentRosterId: 91,
        tournamentRoster: {
          ...sameStartHigherTournament.tournamentRoster,
          tournamentId: 10,
          tournamentTeamId: 46,
        },
        match: {
          ...sameStartHigherTournament.match,
          id: 503,
          tournament: {
            ...sameStartHigherTournament.match.tournament,
            id: 10,
            name: 'Copa Primavera',
            startsAt: new Date('2026-09-01T00:00:00.000Z'),
          },
        },
      };
      const undatedTournament = {
        ...sameStartHigherTournament,
        tournamentRosterId: 92,
        tournamentRoster: {
          ...sameStartHigherTournament.tournamentRoster,
          tournamentId: 14,
          tournamentTeamId: 45,
        },
        match: {
          ...sameStartHigherTournament.match,
          id: 504,
          tournament: {
            ...sameStartHigherTournament.match.tournament,
            id: 14,
            name: 'Torneio sem data',
            startsAt: null,
          },
        },
      };
      mockPrisma.playerMatchStatistic.findMany.mockResolvedValue([
        historyRow,
        { ...historyRow, match: { ...historyRow.match, id: 498 } },
        secondTeam,
        sameStartHigherTournament,
        newerTournament,
        undatedTournament,
      ]);
      mockStatistics.aggregate.mockImplementation((lines: unknown[]) => ({
        ...emptyAggregate,
        gamesPlayed: lines.length,
      }));

      const result = await service.findTournaments(42, 165, {
        page: 1,
        limit: 10,
        ids: [10, 12, 13, 14],
        seasonId: 7,
      });

      expect(result.count).toBe(5);
      expect(result.data.map((row) => row.team.tournamentTeamId)).toEqual([
        46, 44, 41, 43, 45,
      ]);
      expect(result.data.map((row) => row.statistics.gamesPlayed)).toEqual([
        1, 1, 2, 1, 1,
      ]);
      expect(mockPrisma.playerMatchStatistic.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { match: { tournamentId: { in: [10, 12, 13, 14] } } },
            { match: { tournament: { seasonId: 7 } } },
          ]),
        }),
        select: expect.any(Object),
      });
    });

    it('returns count zero and no rows when valid filters match no history', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 165,
        name: 'Rafael Moura',
        status: EntityStatus.ACTIVE,
        organizationAffiliations: [],
      });
      mockPrisma.playerMatchStatistic.findMany.mockResolvedValue([]);
      await expect(
        service.findTournaments(42, 165, { page: 1, limit: 10 }),
      ).resolves.toEqual({ count: 0, data: [] });
    });
  });
});
