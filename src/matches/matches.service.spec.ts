import { HttpStatus } from '@nestjs/common';
import { expect, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  LossType,
  MatchResult,
  MatchSide,
  MatchStatus,
  PeriodType,
  Prisma,
  TournamentFormat,
  TournamentStatus,
  TournamentTeamStatus,
} from '@prisma/client';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  MatchesService,
  matchDetailSelect,
  matchSummarySelect,
  matchUpdateTargetSelect,
} from './matches.service';

type AsyncMock = jest.Mock<(input?: unknown) => Promise<unknown>>;
const asyncMock = (): AsyncMock =>
  jest.fn<(input?: unknown) => Promise<unknown>>();

type MockClient = {
  match: {
    count: AsyncMock;
    findMany: AsyncMock;
    findFirst: AsyncMock;
    create: AsyncMock;
    update: AsyncMock;
    updateMany: AsyncMock;
  };
  matchTeam: { update: AsyncMock; updateMany: AsyncMock };
  tournament: { findFirst: AsyncMock };
  tournamentGroup: { findFirst: AsyncMock };
  tournamentTeam: { findFirst: AsyncMock };
  tournamentGroupTeam: { findFirst: AsyncMock };
  tournamentBracketSlot: {
    findFirst: AsyncMock;
    update: AsyncMock;
    updateMany: AsyncMock;
  };
  matchPeriod: { findFirst: AsyncMock };
  matchRoster: { findFirst: AsyncMock };
  playerMatchStatistic: { findFirst: AsyncMock };
};

type TransactionMock = jest.Mock<
  (
    callback: (tx: MockClient) => unknown,
    options?: { isolationLevel: Prisma.TransactionIsolationLevel },
  ) => Promise<unknown>
>;

type MockPrisma = MockClient & { $transaction: TransactionMock };

const makeClient = (): MockClient => ({
  match: {
    count: asyncMock(),
    findMany: asyncMock(),
    findFirst: asyncMock(),
    create: asyncMock(),
    update: asyncMock(),
    updateMany: asyncMock(),
  },
  matchTeam: { update: asyncMock(), updateMany: asyncMock() },
  tournament: { findFirst: asyncMock() },
  tournamentGroup: { findFirst: asyncMock() },
  tournamentTeam: { findFirst: asyncMock() },
  tournamentGroupTeam: { findFirst: asyncMock() },
  tournamentBracketSlot: {
    findFirst: asyncMock(),
    update: asyncMock(),
    updateMany: asyncMock(),
  },
  matchPeriod: { findFirst: asyncMock() },
  matchRoster: { findFirst: asyncMock() },
  playerMatchStatistic: { findFirst: asyncMock() },
});

const mockTx = makeClient();
const mockPrisma = {
  ...makeClient(),
  $transaction:
    jest.fn<
      (
        callback: (tx: MockClient) => unknown,
        options?: { isolationLevel: Prisma.TransactionIsolationLevel },
      ) => Promise<unknown>
    >(),
} satisfies MockPrisma;

const scheduledAt = new Date('2026-08-15T19:30:00.000Z');

const summaryRow = {
  id: 501,
  tournamentId: 12,
  tournamentGroupId: 7 as number | null,
  matchNumber: 18 as number | null,
  status: MatchStatus.SCHEDULED,
  scheduledAt,
  startedAt: null as Date | null,
  endedAt: null as Date | null,
  venueName: 'Central Arena' as string | null,
  teams: [
    {
      side: MatchSide.HOME,
      tournamentTeamId: 41,
      finalScore: null as number | null,
      result: null as MatchResult | null,
      lossType: null as LossType | null,
      isWinner: null as boolean | null,
      tournamentTeam: { displayNameSnapshot: 'Engineering' },
    },
    {
      side: MatchSide.AWAY,
      tournamentTeamId: 52,
      finalScore: null as number | null,
      result: null as MatchResult | null,
      lossType: null as LossType | null,
      isWinner: null as boolean | null,
      tournamentTeam: { displayNameSnapshot: 'Law' },
    },
  ],
  periods: [] as { homePoints: number; awayPoints: number }[],
  bracketSlots: [] as {
    round: { id: number; number: number; label: string | null };
  }[],
};

