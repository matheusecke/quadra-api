import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AffiliationStatus,
  BrazilianState,
  EntityStatus,
  LossType,
  MatchResult,
  MatchSide,
  MatchStatus,
  TournamentStatus,
  TournamentTeamStatus,
} from '@prisma/client';
import { TeamsService } from './teams.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import { StatisticsService } from '../statistics/statistics.service';
import { TeamMatchesQueryDto } from './dto/team-profile-query.dto';

const mockPrisma: any = {
  team: {
    create: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  tournament: { findMany: jest.fn() },
  tournamentTeam: { count: jest.fn(), findMany: jest.fn() },
  match: { count: jest.fn(), findMany: jest.fn() },
  matchTeam: { findMany: jest.fn() },
};

const baseTeam = {
  id: 1,
  name: 'São Paulo FC',
  shortName: 'SPF',
  slug: 'sao-paulo-fc',
  city: 'São Paulo',
  state: BrazilianState.SP,
  status: EntityStatus.ACTIVE,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

const statisticLine = (overrides: Record<string, number | null> = {}) => ({
  minutesSeconds: null,
  pts: null,
  reb: null,
  ast: null,
  stl: null,
  blk: null,
  tov: null,
  pf: null,
  fgm: null,
  fga: null,
  threeFgm: null,
  threeFga: null,
  ftm: null,
  fta: null,
  ...overrides,
});

const profileTeam = (overrides: Record<string, unknown> = {}) => ({
  id: 8,
  name: 'Engenharia PUC',
  shortName: 'EPU',
  city: 'Campinas',
  state: BrazilianState.SP,
  status: EntityStatus.ACTIVE,
  organizationAffiliations: [{ id: 4 }],
  ...overrides,
});

const profileMatchRow = {
  id: 501,
  status: MatchStatus.FINISHED,
  scheduledAt: new Date('2026-08-15T19:30:00.000Z'),
  venueName: 'Central Arena',
  tournament: {
    id: 12,
    name: 'Intercursos 2026',
    seasonId: 7,
    season: { label: '2026' },
  },
  periods: [{ homePoints: 78, awayPoints: 72 }],
  teams: [
    {
      side: MatchSide.HOME,
      tournamentTeamId: 41,
      finalScore: 78,
      result: MatchResult.WIN,
      lossType: null,
      isWinner: true,
      tournamentTeam: {
        teamId: 1,
        displayNameSnapshot: 'Engenharia PUC',
        isDeleted: false,
      },
    },
    {
      side: MatchSide.AWAY,
      tournamentTeamId: 42,
      finalScore: 72,
      result: MatchResult.LOSS,
      lossType: LossType.NORMAL,
      isWinner: false,
      tournamentTeam: {
        teamId: 9,
        displayNameSnapshot: 'Direito PUC',
        isDeleted: false,
      },
    },
  ],
};

const statisticMatch = (
  id: number,
  requested: Record<string, unknown>,
  opponent: Record<string, unknown>,
  periods: Array<{ homePoints: number; awayPoints: number }>,
) => ({
  id,
  tournamentTeamId: 101,
  finalScore: requested.finalScore,
  result: requested.result,
  lossType: requested.lossType,
  playerStatistics: requested.playerStatistics ?? [],
  match: {
    status: MatchStatus.FINISHED,
    periods,
    teams: [
      {
        id,
        side: MatchSide.HOME,
        finalScore: requested.finalScore,
        lossType: requested.lossType,
      },
      {
        id: id + 1000,
        side: MatchSide.AWAY,
        finalScore: opponent.finalScore,
        lossType: opponent.lossType,
      },
    ],
  },
});

const tournamentHistoryRow = ({
  tournamentTeamId,
  tournamentId,
  tournamentStatus,
  participationStatus,
  championTournamentTeamId = null,
  startsAt = null,
}: {
  tournamentTeamId: number;
  tournamentId: number;
  tournamentStatus: TournamentStatus;
  participationStatus: TournamentTeamStatus;
  championTournamentTeamId?: number | null;
  startsAt?: Date | null;
}) => ({
  id: tournamentTeamId,
  teamId: 1,
  displayNameSnapshot: 'Engenharia PUC',
  status: participationStatus,
  tournament: {
    id: tournamentId,
    name: `Intercursos ${tournamentId}`,
    seasonId: 7,
    status: tournamentStatus,
    startsAt,
    endsAt: null,
    championTournamentTeamId,
    season: { label: '2026' },
  },
});

describe('TeamsService', () => {
  let service: TeamsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        StatisticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
  });

  describe('create', () => {
    it('returns TeamResponseDto shape on success', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);
      mockPrisma.team.create.mockResolvedValue(baseTeam);

      const result = await service.create({
        name: 'São Paulo FC',
        shortName: 'SPF',
      });

      expect(mockPrisma.team.findFirst).toHaveBeenCalledWith({
        where: { slug: 'sao-paulo-fc', isDeleted: false },
        select: { id: true },
      });
      expect(mockPrisma.team.create).toHaveBeenCalledWith({
        data: { name: 'São Paulo FC', shortName: 'SPF', slug: 'sao-paulo-fc' },
        select: expect.objectContaining({
          id: true,
          name: true,
          shortName: true,
          slug: true,
        }),
      });
      expect(result).toEqual(baseTeam);
    });

    it('throws 409 when slug conflicts with existing team', async () => {
      mockPrisma.team.findFirst.mockResolvedValue({ id: 2 });

      const err = await service
        .create({ name: 'São Paulo FC', shortName: 'SPF' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.CONFLICT);
      expect(mockPrisma.team.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('scopes and filters the catalog through an active organization affiliation', async () => {
      mockPrisma.team.count.mockResolvedValue(1);
      mockPrisma.team.findMany.mockResolvedValue([baseTeam]);

      await service.findAll(42, {
        page: 2,
        limit: 5,
        q: 'São',
        ids: [1, 7],
        status: EntityStatus.ACTIVE,
      });

      const where = {
        AND: [
          { isDeleted: false },
          {
            organizationAffiliations: {
              some: {
                organizationId: 42,
                isDeleted: false,
                status: AffiliationStatus.ACTIVE,
              },
            },
          },
          { status: EntityStatus.ACTIVE },
          { name: { contains: 'São', mode: 'insensitive' } },
          { id: { in: [1, 7] } },
        ],
      };
      expect(mockPrisma.team.count).toHaveBeenCalledWith({ where });
      expect(mockPrisma.team.findMany).toHaveBeenCalledWith({
        where,
        skip: 5,
        take: 5,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: expect.objectContaining({ city: true, state: true }),
      });
    });

    it('returns both entity statuses when status is omitted', async () => {
      mockPrisma.team.count.mockResolvedValue(2);
      mockPrisma.team.findMany.mockResolvedValue([baseTeam]);
      await service.findAll(42, { page: 1, limit: 10 });
      const filters = mockPrisma.team.count.mock.calls[0][0].where.AND;
      expect(filters).not.toContainEqual({ status: expect.anything() });
    });
  });

  describe('findById', () => {
    it('returns DTO when team exists', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(baseTeam);

      const result = await service.findById(1);

      expect(mockPrisma.team.findFirst).toHaveBeenCalledWith({
        where: { id: 1, isDeleted: false },
        select: expect.objectContaining({ id: true, name: true, slug: true }),
      });
      expect(result).toEqual(baseTeam);
    });

    it('throws 404 when team does not exist', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      const err = await service.findById(999).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('findSummary', () => {
    it.each([
      [EntityStatus.ACTIVE, [{ id: 4 }], 'ACTIVE'],
      [EntityStatus.ACTIVE, [], 'HISTORICAL'],
      [EntityStatus.INACTIVE, [{ id: 4 }], 'INACTIVE'],
      [EntityStatus.INACTIVE, [], 'INACTIVE'],
    ])(
      'uses contextual status %s with affiliations %j',
      async (status, organizationAffiliations, expectedStatus) => {
        mockPrisma.team.findFirst.mockResolvedValue(
          profileTeam({ status, organizationAffiliations }),
        );
        mockPrisma.tournament.findMany.mockResolvedValue([]);
        mockPrisma.matchTeam.findMany.mockResolvedValue([]);

        const result = await service.findSummary(42, 8);

        expect(result.team.status).toBe(expectedStatus);
      },
    );

    it('returns 404 before loading titles or statistics when the team is invisible', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      const err = await service.findSummary(42, 8).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockPrisma.team.findFirst).toHaveBeenCalledWith({
        where: {
          id: 8,
          isDeleted: false,
          OR: [
            {
              organizationAffiliations: {
                some: {
                  organizationId: 42,
                  isDeleted: false,
                  status: AffiliationStatus.ACTIVE,
                },
              },
            },
            {
              tournamentTeams: {
                some: {
                  organizationId: 42,
                  isDeleted: false,
                  tournament: {
                    is: { organizationId: 42, isDeleted: false },
                  },
                },
              },
            },
          ],
        },
        select: expect.any(Object),
      });
      expect(mockPrisma.tournament.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.matchTeam.findMany).not.toHaveBeenCalled();
    });

    it('maps valid completed titles and leaves invalid champions out', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(profileTeam());
      mockPrisma.tournament.findMany.mockResolvedValue([
        {
          id: 12,
          name: 'Intercursos 2026',
          seasonId: 7,
          startsAt: new Date('2026-05-02T12:00:00.000Z'),
          endsAt: new Date('2026-06-20T12:00:00.000Z'),
          season: { label: '2026' },
        },
      ]);
      mockPrisma.matchTeam.findMany.mockResolvedValue([]);

      const result = await service.findSummary(42, 8);

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 42,
          isDeleted: false,
          status: TournamentStatus.COMPLETED,
          championTournamentTeam: {
            is: { organizationId: 42, teamId: 8, isDeleted: false },
          },
        },
        orderBy: [
          { startsAt: { sort: 'desc', nulls: 'last' } },
          { id: 'desc' },
        ],
        select: expect.any(Object),
      });
      expect(result.titles).toEqual([
        {
          tournament: {
            id: 12,
            name: 'Intercursos 2026',
            seasonId: 7,
            seasonLabel: '2026',
            startsAt: new Date('2026-05-02T12:00:00.000Z'),
            endsAt: new Date('2026-06-20T12:00:00.000Z'),
          },
        },
      ]);
    });

    it('returns no titles when no valid champion exists', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(profileTeam());
      mockPrisma.tournament.findMany.mockResolvedValue([]);
      mockPrisma.matchTeam.findMany.mockResolvedValue([]);

      expect((await service.findSummary(42, 8)).titles).toEqual([]);
    });

    it('aggregates only public team summary rates without totals', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(profileTeam());
      mockPrisma.tournament.findMany.mockResolvedValue([]);
      mockPrisma.matchTeam.findMany.mockResolvedValue([
        statisticMatch(
          601,
          {
            finalScore: 80,
            result: MatchResult.WIN,
            lossType: LossType.NORMAL,
            playerStatistics: [
              statisticLine({
                minutesSeconds: 1200,
                pts: 20,
                reb: 5,
                ast: 3,
                stl: 1,
                blk: 1,
                tov: 2,
                pf: 2,
                fgm: 8,
                fga: 15,
                threeFgm: 2,
                threeFga: 5,
                ftm: 2,
                fta: 3,
              }),
              statisticLine({
                minutesSeconds: 900,
                pts: 10,
                reb: 7,
                ast: 2,
                stl: 0,
                blk: 0,
                tov: 1,
                pf: 1,
                fgm: 4,
                fga: 8,
                threeFgm: 1,
                threeFga: 3,
                ftm: 1,
                fta: 2,
              }),
            ],
          },
          { finalScore: 70, lossType: LossType.NORMAL },
          [{ homePoints: 80, awayPoints: 70 }],
        ),
        statisticMatch(
          602,
          {
            finalScore: 60,
            result: MatchResult.LOSS,
            lossType: LossType.NORMAL,
            playerStatistics: [
              statisticLine({ reb: 0, stl: 2, tov: 4, pf: 0 }),
            ],
          },
          { finalScore: 65, lossType: LossType.NORMAL },
          [{ homePoints: 60, awayPoints: 65 }],
        ),
        statisticMatch(
          603,
          {
            finalScore: 20,
            result: MatchResult.WIN,
            lossType: LossType.NORMAL,
          },
          { finalScore: 0, lossType: LossType.FORFEIT },
          [],
        ),
        statisticMatch(
          604,
          {
            finalScore: 0,
            result: MatchResult.LOSS,
            lossType: LossType.DEFAULT,
          },
          { finalScore: 2, lossType: LossType.NORMAL },
          [{ homePoints: 5, awayPoints: 10 }],
        ),
      ]);

      const result = await service.findSummary(42, 8);

      expect(result.statistics).toEqual({
        results: {
          measuredGames: 4,
          winRate: 0.5,
          scoreMeasuredGames: 2,
          pointsForPerGame: 70,
          pointsAgainstPerGame: 67.5,
          pointDiffPerGame: 2.5,
        },
        boxScore: {
          measuredGames: { reb: 2, ast: 1, stl: 2, blk: 1, tov: 2, pf: 2 },
          perGame: { reb: 6, ast: 5, stl: 1.5, blk: 1, tov: 3.5, pf: 1.5 },
          shooting: {
            fgPct: 0.522,
            threeFgPct: 0.375,
            ftPct: 0.6,
            trueShootingPct: 0.595,
          },
          efficiency: { measuredGames: 1, perGame: 33 },
        },
      });
      expect(JSON.stringify(result)).not.toContain('totals');
    });
  });

  describe('findMatches', () => {
    beforeEach(() => {
      mockPrisma.team.findFirst.mockResolvedValue(profileTeam());
    });

    it('rejects a missing or unsupported scope at the DTO boundary', async () => {
      const missing = await validate(plainToInstance(TeamMatchesQueryDto, {}));
      const unsupported = await validate(
        plainToInstance(TeamMatchesQueryDto, { scope: 'all' }),
      );

      expect(missing.map((error) => error.property)).toContain('scope');
      expect(unsupported.map((error) => error.property)).toContain('scope');
    });

    it('paginates LIVE before scheduled and postponed without loading either full set', async () => {
      mockPrisma.match.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3);
      mockPrisma.match.findMany
        .mockResolvedValueOnce([
          { ...profileMatchRow, id: 503, status: MatchStatus.LIVE },
          { ...profileMatchRow, id: 504, status: MatchStatus.LIVE },
        ])
        .mockResolvedValueOnce([
          { ...profileMatchRow, id: 505, status: MatchStatus.SCHEDULED },
        ]);

      const result = await service.findMatches(42, 1, {
        scope: 'upcoming',
        page: 1,
        limit: 3,
      });

      expect(result.count).toBe(5);
      expect(result.data.map((item) => item.match.id)).toEqual([503, 504, 505]);
      expect(mockPrisma.match.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          skip: 0,
          take: 2,
          orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        }),
      );
      expect(mockPrisma.match.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          skip: 0,
          take: 1,
          orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        }),
      );
      expect(mockPrisma.match.count.mock.calls[0][0].where.status).toBe(
        MatchStatus.LIVE,
      );
      expect(mockPrisma.match.count.mock.calls[1][0].where.status).toEqual({
        in: [MatchStatus.SCHEDULED, MatchStatus.POSTPONED],
      });
    });

    it('continues a later upcoming page inside the scheduled/postponed set', async () => {
      mockPrisma.match.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
      mockPrisma.match.findMany.mockResolvedValueOnce([
        { ...profileMatchRow, id: 506, status: MatchStatus.POSTPONED },
        { ...profileMatchRow, id: 507, status: MatchStatus.SCHEDULED },
        { ...profileMatchRow, id: 508, status: MatchStatus.SCHEDULED },
      ]);

      await service.findMatches(42, 1, {
        scope: 'upcoming',
        page: 2,
        limit: 3,
      });

      expect(mockPrisma.match.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 1, take: 3 }),
      );
    });

    it('returns only finished/cancelled history in descending deterministic order', async () => {
      mockPrisma.match.count.mockResolvedValue(1);
      mockPrisma.match.findMany.mockResolvedValue([profileMatchRow]);

      const result = await service.findMatches(42, 1, {
        scope: 'history',
        page: 1,
        limit: 10,
      });

      expect(mockPrisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
          where: expect.objectContaining({
            organizationId: 42,
            isDeleted: false,
            status: { in: [MatchStatus.FINISHED, MatchStatus.CANCELLED] },
            tournament: { is: { organizationId: 42, isDeleted: false } },
            teams: {
              some: {
                organizationId: 42,
                isDeleted: false,
                tournamentTeam: {
                  is: { organizationId: 42, teamId: 1, isDeleted: false },
                },
              },
            },
          }),
        }),
      );
      expect(result.data).toEqual([
        {
          match: {
            id: 501,
            status: MatchStatus.FINISHED,
            scheduledAt: new Date('2026-08-15T19:30:00.000Z'),
            venueName: 'Central Arena',
            scoreSource: 'PERIODS',
          },
          tournament: {
            id: 12,
            name: 'Intercursos 2026',
            seasonId: 7,
            seasonLabel: '2026',
          },
          team: {
            tournamentTeamId: 41,
            teamId: 1,
            name: 'Engenharia PUC',
            score: 78,
            result: MatchResult.WIN,
            lossType: null,
            isWinner: true,
          },
          opponent: {
            tournamentTeamId: 42,
            teamId: 9,
            name: 'Direito PUC',
            score: 72,
            result: MatchResult.LOSS,
            lossType: LossType.NORMAL,
            isWinner: false,
          },
        },
      ]);
    });

    it('masks scores and results for non-finished rows', async () => {
      mockPrisma.match.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      mockPrisma.match.findMany.mockResolvedValueOnce([
        { ...profileMatchRow, status: MatchStatus.SCHEDULED },
      ]);

      const result = await service.findMatches(42, 1, {
        scope: 'upcoming',
        page: 1,
        limit: 10,
      });

      expect(result.data[0].match.scoreSource).toBeNull();
      expect(result.data[0].team).toMatchObject({
        score: null,
        result: null,
        lossType: null,
        isWinner: null,
      });
      expect(result.data[0].opponent).toMatchObject({
        score: null,
        result: null,
        lossType: null,
        isWinner: null,
      });
    });

    it('checks visibility before querying matches', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      const err = await service
        .findMatches(42, 1, { scope: 'history', page: 1, limit: 10 })
        .catch((error: unknown) => error);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);

      expect(mockPrisma.match.count).not.toHaveBeenCalled();
      expect(mockPrisma.match.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findTournaments', () => {
    beforeEach(() => {
      mockPrisma.team.findFirst.mockResolvedValue(profileTeam());
      mockPrisma.matchTeam.findMany.mockResolvedValue([]);
    });

    it('returns active and withdrawn participations across tournament statuses in deterministic order', async () => {
      const statuses = [
        TournamentStatus.DRAFT,
        TournamentStatus.REGISTRATION,
        TournamentStatus.IN_PROGRESS,
        TournamentStatus.COMPLETED,
        TournamentStatus.CANCELLED,
      ];
      mockPrisma.tournamentTeam.count.mockResolvedValue(statuses.length);
      mockPrisma.tournamentTeam.findMany.mockResolvedValue(
        statuses.map((tournamentStatus, index) => {
          const tournamentTeamId = 41 + index;
          return tournamentHistoryRow({
            tournamentTeamId,
            tournamentId: 12 + index,
            tournamentStatus,
            participationStatus:
              index % 2 === 0
                ? TournamentTeamStatus.ACTIVE
                : TournamentTeamStatus.WITHDRAWN,
            championTournamentTeamId:
              tournamentStatus === TournamentStatus.COMPLETED
                ? tournamentTeamId
                : null,
            startsAt: index === 0 ? new Date('2026-05-02T12:00:00.000Z') : null,
          });
        }),
      );

      const result = await service.findTournaments(42, 1, {
        page: 1,
        limit: 10,
      });

      const where = {
        organizationId: 42,
        teamId: 1,
        isDeleted: false,
        tournament: { is: { organizationId: 42, isDeleted: false } },
      };
      expect(mockPrisma.tournamentTeam.count).toHaveBeenCalledWith({ where });
      expect(mockPrisma.tournamentTeam.findMany).toHaveBeenCalledWith({
        where,
        skip: 0,
        take: 10,
        orderBy: [
          { tournament: { startsAt: { sort: 'desc', nulls: 'last' } } },
          { tournamentId: 'desc' },
          { id: 'asc' },
        ],
        select: expect.any(Object),
      });
      expect(result.count).toBe(statuses.length);
      expect(
        result.data.map((item) => ({
          tournamentStatus: item.tournament.status,
          participationStatus: item.team.status,
          isChampion: item.team.isChampion,
        })),
      ).toEqual(
        statuses.map((tournamentStatus, index) => ({
          tournamentStatus,
          participationStatus:
            index % 2 === 0
              ? TournamentTeamStatus.ACTIVE
              : TournamentTeamStatus.WITHDRAWN,
          isChampion: tournamentStatus === TournamentStatus.COMPLETED,
        })),
      );
      expect(JSON.stringify(result)).not.toContain('"totals"');
    });

    it('loads finished statistics only for participations on the current page', async () => {
      mockPrisma.tournamentTeam.count.mockResolvedValue(2);
      mockPrisma.tournamentTeam.findMany.mockResolvedValue([
        tournamentHistoryRow({
          tournamentTeamId: 41,
          tournamentId: 12,
          tournamentStatus: TournamentStatus.IN_PROGRESS,
          participationStatus: TournamentTeamStatus.ACTIVE,
        }),
        tournamentHistoryRow({
          tournamentTeamId: 77,
          tournamentId: 19,
          tournamentStatus: TournamentStatus.CANCELLED,
          participationStatus: TournamentTeamStatus.WITHDRAWN,
        }),
      ]);
      mockPrisma.matchTeam.findMany.mockResolvedValue([
        {
          ...statisticMatch(
            601,
            { finalScore: 80, result: MatchResult.WIN },
            { finalScore: 70 },
            [{ homePoints: 80, awayPoints: 70 }],
          ),
          tournamentTeamId: 41,
        },
        {
          ...statisticMatch(
            602,
            { finalScore: 60, result: MatchResult.LOSS },
            { finalScore: 65 },
            [{ homePoints: 60, awayPoints: 65 }],
          ),
          tournamentTeamId: 77,
        },
      ]);

      const result = await service.findTournaments(42, 1, {
        page: 2,
        limit: 2,
      });

      expect(mockPrisma.matchTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tournamentTeam: {
              is: expect.objectContaining({ id: { in: [41, 77] } }),
            },
            match: {
              is: expect.objectContaining({ status: MatchStatus.FINISHED }),
            },
          }),
        }),
      );
      expect(result.data[0].statistics.results).toMatchObject({
        measuredGames: 1,
        winRate: 1,
        pointsForPerGame: 80,
      });
      expect(result.data[1].statistics.results).toMatchObject({
        measuredGames: 1,
        winRate: 0,
        pointsForPerGame: 60,
      });
    });

    it('returns an empty page without issuing an empty-id statistics query', async () => {
      mockPrisma.tournamentTeam.count.mockResolvedValue(0);
      mockPrisma.tournamentTeam.findMany.mockResolvedValue([]);

      const result = await service.findTournaments(42, 1, {
        page: 1,
        limit: 10,
      });

      expect(result).toEqual({ count: 0, data: [] });
      expect(mockPrisma.matchTeam.findMany).not.toHaveBeenCalled();
    });

    it('checks visibility before querying tournament participations', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      const err = await service
        .findTournaments(42, 1, { page: 1, limit: 10 })
        .catch((error: unknown) => error);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockPrisma.tournamentTeam.count).not.toHaveBeenCalled();
      expect(mockPrisma.tournamentTeam.findMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('returns updated DTO on success', async () => {
      mockPrisma.team.findFirst
        .mockResolvedValueOnce({ id: 1, slug: 'sao-paulo-fc' })
        .mockResolvedValueOnce(null);
      mockPrisma.team.update.mockResolvedValue({
        ...baseTeam,
        name: 'São Paulo FC Updated',
        slug: 'sao-paulo-fc-updated',
      });

      const result = await service.update(1, { name: 'São Paulo FC Updated' });

      expect(mockPrisma.team.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'São Paulo FC Updated', slug: 'sao-paulo-fc-updated' },
        select: expect.objectContaining({ id: true }),
      });
      expect(result.name).toBe('São Paulo FC Updated');
    });

    it('throws 404 when team does not exist', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      const err = await service
        .update(999, { name: 'Does not exist' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('throws 409 when new slug conflicts with another existing team', async () => {
      mockPrisma.team.findFirst
        .mockResolvedValueOnce({ id: 1, slug: 'old-slug' })
        .mockResolvedValueOnce({ id: 5 });

      const err = await service
        .update(1, { name: 'Conflicting Name' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.CONFLICT);
      expect(mockPrisma.team.update).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('returns updated DTO on success', async () => {
      mockPrisma.team.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.team.update.mockResolvedValue({
        ...baseTeam,
        status: EntityStatus.INACTIVE,
      });

      const result = await service.updateStatus(1, {
        status: EntityStatus.INACTIVE,
      });

      expect(mockPrisma.team.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: EntityStatus.INACTIVE },
        select: expect.objectContaining({ id: true, status: true }),
      });
      expect(result.status).toBe(EntityStatus.INACTIVE);
    });

    it('throws 404 when team does not exist', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      const err = await service
        .updateStatus(999, { status: EntityStatus.INACTIVE })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('softDelete', () => {
    it('calls team.update with isDeleted:true and status:INACTIVE on success', async () => {
      mockPrisma.team.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.team.update.mockResolvedValue({ id: 1 });

      await service.softDelete(1);

      expect(mockPrisma.team.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isDeleted: true, status: EntityStatus.INACTIVE },
      });
    });

    it('throws 404 when team does not exist', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      const err = await service.softDelete(999).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockPrisma.team.update).not.toHaveBeenCalled();
    });
  });
});