const detailRow = {
  ...summaryRow,
  periods: [] as {
    id: number;
    periodNumber: number;
    periodType: PeriodType;
    homePoints: number;
    awayPoints: number;
    startedAt: Date | null;
    endedAt: Date | null;
  }[],
  playerStatistics: [] as {
    tournamentRosterId: number;
    pts: number | null;
    fgm: number | null;
    fga: number | null;
    threeFgm: number | null;
    threeFga: number | null;
    ftm: number | null;
    fta: number | null;
    reb: number | null;
    ast: number | null;
    stl: number | null;
    blk: number | null;
    tov: number | null;
    pf: number | null;
    minutesSeconds: number | null;
    matchTeam: { side: MatchSide };
    matchRoster: {
      displayNameSnapshot: string;
      isDeleted: boolean;
    } | null;
    tournamentRoster: {
      tournamentTeamId: number;
      displayNameSnapshot: string;
    };
  }[],
  mvpMatchRoster: null as {
    tournamentRosterId: number;
    displayNameSnapshot: string;
    isDeleted: boolean;
  } | null,
};

const updateTargetRow = {
  id: 501,
  tournamentId: 12,
  tournamentGroupId: 7 as number | null,
  matchNumber: 18 as number | null,
  scheduledAt,
  venueName: 'Central Arena' as string | null,
  status: MatchStatus.SCHEDULED,
  tournament: { format: TournamentFormat.GROUP_STAGE },
  teams: [
    { id: 601, side: MatchSide.HOME, tournamentTeamId: 41 },
    { id: 602, side: MatchSide.AWAY, tournamentTeamId: 52 },
  ],
  bracketSlots: [] as {
    id: number;
    homeTournamentTeamId: number | null;
    awayTournamentTeamId: number | null;
  }[],
};

async function captureApiException(
  promise: Promise<unknown>,
): Promise<ApiException> {
  return promise.then(
    () => {
      throw new Error('Expected ApiException');
    },
    (error: unknown) => error as ApiException,
  );
}

function apiError(error: ApiException): { code: string; message: string } {
  const response = error.getResponse() as {
    error: { code: string; message: string };
  };
  const { code, message } = response.error;
  return { code, message };
}

function p2034(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Serialization conflict', {
    code: 'P2034',
    clientVersion: '7.7.0',
  });
}

describe('MatchesService', () => {
  let service: MatchesService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrisma.$transaction.mockImplementation((callback) =>
      Promise.resolve(callback(mockTx)),
    );
    const module = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(MatchesService);
  });

  function arrangeCreateReferences(
    format: TournamentFormat = TournamentFormat.GROUP_STAGE,
    status: TournamentStatus = TournamentStatus.REGISTRATION,
  ): void {
    mockPrisma.tournament.findFirst.mockResolvedValue({
      id: 12,
      format,
      status,
    });
    mockPrisma.tournamentGroup.findFirst.mockResolvedValue({
      id: 7,
      tournamentId: 12,
    });
    mockPrisma.tournamentTeam.findFirst
      .mockResolvedValueOnce({
        id: 41,
        tournamentId: 12,
        status: TournamentTeamStatus.ACTIVE,
      })
      .mockResolvedValueOnce({
        id: 52,
        tournamentId: 12,
        status: TournamentTeamStatus.ACTIVE,
      });
    mockPrisma.tournamentGroupTeam.findFirst.mockResolvedValue({ id: 801 });
    mockPrisma.match.create.mockResolvedValue(detailRow);
  }

  describe('reads', () => {
    it('combines tenant scope, filters, pagination, and ordering', async () => {
      mockPrisma.match.count.mockResolvedValue(1);
      mockPrisma.match.findMany.mockResolvedValue([summaryRow]);

      const result = await service.findAll(42, {
        page: 2,
        limit: 10,
        q: 'engineering',
        ids: [501, 508],
        tournamentId: 12,
        tournamentTeamIds: [41, 52],
        status: MatchStatus.SCHEDULED,
      });

      const expectedWhere = {
        organizationId: 42,
        isDeleted: false,
        tournament: { organizationId: 42, isDeleted: false },
        id: { in: [501, 508] },
        tournamentId: 12,
        status: MatchStatus.SCHEDULED,
        AND: [
          {
            teams: {
              some: {
                isDeleted: false,
                tournamentTeam: {
                  displayNameSnapshot: {
                    contains: 'engineering',
                    mode: 'insensitive',
                  },
                },
              },
            },
          },
          {
            teams: {
              some: {
                isDeleted: false,
                tournamentTeamId: { in: [41, 52] },
              },
            },
          },
        ],
      };
      expect(mockPrisma.match.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
      expect(mockPrisma.match.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        skip: 10,
        take: 10,
        orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
        select: matchSummarySelect,
      });
      expect(result.count).toBe(1);
      expect(result.data[0]).not.toHaveProperty('periods');
    });

    it('returns an empty page without throwing', async () => {
      mockPrisma.match.count.mockResolvedValue(0);
      mockPrisma.match.findMany.mockResolvedValue([]);
      await expect(
        service.findAll(42, { page: 1, limit: 10 }),
      ).resolves.toEqual({ count: 0, data: [] });
    });

    it('validates the tournament before a scoped empty list', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(null);
      const error = await captureApiException(
        service.findAllByTournament(42, 12, { page: 1, limit: 10 }),
      );
      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(apiError(error)).toEqual({
        code: 'RECORD_NOT_FOUND',
        message: 'Tournament not found',
      });
      expect(mockPrisma.match.count).not.toHaveBeenCalled();
    });

    it('uses the path tournament and the same nested-list filters', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({ id: 12 });
      mockPrisma.match.count.mockResolvedValue(0);
      mockPrisma.match.findMany.mockResolvedValue([]);
      await service.findAllByTournament(42, 12, {
        page: 1,
        limit: 5,
        ids: [501],
        tournamentTeamIds: [41],
        status: MatchStatus.POSTPONED,
      });
      expect(mockPrisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tournamentId: 12,
            id: { in: [501] },
            status: MatchStatus.POSTPONED,
            AND: [
              {
                teams: {
                  some: {
                    isDeleted: false,
                    tournamentTeamId: { in: [41] },
                  },
                },
              },
            ],
          }),
          take: 5,
        }),
      );
    });

    it('maps detail ordering, roster fallback, MVP, and PERIODS', async () => {
      mockPrisma.match.findFirst.mockResolvedValue({
        ...detailRow,
        status: MatchStatus.FINISHED,
        teams: detailRow.teams.map((team, index) => ({
          ...team,
          finalScore: index === 0 ? 78 : 72,
          result: index === 0 ? MatchResult.WIN : MatchResult.LOSS,
          lossType: index === 0 ? null : LossType.NORMAL,
          isWinner: index === 0,
        })),
        bracketSlots: [{ round: { id: 31, number: 2, label: 'Semifinals' } }],
        periods: [
          {
            id: 702,
            periodNumber: 2,
            periodType: PeriodType.REGULAR,
            homePoints: 18,
            awayPoints: 17,
            startedAt: null,
            endedAt: null,
          },
          {
            id: 701,
            periodNumber: 1,
            periodType: PeriodType.REGULAR,
            homePoints: 20,
            awayPoints: 18,
            startedAt: null,
            endedAt: null,
          },
        ],
        playerStatistics: [
          {
            tournamentRosterId: 99,
            pts: 10,
            fgm: null,
            fga: null,
            threeFgm: null,
            threeFga: null,
            ftm: null,
            fta: null,
            reb: null,
            ast: null,
            stl: null,
            blk: null,
            tov: null,
            pf: null,
            minutesSeconds: null,
            matchTeam: { side: MatchSide.AWAY },
            matchRoster: null,
            tournamentRoster: {
              tournamentTeamId: 52,
              displayNameSnapshot: 'Legacy Player',
            },
          },
          {
            tournamentRosterId: 88,
            pts: 24,
            fgm: 9,
            fga: 17,
            threeFgm: 3,
            threeFga: 7,
            ftm: 3,
            fta: 4,
            reb: 8,
            ast: 5,
            stl: 2,
            blk: 1,
            tov: 3,
            pf: 2,
            minutesSeconds: 1980,
            matchTeam: { side: MatchSide.HOME },
            matchRoster: {
              displayNameSnapshot: 'Ana Silva',
              isDeleted: false,
            },
            tournamentRoster: {
              tournamentTeamId: 41,
              displayNameSnapshot: 'Old Ana Name',
            },
          },
        ],
        mvpMatchRoster: {
          tournamentRosterId: 88,
          displayNameSnapshot: 'Ana Silva',
          isDeleted: false,
        },
      });

      const result = await service.findOne(42, 501);

      expect(mockPrisma.match.findFirst).toHaveBeenCalledWith({
        where: {
          id: 501,
          organizationId: 42,
          isDeleted: false,
          tournament: { organizationId: 42, isDeleted: false },
        },
        select: matchDetailSelect,
      });
      expect(result.bracketRound).toEqual({
        id: 31,
        number: 2,
        label: 'Semifinals',
      });
      expect(result.periods.map((period) => period.periodNumber)).toEqual([
        1, 2,
      ]);
      expect(result.playerStats.map((stat) => stat.displayName)).toEqual([
        'Ana Silva',
        'Legacy Player',
      ]);
      expect(result.mvp).toEqual({
        tournamentRosterId: 88,
        displayName: 'Ana Silva',
      });
      expect(result.scoreSource).toBe('PERIODS');
    });

    it.each([
      [LossType.FORFEIT, 0, 0, 'AWARDED'],
      [LossType.DEFAULT, 20, 18, 'AWARDED'],
      [LossType.DEFAULT, 78, 72, 'PERIODS'],
    ] as const)(
      'derives score source for %s with period totals %i-%i',
      async (lossType, homePoints, awayPoints, expected) => {
        mockPrisma.match.findFirst.mockResolvedValue({
          ...detailRow,
          status: MatchStatus.FINISHED,
          teams: detailRow.teams.map((team, index) => ({
            ...team,
            finalScore: index === 0 ? 78 : 72,
            result: index === 0 ? MatchResult.WIN : MatchResult.LOSS,
            lossType: index === 0 ? null : lossType,
            isWinner: index === 0,
          })),
          periods:
            lossType === LossType.FORFEIT
              ? []
              : [
                  {
                    id: 701,
                    periodNumber: 1,
                    periodType: PeriodType.REGULAR,
                    homePoints,
                    awayPoints,
                    startedAt: null,
                    endedAt: null,
                  },
                ],
        });
        const result = await service.findOne(42, 501);
        expect(result.scoreSource).toBe(expected);
        if (lossType === LossType.FORFEIT) {
          expect(result).toMatchObject({
            periods: [],
            playerStats: [],
            mvp: null,
          });
        }
      },
    );

    it('derives AWARDED on a summary row without exposing periods', async () => {
      mockPrisma.match.count.mockResolvedValue(1);
      mockPrisma.match.findMany.mockResolvedValue([
        {
          ...summaryRow,
          status: MatchStatus.FINISHED,
          teams: summaryRow.teams.map((team, index) => ({
            ...team,
            finalScore: index === 0 ? 78 : 72,
            result: index === 0 ? MatchResult.WIN : MatchResult.LOSS,
            lossType: index === 0 ? null : LossType.DEFAULT,
            isWinner: index === 0,
          })),
          periods: [{ homePoints: 20, awayPoints: 18 }],
        },
      ]);
      const result = await service.findAll(42, { page: 1, limit: 10 });
      expect(result.data[0].scoreSource).toBe('AWARDED');
      expect(result.data[0]).not.toHaveProperty('periods');
    });

    it('falls back from a deleted match-roster snapshot and hides a deleted MVP', async () => {
      mockPrisma.match.findFirst.mockResolvedValue({
        ...detailRow,
        playerStatistics: [
          {
            tournamentRosterId: 88,
            pts: null,
            fgm: null,
            fga: null,
            threeFgm: null,
            threeFga: null,
            ftm: null,
            fta: null,
            reb: null,
            ast: null,
            stl: null,
            blk: null,
            tov: null,
            pf: null,
            minutesSeconds: null,
            matchTeam: { side: MatchSide.HOME },
            matchRoster: {
              displayNameSnapshot: 'Deleted snapshot',
              isDeleted: true,
            },
            tournamentRoster: {
              tournamentTeamId: 41,
              displayNameSnapshot: 'Roster fallback',
            },
          },
        ],
        mvpMatchRoster: {
          tournamentRosterId: 88,
          displayNameSnapshot: 'Deleted snapshot',
          isDeleted: true,
        },
      });
      const result = await service.findOne(42, 501);
      expect(result.playerStats[0].displayName).toBe('Roster fallback');
      expect(result.mvp).toBeNull();
    });

    it('hides persisted scoresheet relations for a forfeit result', async () => {
      mockPrisma.match.findFirst.mockResolvedValue({
        ...detailRow,
        status: MatchStatus.FINISHED,
        teams: detailRow.teams.map((team, index) => ({
          ...team,
          finalScore: index === 0 ? 20 : 0,
          result: index === 0 ? MatchResult.WIN : MatchResult.LOSS,
          lossType: index === 0 ? null : LossType.FORFEIT,
          isWinner: index === 0,
        })),
        periods: [
          {
            id: 701,
            periodNumber: 1,
            periodType: PeriodType.REGULAR,
            homePoints: 10,
            awayPoints: 0,
            startedAt: null,
            endedAt: null,
          },
        ],
        playerStatistics: [
          {
            tournamentRosterId: 88,
            pts: 10,
            fgm: null,
            fga: null,
            threeFgm: null,
            threeFga: null,
            ftm: null,
            fta: null,
            reb: null,
            ast: null,
            stl: null,
            blk: null,
            tov: null,
            pf: null,
            minutesSeconds: null,
            matchTeam: { side: MatchSide.HOME },
            matchRoster: null,
            tournamentRoster: {
              tournamentTeamId: 41,
              displayNameSnapshot: 'Ana Silva',
            },
          },
        ],
        mvpMatchRoster: {
          tournamentRosterId: 88,
          displayNameSnapshot: 'Ana Silva',
          isDeleted: false,
        },
      });
      await expect(service.findOne(42, 501)).resolves.toMatchObject({
        scoreSource: 'AWARDED',
        periods: [],
        playerStats: [],
        mvp: null,
      });
    });

    it('hides persisted result fields while a match is not finished', async () => {
      mockPrisma.match.findFirst.mockResolvedValue({
        ...detailRow,
        teams: detailRow.teams.map((team) => ({
          ...team,
          finalScore: 20,
          result: MatchResult.WIN,
          isWinner: true,
        })),
      });
      const result = await service.findOne(42, 501);
      expect(result.scoreSource).toBeNull();
      expect(result.homeTeam).toMatchObject({
        score: null,
        result: null,
        lossType: null,
        isWinner: null,
      });
    });

    it('returns the exact 404 for a missing match', async () => {
      mockPrisma.match.findFirst.mockResolvedValue(null);
      const error = await captureApiException(service.findOne(42, 501));
      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(apiError(error)).toEqual({
        code: 'RECORD_NOT_FOUND',
        message: 'Match not found',
      });
    });
  });

  describe('create', () => {
    const dto = {
      tournamentId: 12,
      tournamentGroupId: 7,
      matchNumber: 18,
      scheduledAt: '2026-08-15T19:30:00.000Z',
      venueName: 'Central Arena',
      homeTournamentTeamId: 41,
      awayTournamentTeamId: 52,
    };

    it('creates one scheduled match and two sides atomically', async () => {
      arrangeCreateReferences();
      await service.create(42, 7, dto);
      expect(mockPrisma.match.create).toHaveBeenCalledWith({
        data: {
          organizationId: 42,
          tournamentId: 12,
          tournamentGroupId: 7,
          matchNumber: 18,
          scheduledAt,
          venueName: 'Central Arena',
          status: MatchStatus.SCHEDULED,
          createdByUserId: 7,
          teams: {
            create: [
              {
                organizationId: 42,
                tournamentTeamId: 41,
                side: MatchSide.HOME,
              },
              {
                organizationId: 42,
                tournamentTeamId: 52,
                side: MatchSide.AWAY,
              },
            ],
          },
        },
        select: matchDetailSelect,
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.tournamentBracketSlot.update).not.toHaveBeenCalled();
      expect(mockPrisma.matchPeriod.findFirst).not.toHaveBeenCalled();
    });

    it('returns 404 before reference validation for a missing tournament', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(null);
      const error = await captureApiException(service.create(42, 7, dto));
      expect(apiError(error)).toEqual({
        code: 'RECORD_NOT_FOUND',
        message: 'Tournament not found',
      });
      expect(mockPrisma.tournamentGroup.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.tournamentTeam.findFirst).not.toHaveBeenCalled();
    });

    it('persists omitted nullable fields as null', async () => {
      arrangeCreateReferences(TournamentFormat.LEAGUE);
      await service.create(42, 7, {
        tournamentId: 12,
        scheduledAt: dto.scheduledAt,
        homeTournamentTeamId: 41,
        awayTournamentTeamId: 52,
      });
      expect(mockPrisma.match.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tournamentGroupId: null,
            matchNumber: null,
            venueName: null,
          }),
        }),
      );
    });

    it.each([
      TournamentStatus.DRAFT,
      TournamentStatus.REGISTRATION,
      TournamentStatus.IN_PROGRESS,
    ])('creates while the tournament is %s', async (status) => {
      arrangeCreateReferences(TournamentFormat.GROUP_STAGE, status);
      await expect(service.create(42, 7, dto)).resolves.toBeDefined();
    });

    it.each([TournamentStatus.COMPLETED, TournamentStatus.CANCELLED])(
      'rejects creation while the tournament is %s',
      async (status) => {
        arrangeCreateReferences(TournamentFormat.GROUP_STAGE, status);
        const error = await captureApiException(service.create(42, 7, dto));
        expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
        expect(apiError(error)).toEqual({
          code: 'TOURNAMENT_NOT_MUTABLE',
          message:
            'Matches cannot be created for a completed or cancelled tournament.',
        });
        expect(mockPrisma.match.create).not.toHaveBeenCalled();
      },
    );

    it.each([TournamentFormat.LEAGUE, TournamentFormat.KNOCKOUT])(
      'rejects a group for %s',
      async (format) => {
        arrangeCreateReferences(format);
        const error = await captureApiException(service.create(42, 7, dto));
        expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(apiError(error)).toEqual({
          code: 'INVALID_TOURNAMENT_FORMAT',
          message: 'This tournament format does not have a group stage.',
        });
        expect(mockPrisma.tournamentGroup.findFirst).not.toHaveBeenCalled();
      },
    );

    it('returns 404 for a missing or cross-tenant group', async () => {
      arrangeCreateReferences();
      mockPrisma.tournamentGroup.findFirst.mockResolvedValue(null);
      const error = await captureApiException(service.create(42, 7, dto));
      expect(apiError(error)).toEqual({
        code: 'RECORD_NOT_FOUND',
        message: 'Tournament group not found',
      });
    });

    it('rejects a group from another tournament', async () => {
      arrangeCreateReferences();
      mockPrisma.tournamentGroup.findFirst.mockResolvedValue({
        id: 7,
        tournamentId: 99,
      });
      const error = await captureApiException(service.create(42, 7, dto));
      expect(apiError(error)).toEqual({
        code: 'INVALID_GROUP_ASSIGNMENT',
        message: 'The tournament group must belong to the match tournament.',
      });
    });

    it.each([
      [
        'home',
        null,
        { id: 52, tournamentId: 12, status: TournamentTeamStatus.ACTIVE },
      ],
      [
        'away',
        { id: 41, tournamentId: 12, status: TournamentTeamStatus.ACTIVE },
        null,
      ],
    ])(
      'returns 404 for a missing or cross-tenant %s registration',
      async (_side, home, away) => {
        arrangeCreateReferences();
        mockPrisma.tournamentTeam.findFirst
          .mockReset()
          .mockResolvedValueOnce(home)
          .mockResolvedValueOnce(away);
        const error = await captureApiException(service.create(42, 7, dto));
        expect(apiError(error)).toEqual({
          code: 'RECORD_NOT_FOUND',
          message: 'Tournament team not found',
        });
      },
    );

    it('rejects a withdrawn registration', async () => {
      arrangeCreateReferences();
      mockPrisma.tournamentTeam.findFirst.mockReset().mockResolvedValueOnce({
        id: 41,
        tournamentId: 12,
        status: TournamentTeamStatus.WITHDRAWN,
      });
      const error = await captureApiException(service.create(42, 7, dto));
      expect(apiError(error)).toEqual({
        code: 'INACTIVE_REGISTRATION',
        message: 'The tournament team registration is not active.',
      });
    });

    it('rejects a registration from another tournament', async () => {
      arrangeCreateReferences();
      mockPrisma.tournamentTeam.findFirst.mockReset().mockResolvedValueOnce({
        id: 41,
        tournamentId: 99,
        status: TournamentTeamStatus.ACTIVE,
      });
      const error = await captureApiException(service.create(42, 7, dto));
      expect(apiError(error)).toEqual({
        code: 'INVALID_MATCH_ASSIGNMENT',
        message:
          'The tournament team registration must belong to the match tournament.',
      });
    });

    it('rejects identical registrations after validating both references', async () => {
      arrangeCreateReferences();
      const error = await captureApiException(
        service.create(42, 7, {
          ...dto,
          awayTournamentTeamId: 41,
        }),
      );
      expect(mockPrisma.tournamentTeam.findFirst).toHaveBeenCalledTimes(2);
      expect(apiError(error)).toEqual({
        code: 'SAME_TEAM_IN_MATCH',
        message: 'A match cannot have the same team on both sides.',
      });
    });

    it('requires both memberships for a non-null group', async () => {
      arrangeCreateReferences();
      mockPrisma.tournamentGroupTeam.findFirst
        .mockResolvedValueOnce({ id: 801 })
        .mockResolvedValueOnce(null);
      const error = await captureApiException(service.create(42, 7, dto));
      expect(mockPrisma.tournamentGroupTeam.findFirst).toHaveBeenNthCalledWith(
        2,
        {
          where: {
            organizationId: 42,
            tournamentId: 12,
            tournamentGroupId: 7,
            tournamentTeamId: 52,
            isDeleted: false,
          },
          select: { id: true },
        },
      );
      expect(apiError(error)).toEqual({
        code: 'INVALID_GROUP_ASSIGNMENT',
        message:
          'Both match participants must belong to the selected tournament group.',
      });
    });

    it.each([
      TournamentFormat.LEAGUE,
      TournamentFormat.GROUP_STAGE,
      TournamentFormat.KNOCKOUT,
      TournamentFormat.GROUP_STAGE_KNOCKOUT,
    ])('accepts an unscoped match for %s', async (format) => {
      arrangeCreateReferences(format);
      await service.create(42, 7, { ...dto, tournamentGroupId: null });
      expect(mockPrisma.tournamentGroup.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.tournamentGroupTeam.findFirst).not.toHaveBeenCalled();
    });
  });
});
