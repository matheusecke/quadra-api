import { HttpStatus, Logger, ValidationPipe } from '@nestjs/common';
import { expect, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  LossType,
  MatchResult,
  MatchRosterStatus,
  MatchSide,
  MatchStatus,
  PeriodType,
  Prisma,
  RosterRole,
  RosterStatus,
  TournamentFormat,
  TournamentStatus,
  TournamentTeamStatus,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApiException } from '../common/exceptions/api.exception';
import { validationExceptionFactory } from '../common/pipes/validation.factory';
import { PrismaService } from '../prisma/prisma.service';
import type { MatchDetailResponseDto } from './dto/match-response.dto';
import {
  MatchPlayerStatisticInputDto,
  SaveMatchDraftDto,
  SubmitMatchResultDto,
} from './dto/match-scoresheet.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import {
  MatchesService,
  matchDetailSelect,
  matchScoresheetTargetSelect,
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
  tournament: { findFirst: AsyncMock; update: AsyncMock };
  tournamentGroup: { findFirst: AsyncMock };
  tournamentTeam: { findFirst: AsyncMock };
  tournamentGroupTeam: { findFirst: AsyncMock };
  tournamentBracketSlot: {
    findFirst: AsyncMock;
    update: AsyncMock;
    updateMany: AsyncMock;
  };
  matchPeriod: {
    findFirst: AsyncMock;
    updateMany: AsyncMock;
    createMany: AsyncMock;
  };
  tournamentRoster: { findMany: AsyncMock };
  matchRoster: {
    findFirst: AsyncMock;
    updateMany: AsyncMock;
    create: AsyncMock;
  };
  playerMatchStatistic: {
    findFirst: AsyncMock;
    updateMany: AsyncMock;
    create: AsyncMock;
  };
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
  tournament: { findFirst: asyncMock(), update: asyncMock() },
  tournamentGroup: { findFirst: asyncMock() },
  tournamentTeam: { findFirst: asyncMock() },
  tournamentGroupTeam: { findFirst: asyncMock() },
  tournamentBracketSlot: {
    findFirst: asyncMock(),
    update: asyncMock(),
    updateMany: asyncMock(),
  },
  matchPeriod: {
    findFirst: asyncMock(),
    updateMany: asyncMock(),
    createMany: asyncMock(),
  },
  tournamentRoster: { findMany: asyncMock() },
  matchRoster: {
    findFirst: asyncMock(),
    updateMany: asyncMock(),
    create: asyncMock(),
  },
  playerMatchStatistic: {
    findFirst: asyncMock(),
    updateMany: asyncMock(),
    create: asyncMock(),
  },
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
  status: MatchStatus.SCHEDULED as MatchStatus,
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

const draftNow = new Date('2026-08-15T21:08:44.000Z');

const scoresheetTargetRow = {
  id: 501,
  tournamentId: 12,
  status: MatchStatus.SCHEDULED as MatchStatus,
  startedAt: null as Date | null,
  mvpMatchRosterId: null as number | null,
  tournament: { status: TournamentStatus.IN_PROGRESS as TournamentStatus },
  teams: [
    { id: 601, side: MatchSide.HOME, tournamentTeamId: 41 },
    { id: 602, side: MatchSide.AWAY, tournamentTeamId: 52 },
  ],
  playerStatistics: [] as {
    tournamentRosterId: number;
    matchRosterId: number | null;
    matchRoster: {
      id: number;
      status: MatchRosterStatus;
      isDeleted: boolean;
    } | null;
  }[],
  mvpMatchRoster: null as {
    tournamentRosterId: number;
    isDeleted: boolean;
  } | null,
  bracketSlots: [] as {
    id: number;
    homeTournamentTeamId: number | null;
    awayTournamentTeamId: number | null;
    winnerTournamentTeamId: number | null;
  }[],
};

const homeAthlete = {
  id: 88,
  tournamentId: 12,
  tournamentTeamId: 41,
  userId: 188,
  role: RosterRole.ATHLETE,
  status: RosterStatus.INACTIVE,
  jerseyNumberSnapshot: 7,
  displayNameSnapshot: 'Ana Silva',
};

const awayAthlete = {
  id: 91,
  tournamentId: 12,
  tournamentTeamId: 52,
  userId: 191,
  role: RosterRole.ATHLETE,
  status: RosterStatus.ACTIVE,
  jerseyNumberSnapshot: 12,
  displayNameSnapshot: 'Beatriz Lima',
};

const resultNow = new Date('2026-08-15T21:08:44.000Z');

const normalPeriods = [
  {
    periodNumber: 1,
    periodType: PeriodType.REGULAR,
    homePoints: 18,
    awayPoints: 15,
  },
  {
    periodNumber: 2,
    periodType: PeriodType.REGULAR,
    homePoints: 20,
    awayPoints: 17,
  },
  {
    periodNumber: 3,
    periodType: PeriodType.REGULAR,
    homePoints: 16,
    awayPoints: 18,
  },
  {
    periodNumber: 4,
    periodType: PeriodType.REGULAR,
    homePoints: 18,
    awayPoints: 18,
  },
];

const resultPlayerStats = [
  { tournamentRosterId: 88, pts: 72 },
  { tournamentRosterId: 91, pts: 68 },
];

const normalResultDto: SubmitMatchResultDto = {
  resultType: LossType.NORMAL,
  periods: normalPeriods,
  playerStats: resultPlayerStats,
  mvpTournamentRosterId: 88,
};

const linkedSlot = {
  id: 301,
  homeTournamentTeamId: 41,
  awayTournamentTeamId: 52,
  winnerTournamentTeamId: null as number | null,
};

const reopenedStartedAt = new Date('2026-08-15T20:00:00.000Z');

const preservedPeriod = {
  id: 701,
  periodNumber: 1,
  periodType: PeriodType.REGULAR,
  homePoints: 18,
  awayPoints: 22,
  startedAt: null,
  endedAt: null,
};

const preservedPlayerStatistic = {
  tournamentRosterId: 88,
  pts: 18,
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
    displayNameSnapshot: 'Ana Silva',
    isDeleted: false,
  },
  tournamentRoster: {
    tournamentTeamId: 41,
    displayNameSnapshot: 'Ana Silva',
  },
};

const preservedMvpMatchRoster = {
  tournamentRosterId: 88,
  displayNameSnapshot: 'Ana Silva',
  isDeleted: false,
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

async function invalidProperties<T extends object>(
  type: new () => T,
  body: object,
): Promise<string[]> {
  const errors = await validate(plainToInstance(type, body));
  return errors.map((error) => error.property);
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

  function arrangeDraft(
    overrides: Partial<typeof scoresheetTargetRow> = {},
  ): void {
    mockTx.match.findFirst.mockResolvedValue({
      ...scoresheetTargetRow,
      ...overrides,
    });
    mockTx.match.update.mockResolvedValue({ id: 501 });
    mockTx.matchPeriod.updateMany.mockResolvedValue({ count: 0 });
    mockTx.matchPeriod.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.match.findFirst.mockResolvedValue({
      ...detailRow,
      status: MatchStatus.LIVE,
      startedAt: draftNow,
    });
    mockTx.tournamentRoster.findMany.mockResolvedValue([
      homeAthlete,
      awayAthlete,
    ]);
    mockTx.playerMatchStatistic.updateMany.mockResolvedValue({ count: 0 });
    mockTx.matchRoster.updateMany.mockResolvedValue({ count: 0 });
    mockTx.matchRoster.create
      .mockResolvedValueOnce({ id: 701 })
      .mockResolvedValueOnce({ id: 702 });
    mockTx.playerMatchStatistic.create.mockResolvedValue({ id: 801 });
  }

  function arrangeResult(
    overrides: Partial<typeof scoresheetTargetRow> = {},
  ): void {
    arrangeDraft(overrides);
    mockPrisma.match.findFirst.mockResolvedValue({
      ...detailRow,
      status: MatchStatus.FINISHED,
      startedAt: resultNow,
      endedAt: resultNow,
    });
  }

  function arrangeReopen(
    startedAt: Date | null = reopenedStartedAt,
    overrides: Partial<typeof scoresheetTargetRow> = {},
  ): void {
    arrangeDraft({
      status: MatchStatus.FINISHED,
      startedAt,
      ...overrides,
    });
    mockTx.matchTeam.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.match.findFirst.mockResolvedValue({
      ...detailRow,
      status: MatchStatus.LIVE,
      startedAt,
      endedAt: null,
      teams: [
        {
          ...detailRow.teams[0],
          finalScore: 20,
          result: MatchResult.WIN,
          lossType: null,
          isWinner: true,
        },
        {
          ...detailRow.teams[1],
          finalScore: 0,
          result: MatchResult.LOSS,
          lossType: LossType.FORFEIT,
          isWinner: false,
        },
      ],
      periods: [preservedPeriod],
      playerStatistics: [preservedPlayerStatistic],
      mvpMatchRoster: preservedMvpMatchRoster,
    });
  }

  describe('draft periods', () => {
    it('uses the tenant-scoped scoresheet selector in a serializable transaction', async () => {
      arrangeDraft();
      await service.draft(42, 501, {});
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(mockTx.match.findFirst).toHaveBeenCalledWith({
        where: {
          id: 501,
          organizationId: 42,
          isDeleted: false,
          tournament: { organizationId: 42, isDeleted: false },
        },
        select: matchScoresheetTargetSelect,
      });
    });

    it('starts a scheduled match with one transaction-scoped timestamp', async () => {
      jest.useFakeTimers({ now: draftNow });
      try {
        arrangeDraft();
        await service.draft(42, 501, {});
        expect(mockTx.match.update).toHaveBeenCalledWith({
          where: { id: 501 },
          data: {
            status: MatchStatus.LIVE,
            startedAt: draftNow,
            endedAt: null,
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('preserves a live match start timestamp', async () => {
      const startedAt = new Date('2026-08-15T20:00:00.000Z');
      arrangeDraft({ status: MatchStatus.LIVE, startedAt });
      await service.draft(42, 501, {});
      expect(mockTx.match.update).toHaveBeenCalledWith({
        where: { id: 501 },
        data: {
          status: MatchStatus.LIVE,
          startedAt,
          endedAt: null,
        },
      });
    });

    it('repairs a null start timestamp while a match is live', async () => {
      jest.useFakeTimers({ now: draftNow });
      try {
        arrangeDraft({ status: MatchStatus.LIVE, startedAt: null });
        await service.draft(42, 501, {});
        expect(mockTx.match.update).toHaveBeenCalledWith({
          where: { id: 501 },
          data: {
            status: MatchStatus.LIVE,
            startedAt: draftNow,
            endedAt: null,
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it.each([
      MatchStatus.POSTPONED,
      MatchStatus.FINISHED,
      MatchStatus.CANCELLED,
    ])('rejects draft from %s', async (status) => {
      arrangeDraft({ status });
      const error = await captureApiException(service.draft(42, 501, {}));
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(apiError(error)).toEqual({
        code: 'INVALID_STATUS_TRANSITION',
        message: 'Drafts can only be saved for scheduled or live matches.',
      });
      expect(mockTx.match.update).not.toHaveBeenCalled();
    });

    it('rejects a cancelled tournament before any write', async () => {
      arrangeDraft({ tournament: { status: TournamentStatus.CANCELLED } });
      const error = await captureApiException(service.draft(42, 501, {}));
      expect(apiError(error)).toEqual({
        code: 'TOURNAMENT_NOT_MUTABLE',
        message:
          'Match scoresheets cannot be changed for a cancelled tournament.',
      });
      expect(mockTx.match.update).not.toHaveBeenCalled();
      expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
    });

    it('returns the scoped 404 before any write', async () => {
      mockTx.match.findFirst.mockResolvedValue(null);
      const error = await captureApiException(service.draft(42, 501, {}));
      expect(apiError(error)).toEqual({
        code: 'RECORD_NOT_FOUND',
        message: 'Match not found',
      });
      expect(mockTx.match.update).not.toHaveBeenCalled();
    });

    it('preserves periods when the key is omitted', async () => {
      arrangeDraft();
      await service.draft(42, 501, {});
      expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
      expect(mockTx.matchPeriod.createMany).not.toHaveBeenCalled();
    });

    it('clears periods when an empty array is supplied', async () => {
      arrangeDraft();
      await service.draft(42, 501, { periods: [] });
      expect(mockTx.matchPeriod.updateMany).toHaveBeenCalledWith({
        where: { matchId: 501, organizationId: 42, isDeleted: false },
        data: { isDeleted: true },
      });
      expect(mockTx.matchPeriod.createMany).not.toHaveBeenCalled();
    });

    it('fully replaces periods and leaves period timestamps null', async () => {
      arrangeDraft();
      const periods = [
        {
          periodNumber: 1,
          periodType: PeriodType.REGULAR,
          homePoints: 18,
          awayPoints: 22,
        },
        {
          periodNumber: 2,
          periodType: PeriodType.REGULAR,
          homePoints: 20,
          awayPoints: 17,
        },
      ];
      await service.draft(42, 501, { periods });
      expect(mockTx.matchPeriod.updateMany).toHaveBeenCalledWith({
        where: { matchId: 501, organizationId: 42, isDeleted: false },
        data: { isDeleted: true },
      });
      expect(mockTx.matchPeriod.createMany).toHaveBeenCalledWith({
        data: periods.map((period) => ({
          organizationId: 42,
          matchId: 501,
          ...period,
          startedAt: null,
          endedAt: null,
        })),
      });
    });

    it.each([
      {
        name: 'duplicate number',
        periods: [
          {
            periodNumber: 1,
            periodType: PeriodType.REGULAR,
            homePoints: 1,
            awayPoints: 0,
          },
          {
            periodNumber: 1,
            periodType: PeriodType.REGULAR,
            homePoints: 0,
            awayPoints: 1,
          },
        ],
      },
      {
        name: 'gap',
        periods: [
          {
            periodNumber: 1,
            periodType: PeriodType.REGULAR,
            homePoints: 1,
            awayPoints: 0,
          },
          {
            periodNumber: 3,
            periodType: PeriodType.REGULAR,
            homePoints: 0,
            awayPoints: 1,
          },
        ],
      },
      {
        name: 'overtime before period five',
        periods: [
          {
            periodNumber: 1,
            periodType: PeriodType.OVERTIME,
            homePoints: 1,
            awayPoints: 0,
          },
        ],
      },
      {
        name: 'regular period after period four',
        periods: [1, 2, 3, 4, 5].map((periodNumber) => ({
          periodNumber,
          periodType: PeriodType.REGULAR,
          homePoints: 1,
          awayPoints: 0,
        })),
      },
    ])('rejects structurally invalid periods: $name', async ({ periods }) => {
      arrangeDraft();
      const error = await captureApiException(
        service.draft(42, 501, { periods }),
      );
      expect(apiError(error)).toEqual({
        code: 'INVALID_MATCH_PERIODS',
        message:
          'Periods must be contiguous and use the type required by their number.',
      });
      expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
      expect(mockTx.match.update).not.toHaveBeenCalled();
    });

    it('accepts a contiguous partial prefix with period five as overtime', async () => {
      arrangeDraft();
      const periods = [1, 2, 3, 4, 5].map((periodNumber) => ({
        periodNumber,
        periodType:
          periodNumber <= 4 ? PeriodType.REGULAR : PeriodType.OVERTIME,
        homePoints: periodNumber,
        awayPoints: periodNumber,
      }));
      await expect(service.draft(42, 501, { periods })).resolves.toBeDefined();
      expect(mockTx.matchPeriod.createMany).toHaveBeenCalledTimes(1);
    });

    it('retries a P2034 before saving the draft once', async () => {
      arrangeDraft();
      mockPrisma.$transaction
        .mockRejectedValueOnce(p2034())
        .mockImplementationOnce((callback) =>
          Promise.resolve(callback(mockTx)),
        );
      await service.draft(42, 501, {});
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      expect(mockTx.match.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('draft player statistics', () => {
    const playerStats = [
      { tournamentRosterId: 88, pts: 18, reb: null },
      { tournamentRosterId: 91, pts: 22, reb: null },
    ];

    it('preserves statistics and rosters when playerStats is omitted', async () => {
      arrangeDraft();
      await service.draft(42, 501, {});
      expect(mockTx.tournamentRoster.findMany).not.toHaveBeenCalled();
      expect(mockTx.playerMatchStatistic.updateMany).not.toHaveBeenCalled();
      expect(mockTx.matchRoster.updateMany).not.toHaveBeenCalled();
      expect(mockTx.matchRoster.create).not.toHaveBeenCalled();
    });

    it('accepts inactive historical athletes and creates snapshots and normalized metrics', async () => {
      arrangeDraft();
      await service.draft(42, 501, { playerStats });
      expect(mockTx.tournamentRoster.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: [88, 91] },
          organizationId: 42,
          isDeleted: false,
        },
        select: {
          id: true,
          tournamentId: true,
          tournamentTeamId: true,
          userId: true,
          role: true,
          jerseyNumberSnapshot: true,
          displayNameSnapshot: true,
        },
      });
      expect(mockTx.matchRoster.create).toHaveBeenNthCalledWith(1, {
        data: {
          organizationId: 42,
          matchId: 501,
          matchTeamId: 601,
          tournamentRosterId: 88,
          userId: 188,
          role: RosterRole.ATHLETE,
          jerseyNumberSnapshot: 7,
          displayNameSnapshot: 'Ana Silva',
          status: MatchRosterStatus.AVAILABLE,
        },
        select: { id: true },
      });
      expect(mockTx.playerMatchStatistic.create).toHaveBeenNthCalledWith(1, {
        data: {
          organizationId: 42,
          matchId: 501,
          matchTeamId: 601,
          matchRosterId: 701,
          tournamentRosterId: 88,
          userId: 188,
          pts: 18,
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
        },
      });
    });

    it('clears only AVAILABLE rosters backing active statistics', async () => {
      arrangeDraft({
        playerStatistics: [
          {
            tournamentRosterId: 88,
            matchRosterId: 710,
            matchRoster: {
              id: 710,
              status: MatchRosterStatus.AVAILABLE,
              isDeleted: false,
            },
          },
          {
            tournamentRosterId: 91,
            matchRosterId: null,
            matchRoster: null,
          },
        ],
      });
      await service.draft(42, 501, { playerStats: [] });
      expect(mockTx.playerMatchStatistic.updateMany).toHaveBeenCalledWith({
        where: { matchId: 501, organizationId: 42, isDeleted: false },
        data: { isDeleted: true },
      });
      expect(mockTx.matchRoster.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: [710] },
          matchId: 501,
          organizationId: 42,
          status: MatchRosterStatus.AVAILABLE,
          isDeleted: false,
        },
        data: { isDeleted: true },
      });
      expect(mockTx.matchRoster.create).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'missing scoped roster',
        rows: [homeAthlete],
        expected: {
          code: 'RECORD_NOT_FOUND',
          message: 'Tournament roster not found',
        },
      },
      {
        name: 'wrong tournament',
        rows: [{ ...homeAthlete, tournamentId: 99 }, awayAthlete],
        expected: {
          code: 'INVALID_MATCH_ROSTER',
          message:
            'Every player statistic must reference an athlete from one of the match teams.',
        },
      },
      {
        name: 'wrong team',
        rows: [{ ...homeAthlete, tournamentTeamId: 77 }, awayAthlete],
        expected: {
          code: 'INVALID_MATCH_ROSTER',
          message:
            'Every player statistic must reference an athlete from one of the match teams.',
        },
      },
      {
        name: 'non-athlete role',
        rows: [
          { ...homeAthlete, role: RosterRole.COACHING_STAFF },
          awayAthlete,
        ],
        expected: {
          code: 'INVALID_MATCH_ROSTER',
          message:
            'Every player statistic must reference an athlete from one of the match teams.',
        },
      },
    ])('rejects $name before writes', async ({ rows, expected }) => {
      arrangeDraft();
      mockTx.tournamentRoster.findMany.mockResolvedValue(rows);
      const error = await captureApiException(
        service.draft(42, 501, { playerStats }),
      );
      expect(apiError(error)).toEqual(expected);
      expect(mockTx.playerMatchStatistic.updateMany).not.toHaveBeenCalled();
      expect(mockTx.match.update).not.toHaveBeenCalled();
    });

    it('rejects a duplicated tournament roster before lookup', async () => {
      arrangeDraft();
      const error = await captureApiException(
        service.draft(42, 501, {
          playerStats: [
            { tournamentRosterId: 88, pts: 1 },
            { tournamentRosterId: 88, pts: 2 },
          ],
        }),
      );
      expect(apiError(error)).toEqual({
        code: 'INVALID_PLAYER_STATS',
        message: 'Each player can appear only once in match statistics.',
      });
      expect(mockTx.tournamentRoster.findMany).not.toHaveBeenCalled();
    });

    it('rejects two roster identities resolving to the same user', async () => {
      arrangeDraft();
      mockTx.tournamentRoster.findMany.mockResolvedValue([
        homeAthlete,
        { ...awayAthlete, userId: homeAthlete.userId },
      ]);
      const error = await captureApiException(
        service.draft(42, 501, { playerStats }),
      );
      expect(apiError(error)).toEqual({
        code: 'INVALID_PLAYER_STATS',
        message: 'Each player can appear only once in match statistics.',
      });
    });

    it('finishes all statistic validation before replacing periods', async () => {
      arrangeDraft();
      const error = await captureApiException(
        service.draft(42, 501, {
          periods: [
            {
              periodNumber: 1,
              periodType: PeriodType.REGULAR,
              homePoints: 18,
              awayPoints: 22,
            },
          ],
          playerStats: [
            { tournamentRosterId: 88, pts: 18 },
            { tournamentRosterId: 91, pts: null },
          ],
        }),
      );
      expect(apiError(error).code).toBe('INVALID_PLAYER_STATS');
      expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
      expect(mockTx.playerMatchStatistic.updateMany).not.toHaveBeenCalled();
      expect(mockTx.match.update).not.toHaveBeenCalled();
    });

    it('rejects mixed null and tracked values for one metric', async () => {
      arrangeDraft();
      const error = await captureApiException(
        service.draft(42, 501, {
          playerStats: [
            { tournamentRosterId: 88, pts: 0 },
            { tournamentRosterId: 91, pts: null },
          ],
        }),
      );
      expect(apiError(error)).toEqual({
        code: 'INVALID_PLAYER_STATS',
        message:
          'Each tracked statistic must be provided for every player or be null for every player.',
      });
      expect(mockTx.tournamentRoster.findMany).not.toHaveBeenCalled();
    });

    it.each([
      { fgm: 2, fga: 1 },
      { threeFgm: 2, threeFga: 1 },
      { ftm: 2, fta: 1 },
    ])('rejects made totals greater than attempts: %o', async (metrics) => {
      arrangeDraft();
      const error = await captureApiException(
        service.draft(42, 501, {
          playerStats: [
            { tournamentRosterId: 88, ...metrics },
            { tournamentRosterId: 91, ...metrics },
          ],
        }),
      );
      expect(apiError(error)).toEqual({
        code: 'INVALID_PLAYER_STATS',
        message: 'Made shots cannot exceed attempted shots.',
      });
    });

    it('sets an explicit MVP to the newly created match roster', async () => {
      arrangeDraft();
      await service.draft(42, 501, {
        playerStats,
        mvpTournamentRosterId: 91,
      });
      expect(mockTx.match.update).toHaveBeenLastCalledWith({
        where: { id: 501 },
        data: {
          status: MatchStatus.LIVE,
          startedAt: expect.any(Date),
          endedAt: null,
          mvpMatchRosterId: 702,
        },
      });
    });

    it('preserves and rebinds an omitted MVP during statistic replacement', async () => {
      arrangeDraft({
        mvpMatchRosterId: 710,
        mvpMatchRoster: { tournamentRosterId: 88, isDeleted: false },
        playerStatistics: [
          {
            tournamentRosterId: 88,
            matchRosterId: 710,
            matchRoster: {
              id: 710,
              status: MatchRosterStatus.AVAILABLE,
              isDeleted: false,
            },
          },
        ],
      });
      await service.draft(42, 501, { playerStats });
      expect(mockTx.match.update).toHaveBeenNthCalledWith(1, {
        where: { id: 501 },
        data: { mvpMatchRosterId: null },
      });
      expect(mockTx.match.update).toHaveBeenLastCalledWith({
        where: { id: 501 },
        data: {
          status: MatchStatus.LIVE,
          startedAt: expect.any(Date),
          endedAt: null,
          mvpMatchRosterId: 701,
        },
      });
    });

    it('rejects implicit removal of the preserved MVP before writes', async () => {
      arrangeDraft({
        mvpMatchRosterId: 710,
        mvpMatchRoster: { tournamentRosterId: 88, isDeleted: false },
        playerStatistics: [
          {
            tournamentRosterId: 88,
            matchRosterId: 710,
            matchRoster: {
              id: 710,
              status: MatchRosterStatus.AVAILABLE,
              isDeleted: false,
            },
          },
        ],
      });
      mockTx.tournamentRoster.findMany.mockResolvedValue([awayAthlete]);
      const error = await captureApiException(
        service.draft(42, 501, {
          playerStats: [{ tournamentRosterId: 91, pts: 1 }],
        }),
      );
      expect(apiError(error)).toEqual({
        code: 'INVALID_MATCH_MVP',
        message:
          'The match MVP must be present in the resulting player statistics.',
      });
      expect(mockTx.playerMatchStatistic.updateMany).not.toHaveBeenCalled();
      expect(mockTx.match.update).not.toHaveBeenCalled();
    });

    it('rejects an explicit MVP absent from replacement statistics', async () => {
      arrangeDraft();
      const error = await captureApiException(
        service.draft(42, 501, {
          playerStats,
          mvpTournamentRosterId: 999,
        }),
      );
      expect(apiError(error)).toEqual({
        code: 'INVALID_MATCH_MVP',
        message:
          'The match MVP must be present in the resulting player statistics.',
      });
      expect(mockTx.playerMatchStatistic.updateMany).not.toHaveBeenCalled();
      expect(mockTx.match.update).not.toHaveBeenCalled();
    });

    it('clears statistics and MVP only when null is explicit', async () => {
      arrangeDraft({
        mvpMatchRosterId: 710,
        mvpMatchRoster: { tournamentRosterId: 88, isDeleted: false },
        playerStatistics: [
          {
            tournamentRosterId: 88,
            matchRosterId: 710,
            matchRoster: {
              id: 710,
              status: MatchRosterStatus.AVAILABLE,
              isDeleted: false,
            },
          },
        ],
      });
      await service.draft(42, 501, {
        playerStats: [],
        mvpTournamentRosterId: null,
      });
      expect(mockTx.match.update).toHaveBeenLastCalledWith({
        where: { id: 501 },
        data: {
          status: MatchStatus.LIVE,
          startedAt: expect.any(Date),
          endedAt: null,
          mvpMatchRosterId: null,
        },
      });
    });

    it('changes MVP without replacing existing statistics', async () => {
      arrangeDraft({
        playerStatistics: [
          {
            tournamentRosterId: 91,
            matchRosterId: 720,
            matchRoster: {
              id: 720,
              status: MatchRosterStatus.AVAILABLE,
              isDeleted: false,
            },
          },
        ],
      });
      await service.draft(42, 501, { mvpTournamentRosterId: 91 });
      expect(mockTx.tournamentRoster.findMany).not.toHaveBeenCalled();
      expect(mockTx.playerMatchStatistic.updateMany).not.toHaveBeenCalled();
      expect(mockTx.match.update).toHaveBeenLastCalledWith({
        where: { id: 501 },
        data: {
          status: MatchStatus.LIVE,
          startedAt: expect.any(Date),
          endedAt: null,
          mvpMatchRosterId: 720,
        },
      });
    });

    it('does not revalidate or rewrite an entirely omitted MVP', async () => {
      arrangeDraft({
        mvpMatchRosterId: 710,
        mvpMatchRoster: { tournamentRosterId: 88, isDeleted: false },
        playerStatistics: [],
      });
      await expect(service.draft(42, 501, {})).resolves.toBeDefined();
      expect(mockTx.match.update).toHaveBeenCalledTimes(1);
      expect(mockTx.match.update).toHaveBeenCalledWith({
        where: { id: 501 },
        data: {
          status: MatchStatus.LIVE,
          startedAt: expect.any(Date),
          endedAt: null,
        },
      });
    });
  });

  describe('played results', () => {
    it.each([
      MatchStatus.FINISHED,
      MatchStatus.POSTPONED,
      MatchStatus.CANCELLED,
    ])('rejects result submission from %s', async (status) => {
      arrangeResult({ status });
      const error = await captureApiException(
        service.submitResult(42, 501, normalResultDto),
      );
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(apiError(error)).toEqual({
        code: 'INVALID_STATUS_TRANSITION',
        message: 'Results can only be submitted for scheduled or live matches.',
      });
      expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
      expect(mockTx.match.update).not.toHaveBeenCalled();
    });

    it('rejects a result for a cancelled tournament before any write', async () => {
      arrangeResult({
        tournament: { status: TournamentStatus.CANCELLED },
      });
      const error = await captureApiException(
        service.submitResult(42, 501, normalResultDto),
      );
      expect(apiError(error)).toEqual({
        code: 'TOURNAMENT_NOT_MUTABLE',
        message:
          'Match scoresheets cannot be changed for a cancelled tournament.',
      });
      expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
      expect(mockTx.match.update).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'periods omitted', dto: { playerStats: [] } },
      { name: 'playerStats omitted', dto: { periods: normalPeriods } },
      {
        name: 'DEFAULT playerStats omitted',
        dto: {
          resultType: LossType.DEFAULT,
          offendingTournamentTeamId: 52,
          periods: normalPeriods.slice(0, 1),
        },
      },
    ])('rejects an incomplete played payload: $name', async ({ dto }) => {
      arrangeResult();
      const error = await captureApiException(
        service.submitResult(42, 501, dto),
      );
      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(apiError(error)).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Invalid data in request.',
      });
      expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
    });

    it('rejects offendingTournamentTeamId for NORMAL', async () => {
      arrangeResult();
      const error = await captureApiException(
        service.submitResult(42, 501, {
          ...normalResultDto,
          offendingTournamentTeamId: 52,
        }),
      );
      expect(apiError(error)).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Invalid data in request.',
      });
      expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'fewer than four periods',
        periods: normalPeriods.slice(0, 3),
      },
      {
        name: 'tied final court score',
        periods: normalPeriods.map((period) => ({
          ...period,
          homePoints: 10,
          awayPoints: 10,
        })),
      },
    ])('rejects an incomplete NORMAL result: $name', async ({ periods }) => {
      arrangeResult();
      const error = await captureApiException(
        service.submitResult(42, 501, {
          resultType: LossType.NORMAL,
          periods,
          playerStats: [],
        }),
      );
      expect(apiError(error)).toEqual({
        code: 'INVALID_MATCH_PERIODS',
        message:
          'A normal result requires four complete regular periods and a non-tied score.',
      });
      expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
    });

    it('defaults an omitted resultType to NORMAL', async () => {
      arrangeResult();
      await service.submitResult(42, 501, {
        periods: normalPeriods,
        playerStats: resultPlayerStats,
      });
      expect(mockTx.matchTeam.update).toHaveBeenCalledTimes(2);
    });

    it('uses one timestamp for direct SCHEDULED to FINISHED entry', async () => {
      jest.useFakeTimers({ now: resultNow });
      try {
        arrangeResult();
        await service.submitResult(42, 501, normalResultDto);
        expect(mockTx.match.update).toHaveBeenLastCalledWith({
          where: { id: 501 },
          data: {
            status: MatchStatus.FINISHED,
            startedAt: resultNow,
            endedAt: resultNow,
            mvpMatchRosterId: 701,
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('preserves a LIVE startedAt and sets endedAt to now', async () => {
      const startedAt = new Date('2026-08-15T20:00:00.000Z');
      jest.useFakeTimers({ now: resultNow });
      try {
        arrangeResult({ status: MatchStatus.LIVE, startedAt });
        await service.submitResult(42, 501, normalResultDto);
        expect(mockTx.match.update).toHaveBeenLastCalledWith({
          where: { id: 501 },
          data: {
            status: MatchStatus.FINISHED,
            startedAt,
            endedAt: resultNow,
            mvpMatchRosterId: 701,
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('repairs a null LIVE startedAt with the result timestamp', async () => {
      jest.useFakeTimers({ now: resultNow });
      try {
        arrangeResult({ status: MatchStatus.LIVE, startedAt: null });
        await service.submitResult(42, 501, normalResultDto);
        expect(mockTx.match.update).toHaveBeenLastCalledWith({
          where: { id: 501 },
          data: {
            status: MatchStatus.FINISHED,
            startedAt: resultNow,
            endedAt: resultNow,
            mvpMatchRosterId: 701,
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('fully replaces the scoresheet and derives a NORMAL home win', async () => {
      arrangeResult();
      await service.submitResult(42, 501, normalResultDto);

      expect(mockTx.matchPeriod.updateMany).toHaveBeenCalledWith({
        where: { matchId: 501, organizationId: 42, isDeleted: false },
        data: { isDeleted: true },
      });
      expect(mockTx.matchPeriod.createMany).toHaveBeenCalledWith({
        data: normalPeriods.map((period) => ({
          organizationId: 42,
          matchId: 501,
          ...period,
          startedAt: null,
          endedAt: null,
        })),
      });
      expect(mockTx.playerMatchStatistic.updateMany).toHaveBeenCalledTimes(1);
      expect(mockTx.matchTeam.update).toHaveBeenNthCalledWith(1, {
        where: { id: 601 },
        data: {
          finalScore: 72,
          result: MatchResult.WIN,
          lossType: null,
          isWinner: true,
        },
      });
      expect(mockTx.matchTeam.update).toHaveBeenNthCalledWith(2, {
        where: { id: 602 },
        data: {
          finalScore: 68,
          result: MatchResult.LOSS,
          lossType: LossType.NORMAL,
          isWinner: false,
        },
      });
    });

    it('validates all played-result statistics before replacing periods', async () => {
      arrangeResult();
      const error = await captureApiException(
        service.submitResult(42, 501, {
          periods: normalPeriods,
          playerStats: [
            { tournamentRosterId: 88, pts: 72 },
            { tournamentRosterId: 91, pts: null },
          ],
        }),
      );
      expect(apiError(error).code).toBe('INVALID_PLAYER_STATS');
      expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
      expect(mockTx.playerMatchStatistic.updateMany).not.toHaveBeenCalled();
      expect(mockTx.matchTeam.update).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'missing offender',
        dto: {
          resultType: LossType.DEFAULT,
          periods: normalPeriods.slice(0, 1),
          playerStats: [],
        },
        expectedCode: 'VALIDATION_ERROR',
        expectedMessage: 'Invalid data in request.',
      },
      {
        name: 'non-participant offender',
        dto: {
          resultType: LossType.DEFAULT,
          offendingTournamentTeamId: 999,
          periods: normalPeriods.slice(0, 1),
          playerStats: [],
        },
        expectedCode: 'INVALID_OFFENDING_TEAM',
        expectedMessage:
          'The offending team must be one of the match participants.',
      },
      {
        name: 'empty period set',
        dto: {
          resultType: LossType.DEFAULT,
          offendingTournamentTeamId: 52,
          periods: [],
          playerStats: [],
        },
        expectedCode: 'INVALID_MATCH_PERIODS',
        expectedMessage: 'A default result requires at least one period.',
      },
    ])(
      'rejects DEFAULT with $name',
      async ({ dto, expectedCode, expectedMessage }) => {
        arrangeResult();
        const error = await captureApiException(
          service.submitResult(42, 501, dto),
        );
        expect(apiError(error)).toEqual({
          code: expectedCode,
          message: expectedMessage,
        });
        expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
      },
    );

    it('preserves the court score when the DEFAULT non-offender is ahead', async () => {
      arrangeResult();
      await service.submitResult(42, 501, {
        resultType: LossType.DEFAULT,
        offendingTournamentTeamId: 41,
        periods: [
          {
            periodNumber: 1,
            periodType: PeriodType.REGULAR,
            homePoints: 18,
            awayPoints: 22,
          },
        ],
        playerStats: [],
      });
      expect(mockTx.matchTeam.update).toHaveBeenNthCalledWith(1, {
        where: { id: 601 },
        data: {
          finalScore: 18,
          result: MatchResult.LOSS,
          lossType: LossType.DEFAULT,
          isWinner: false,
        },
      });
      expect(mockTx.matchTeam.update).toHaveBeenNthCalledWith(2, {
        where: { id: 602 },
        data: {
          finalScore: 22,
          result: MatchResult.WIN,
          lossType: null,
          isWinner: true,
        },
      });
    });

    it.each([
      { homePoints: 18, awayPoints: 22 },
      { homePoints: 22, awayPoints: 22 },
    ])(
      'awards an oriented 2-0 DEFAULT when the non-offender is not ahead: %o',
      async ({ homePoints, awayPoints }) => {
        arrangeResult();
        await service.submitResult(42, 501, {
          resultType: LossType.DEFAULT,
          offendingTournamentTeamId: 52,
          periods: [
            {
              periodNumber: 1,
              periodType: PeriodType.REGULAR,
              homePoints,
              awayPoints,
            },
          ],
          playerStats: [],
        });
        expect(mockTx.matchTeam.update).toHaveBeenNthCalledWith(1, {
          where: { id: 601 },
          data: {
            finalScore: 2,
            result: MatchResult.WIN,
            lossType: null,
            isWinner: true,
          },
        });
        expect(mockTx.matchTeam.update).toHaveBeenNthCalledWith(2, {
          where: { id: 602 },
          data: {
            finalScore: 0,
            result: MatchResult.LOSS,
            lossType: LossType.DEFAULT,
            isWinner: false,
          },
        });
      },
    );

    it('returns the existing Phase 8 detail model after commit', async () => {
      arrangeResult();
      mockPrisma.match.findFirst.mockResolvedValue({
        ...detailRow,
        status: MatchStatus.FINISHED,
        startedAt: resultNow,
        endedAt: resultNow,
        periods: normalPeriods.map((period, index) => ({
          id: index + 1,
          ...period,
          startedAt: null,
          endedAt: null,
        })),
        teams: [
          {
            ...detailRow.teams[0],
            finalScore: 72,
            result: MatchResult.WIN,
            isWinner: true,
          },
          {
            ...detailRow.teams[1],
            finalScore: 68,
            result: MatchResult.LOSS,
            lossType: LossType.NORMAL,
            isWinner: false,
          },
        ],
      });
      const response = await service.submitResult(42, 501, normalResultDto);
      expect(response).toMatchObject({
        id: 501,
        status: MatchStatus.FINISHED,
        scoreSource: 'PERIODS',
        homeTeam: { score: 72, result: MatchResult.WIN, isWinner: true },
        awayTeam: {
          score: 68,
          result: MatchResult.LOSS,
          lossType: LossType.NORMAL,
          isWinner: false,
        },
      });
    });
  });

  describe('forfeit results', () => {
    const forfeitDto: SubmitMatchResultDto = {
      resultType: LossType.FORFEIT,
      offendingTournamentTeamId: 52,
    };

    it.each([
      { name: 'periods', extra: { periods: [] } },
      { name: 'playerStats', extra: { playerStats: [] } },
      { name: 'MVP', extra: { mvpTournamentRosterId: null } },
    ])(
      'rejects prohibited $name even when empty or null',
      async ({ extra }) => {
        arrangeResult();
        const error = await captureApiException(
          service.submitResult(42, 501, { ...forfeitDto, ...extra }),
        );
        expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(apiError(error)).toEqual({
          code: 'VALIDATION_ERROR',
          message: 'Invalid data in request.',
        });
        expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
        expect(mockTx.match.update).not.toHaveBeenCalled();
      },
    );

    it.each([
      { name: 'missing', offendingTournamentTeamId: undefined },
      { name: 'not a participant', offendingTournamentTeamId: 999 },
    ])('rejects a $name offender', async ({ offendingTournamentTeamId }) => {
      arrangeResult();
      const dto: SubmitMatchResultDto = {
        resultType: LossType.FORFEIT,
        ...(offendingTournamentTeamId === undefined
          ? {}
          : { offendingTournamentTeamId }),
      };
      const error = await captureApiException(
        service.submitResult(42, 501, dto),
      );
      expect(apiError(error)).toEqual(
        offendingTournamentTeamId === undefined
          ? { code: 'VALIDATION_ERROR', message: 'Invalid data in request.' }
          : {
              code: 'INVALID_OFFENDING_TEAM',
              message:
                'The offending team must be one of the match participants.',
            },
      );
      expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
    });

    it('awards 20-0 to HOME and marks the AWAY offender as the loser', async () => {
      arrangeResult();
      await service.submitResult(42, 501, forfeitDto);
      expect(mockTx.matchTeam.update).toHaveBeenNthCalledWith(1, {
        where: { id: 601 },
        data: {
          finalScore: 20,
          result: MatchResult.WIN,
          lossType: null,
          isWinner: true,
        },
      });
      expect(mockTx.matchTeam.update).toHaveBeenNthCalledWith(2, {
        where: { id: 602 },
        data: {
          finalScore: 0,
          result: MatchResult.LOSS,
          lossType: LossType.FORFEIT,
          isWinner: false,
        },
      });
    });

    it('orients 20-0 to AWAY when HOME forfeits', async () => {
      arrangeResult();
      await service.submitResult(42, 501, {
        resultType: LossType.FORFEIT,
        offendingTournamentTeamId: 41,
      });
      expect(mockTx.matchTeam.update).toHaveBeenNthCalledWith(1, {
        where: { id: 601 },
        data: {
          finalScore: 0,
          result: MatchResult.LOSS,
          lossType: LossType.FORFEIT,
          isWinner: false,
        },
      });
      expect(mockTx.matchTeam.update).toHaveBeenNthCalledWith(2, {
        where: { id: 602 },
        data: {
          finalScore: 20,
          result: MatchResult.WIN,
          lossType: null,
          isWinner: true,
        },
      });
    });

    it('clears an earlier draft and only its statistic-backed AVAILABLE rosters', async () => {
      arrangeResult({
        mvpMatchRosterId: 710,
        mvpMatchRoster: { tournamentRosterId: 88, isDeleted: false },
        playerStatistics: [
          {
            tournamentRosterId: 88,
            matchRosterId: 710,
            matchRoster: {
              id: 710,
              status: MatchRosterStatus.AVAILABLE,
              isDeleted: false,
            },
          },
        ],
      });
      await service.submitResult(42, 501, forfeitDto);
      expect(mockTx.matchPeriod.updateMany).toHaveBeenCalledWith({
        where: { matchId: 501, organizationId: 42, isDeleted: false },
        data: { isDeleted: true },
      });
      expect(mockTx.matchPeriod.createMany).not.toHaveBeenCalled();
      expect(mockTx.playerMatchStatistic.updateMany).toHaveBeenCalledWith({
        where: { matchId: 501, organizationId: 42, isDeleted: false },
        data: { isDeleted: true },
      });
      expect(mockTx.matchRoster.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: [710] },
          matchId: 501,
          organizationId: 42,
          status: MatchRosterStatus.AVAILABLE,
          isDeleted: false,
        },
        data: { isDeleted: true },
      });
      expect(mockTx.matchRoster.create).not.toHaveBeenCalled();
      expect(mockTx.playerMatchStatistic.create).not.toHaveBeenCalled();
    });

    it('does not query or mutate unrelated standalone DNP rows', async () => {
      arrangeResult({ playerStatistics: [] });
      await service.submitResult(42, 501, forfeitDto);
      expect(mockTx.matchRoster.findFirst).not.toHaveBeenCalled();
      expect(mockTx.matchRoster.updateMany).not.toHaveBeenCalled();
    });

    it.each([MatchStatus.SCHEDULED, MatchStatus.LIVE])(
      'sets startedAt null and endedAt now from %s',
      async (status) => {
        jest.useFakeTimers({ now: resultNow });
        try {
          arrangeResult({
            status,
            startedAt: new Date('2026-08-15T20:00:00.000Z'),
          });
          await service.submitResult(42, 501, forfeitDto);
          expect(mockTx.match.update).toHaveBeenLastCalledWith({
            where: { id: 501 },
            data: {
              status: MatchStatus.FINISHED,
              startedAt: null,
              endedAt: resultNow,
              mvpMatchRosterId: null,
            },
          });
        } finally {
          jest.useRealTimers();
        }
      },
    );

    it('returns the Phase 8 awarded detail shape with no scoresheet or MVP', async () => {
      arrangeResult();
      mockPrisma.match.findFirst.mockResolvedValue({
        ...detailRow,
        status: MatchStatus.FINISHED,
        startedAt: null,
        endedAt: resultNow,
        periods: [
          {
            id: 1,
            periodNumber: 1,
            periodType: PeriodType.REGULAR,
            homePoints: 18,
            awayPoints: 22,
            startedAt: null,
            endedAt: null,
          },
        ],
        mvpMatchRoster: {
          tournamentRosterId: 88,
          displayNameSnapshot: 'Ana Silva',
          isDeleted: false,
        },
        teams: [
          {
            ...detailRow.teams[0],
            finalScore: 20,
            result: MatchResult.WIN,
            isWinner: true,
          },
          {
            ...detailRow.teams[1],
            finalScore: 0,
            result: MatchResult.LOSS,
            lossType: LossType.FORFEIT,
            isWinner: false,
          },
        ],
      });
      const response = await service.submitResult(42, 501, forfeitDto);
      expect(response).toMatchObject({
        status: MatchStatus.FINISHED,
        startedAt: null,
        scoreSource: 'AWARDED',
        periods: [],
        playerStats: [],
        mvp: null,
      });
    });
  });

  describe('result bracket synchronization', () => {
    it('does nothing to the bracket when the match has no linked slot', async () => {
      arrangeResult();
      await service.submitResult(42, 501, normalResultDto);
      expect(mockTx.tournamentBracketSlot.update).not.toHaveBeenCalled();
      expect(mockTx.tournament.update).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'missing HOME participant',
        slot: { ...linkedSlot, homeTournamentTeamId: null },
      },
      {
        name: 'missing AWAY participant',
        slot: { ...linkedSlot, awayTournamentTeamId: null },
      },
      {
        name: 'different participant pair',
        slot: { ...linkedSlot, awayTournamentTeamId: 77 },
      },
    ])(
      'rejects a linked slot with $name before any write',
      async ({ slot }) => {
        arrangeResult({ bracketSlots: [slot] });
        const error = await captureApiException(
          service.submitResult(42, 501, normalResultDto),
        );
        expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(apiError(error)).toEqual({
          code: 'MATCH_TEAMS_MISMATCH',
          message:
            'The match participants do not match the bracket slot participants.',
        });
        expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
        expect(mockTx.playerMatchStatistic.updateMany).not.toHaveBeenCalled();
        expect(mockTx.matchTeam.update).not.toHaveBeenCalled();
        expect(mockTx.match.update).not.toHaveBeenCalled();
        expect(mockTx.tournamentBracketSlot.update).not.toHaveBeenCalled();
      },
    );

    it('accepts reversed slot presentation order and writes the derived winner', async () => {
      arrangeResult({
        bracketSlots: [
          {
            ...linkedSlot,
            homeTournamentTeamId: 52,
            awayTournamentTeamId: 41,
          },
        ],
      });
      await service.submitResult(42, 501, normalResultDto);
      expect(mockTx.tournamentBracketSlot.update).toHaveBeenCalledWith({
        where: { id: 301 },
        data: { winnerTournamentTeamId: 41 },
      });
    });

    it('leaves an unchanged linked winner untouched', async () => {
      arrangeResult({
        bracketSlots: [{ ...linkedSlot, winnerTournamentTeamId: 41 }],
      });
      await service.submitResult(42, 501, normalResultDto);
      expect(mockTx.tournamentBracketSlot.update).not.toHaveBeenCalled();
      expect(mockTx.tournament.update).not.toHaveBeenCalled();
    });

    it('overwrites a different manually stored winner with the match result', async () => {
      arrangeResult({
        bracketSlots: [{ ...linkedSlot, winnerTournamentTeamId: 52 }],
      });
      await service.submitResult(42, 501, normalResultDto);
      expect(mockTx.tournamentBracketSlot.update).toHaveBeenCalledWith({
        where: { id: 301 },
        data: { winnerTournamentTeamId: 41 },
      });
      expect(mockTx.tournament.update).not.toHaveBeenCalled();
    });

    it('reopens a completed tournament and clears its champion when winner changes', async () => {
      arrangeResult({
        tournament: { status: TournamentStatus.COMPLETED },
        bracketSlots: [{ ...linkedSlot, winnerTournamentTeamId: 52 }],
      });
      await service.submitResult(42, 501, normalResultDto);
      expect(mockTx.tournamentBracketSlot.update).toHaveBeenCalledWith({
        where: { id: 301 },
        data: { winnerTournamentTeamId: 41 },
      });
      expect(mockTx.tournament.update).toHaveBeenCalledWith({
        where: { id: 12 },
        data: {
          status: TournamentStatus.IN_PROGRESS,
          championTournamentTeamId: null,
        },
      });
    });

    it('keeps a completed tournament and champion when winner is unchanged', async () => {
      arrangeResult({
        tournament: { status: TournamentStatus.COMPLETED },
        bracketSlots: [{ ...linkedSlot, winnerTournamentTeamId: 41 }],
      });
      await service.submitResult(42, 501, normalResultDto);
      expect(mockTx.tournamentBracketSlot.update).not.toHaveBeenCalled();
      expect(mockTx.tournament.update).not.toHaveBeenCalled();
    });

    it('runs slot synchronization inside the result transaction and skips the post-commit read on failure', async () => {
      arrangeResult({ bracketSlots: [linkedSlot] });
      mockTx.tournamentBracketSlot.update.mockRejectedValue(
        new Error('slot write failed'),
      );
      await expect(
        service.submitResult(42, 501, normalResultDto),
      ).rejects.toThrow('slot write failed');
      expect(mockTx.matchPeriod.updateMany).toHaveBeenCalled();
      expect(mockTx.matchTeam.update).toHaveBeenCalled();
      expect(mockPrisma.match.findFirst).not.toHaveBeenCalled();
    });

    it('updates only the current slot and performs no participant propagation', async () => {
      arrangeResult({ bracketSlots: [linkedSlot] });
      await service.submitResult(42, 501, normalResultDto);
      expect(mockTx.tournamentBracketSlot.update).toHaveBeenCalledTimes(1);
      expect(mockTx.tournamentBracketSlot.update).toHaveBeenCalledWith({
        where: { id: 301 },
        data: { winnerTournamentTeamId: 41 },
      });
      expect(mockTx.tournamentBracketSlot.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('reopen', () => {
    it('uses the tenant-scoped scoresheet target in a serializable transaction', async () => {
      arrangeReopen();
      await service.reopen(42, 501);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      expect(mockTx.match.findFirst).toHaveBeenCalledWith({
        where: {
          id: 501,
          organizationId: 42,
          isDeleted: false,
          tournament: { organizationId: 42, isDeleted: false },
        },
        select: matchScoresheetTargetSelect,
      });
    });

    it.each([
      MatchStatus.SCHEDULED,
      MatchStatus.LIVE,
      MatchStatus.POSTPONED,
      MatchStatus.CANCELLED,
    ])('rejects reopen from %s', async (status) => {
      arrangeReopen(reopenedStartedAt, { status });
      const error = await captureApiException(service.reopen(42, 501));
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(apiError(error)).toEqual({
        code: 'INVALID_STATUS_TRANSITION',
        message: 'Only a finished match can be reopened.',
      });
      expect(mockTx.matchTeam.updateMany).not.toHaveBeenCalled();
      expect(mockTx.match.update).not.toHaveBeenCalled();
    });

    it('rejects a cancelled tournament before checking the match lifecycle', async () => {
      arrangeReopen(reopenedStartedAt, {
        status: MatchStatus.LIVE,
        tournament: { status: TournamentStatus.CANCELLED },
      });
      const error = await captureApiException(service.reopen(42, 501));
      expect(apiError(error)).toEqual({
        code: 'TOURNAMENT_NOT_MUTABLE',
        message:
          'Match scoresheets cannot be changed for a cancelled tournament.',
      });
      expect(mockTx.matchTeam.updateMany).not.toHaveBeenCalled();
      expect(mockTx.match.update).not.toHaveBeenCalled();
    });

    it('returns the scoped 404 before any write', async () => {
      arrangeReopen();
      mockTx.match.findFirst.mockResolvedValue(null);
      const error = await captureApiException(service.reopen(42, 501));
      expect(apiError(error)).toEqual({
        code: 'RECORD_NOT_FOUND',
        message: 'Match not found',
      });
      expect(mockTx.matchTeam.updateMany).not.toHaveBeenCalled();
      expect(mockTx.match.update).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'played result', startedAt: reopenedStartedAt },
      { name: 'forfeit', startedAt: null },
    ])('clears only derived fields for a $name', async ({ startedAt }) => {
      arrangeReopen(startedAt);
      const response = await service.reopen(42, 501);
      expect(mockTx.matchTeam.updateMany).toHaveBeenCalledWith({
        where: {
          matchId: 501,
          organizationId: 42,
          isDeleted: false,
        },
        data: {
          finalScore: null,
          result: null,
          lossType: null,
          isWinner: null,
        },
      });
      expect(mockTx.match.update).toHaveBeenCalledWith({
        where: { id: 501 },
        data: {
          status: MatchStatus.LIVE,
          endedAt: null,
        },
      });
      expect(response).toMatchObject({
        status: MatchStatus.LIVE,
        startedAt,
        endedAt: null,
        scoreSource: null,
        homeTeam: {
          score: null,
          result: null,
          lossType: null,
          isWinner: null,
        },
        awayTeam: {
          score: null,
          result: null,
          lossType: null,
          isWinner: null,
        },
      });
    });

    it('preserves the scoresheet, rosters, MVP, slot winner, tournament, and champion', async () => {
      arrangeReopen(reopenedStartedAt, {
        tournament: { status: TournamentStatus.COMPLETED },
        bracketSlots: [{ ...linkedSlot, winnerTournamentTeamId: 41 }],
      });
      const response = await service.reopen(42, 501);
      expect(mockTx.matchPeriod.updateMany).not.toHaveBeenCalled();
      expect(mockTx.matchPeriod.createMany).not.toHaveBeenCalled();
      expect(mockTx.playerMatchStatistic.updateMany).not.toHaveBeenCalled();
      expect(mockTx.playerMatchStatistic.create).not.toHaveBeenCalled();
      expect(mockTx.matchRoster.updateMany).not.toHaveBeenCalled();
      expect(mockTx.matchRoster.create).not.toHaveBeenCalled();
      expect(mockTx.tournamentBracketSlot.update).not.toHaveBeenCalled();
      expect(mockTx.tournamentBracketSlot.updateMany).not.toHaveBeenCalled();
      expect(mockTx.tournament.update).not.toHaveBeenCalled();
      expect(response.periods).toEqual([
        {
          periodNumber: 1,
          periodType: PeriodType.REGULAR,
          homePoints: 18,
          awayPoints: 22,
          startedAt: null,
          endedAt: null,
        },
      ]);
      expect(response.playerStats).toEqual([
        {
          tournamentRosterId: 88,
          tournamentTeamId: 41,
          displayName: 'Ana Silva',
          pts: 18,
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
        },
      ]);
      expect(response.mvp).toEqual({
        tournamentRosterId: 88,
        displayName: 'Ana Silva',
      });
    });

    it('retries P2034 and performs the reopen writes once after success', async () => {
      arrangeReopen();
      mockPrisma.$transaction
        .mockRejectedValueOnce(p2034())
        .mockImplementationOnce((callback) =>
          Promise.resolve(callback(mockTx)),
        );
      await service.reopen(42, 501);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      expect(mockTx.matchTeam.updateMany).toHaveBeenCalledTimes(1);
      expect(mockTx.match.update).toHaveBeenCalledTimes(1);
    });

    it('does not read a success response when a reopen write fails', async () => {
      arrangeReopen();
      mockTx.match.update.mockRejectedValue(new Error('match write failed'));
      await expect(service.reopen(42, 501)).rejects.toThrow(
        'match write failed',
      );
      expect(mockPrisma.match.findFirst).not.toHaveBeenCalled();
    });

    it('returns CONCURRENT_MODIFICATION after four P2034 conflicts', async () => {
      arrangeReopen();
      mockPrisma.$transaction.mockRejectedValue(p2034());
      const error = await captureApiException(service.reopen(42, 501));
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(4);
      expect(apiError(error)).toEqual({
        code: 'CONCURRENT_MODIFICATION',
        message:
          'The resource changed during this operation. Retry the request.',
      });
      expect(mockPrisma.match.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('result points warning', () => {
    afterEach(() => jest.restoreAllMocks());

    function watchWarnings() {
      return jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
    }

    it('warns once for each PERIODS side whose player points differ', async () => {
      const warn = watchWarnings();
      arrangeResult();
      await service.submitResult(42, 501, {
        ...normalResultDto,
        playerStats: [
          { tournamentRosterId: 88, pts: 71 },
          { tournamentRosterId: 91, pts: 67 },
        ],
      });
      expect(warn).toHaveBeenNthCalledWith(1, {
        event: 'match_player_points_mismatch',
        matchId: 501,
        side: MatchSide.HOME,
        playerPoints: 71,
        officialScore: 72,
      });
      expect(warn).toHaveBeenNthCalledWith(2, {
        event: 'match_player_points_mismatch',
        matchId: 501,
        side: MatchSide.AWAY,
        playerPoints: 67,
        officialScore: 68,
      });
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('does not warn when both PERIODS totals match', async () => {
      const warn = watchWarnings();
      arrangeResult();
      await service.submitResult(42, 501, normalResultDto);
      expect(warn).not.toHaveBeenCalled();
    });

    it('does not warn for an AWARDED DEFAULT', async () => {
      const warn = watchWarnings();
      arrangeResult();
      await service.submitResult(42, 501, {
        resultType: LossType.DEFAULT,
        offendingTournamentTeamId: 52,
        periods: [
          {
            periodNumber: 1,
            periodType: PeriodType.REGULAR,
            homePoints: 18,
            awayPoints: 22,
          },
        ],
        playerStats: [
          { tournamentRosterId: 88, pts: 18 },
          { tournamentRosterId: 91, pts: 22 },
        ],
      });
      expect(warn).not.toHaveBeenCalled();
    });

    it('does not warn for a FORFEIT', async () => {
      const warn = watchWarnings();
      arrangeResult();
      await service.submitResult(42, 501, {
        resultType: LossType.FORFEIT,
        offendingTournamentTeamId: 52,
      });
      expect(warn).not.toHaveBeenCalled();
    });

    it('does not warn for empty playerStats', async () => {
      const warn = watchWarnings();
      arrangeResult();
      await service.submitResult(42, 501, {
        periods: normalPeriods,
        playerStats: [],
      });
      expect(warn).not.toHaveBeenCalled();
    });

    it('does not warn when pts is untracked for every player', async () => {
      const warn = watchWarnings();
      arrangeResult();
      await service.submitResult(42, 501, {
        periods: normalPeriods,
        playerStats: [
          { tournamentRosterId: 88, pts: null },
          { tournamentRosterId: 91, pts: null },
        ],
      });
      expect(warn).not.toHaveBeenCalled();
    });

    it('logs once only after a P2034 retry succeeds', async () => {
      const warn = watchWarnings();
      arrangeResult();
      mockPrisma.$transaction
        .mockRejectedValueOnce(p2034())
        .mockImplementationOnce((callback) =>
          Promise.resolve(callback(mockTx)),
        );
      await service.submitResult(42, 501, {
        ...normalResultDto,
        playerStats: [
          { tournamentRosterId: 88, pts: 71 },
          { tournamentRosterId: 91, pts: 68 },
        ],
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('does not warn when the transaction fails', async () => {
      const warn = watchWarnings();
      arrangeResult();
      mockPrisma.$transaction.mockRejectedValue(
        new Error('database unavailable'),
      );
      await expect(
        service.submitResult(42, 501, normalResultDto),
      ).rejects.toThrow('database unavailable');
      expect(warn).not.toHaveBeenCalled();
      expect(mockPrisma.match.findFirst).not.toHaveBeenCalled();
    });

    it('does not warn after four P2034 conflicts', async () => {
      const warn = watchWarnings();
      arrangeResult();
      mockPrisma.$transaction.mockRejectedValue(p2034());
      const error = await captureApiException(
        service.submitResult(42, 501, normalResultDto),
      );
      expect(apiError(error).code).toBe('CONCURRENT_MODIFICATION');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(4);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('scoresheet DTO validation', () => {
    it('accepts an empty draft body', async () => {
      await expect(invalidProperties(SaveMatchDraftDto, {})).resolves.toEqual(
        [],
      );
    });

    it('validates nested period primitives', async () => {
      await expect(
        invalidProperties(SaveMatchDraftDto, {
          periods: [
            {
              periodNumber: 0,
              periodType: 'INVALID',
              homePoints: -1,
              awayPoints: 2.5,
            },
          ],
        }),
      ).resolves.toEqual(['periods']);
    });

    it('accepts null and omitted player metrics but rejects negatives', async () => {
      await expect(
        invalidProperties(MatchPlayerStatisticInputDto, {
          tournamentRosterId: 88,
          pts: null,
        }),
      ).resolves.toEqual([]);
      await expect(
        invalidProperties(MatchPlayerStatisticInputDto, {
          tournamentRosterId: 88,
        }),
      ).resolves.toEqual([]);
      await expect(
        invalidProperties(MatchPlayerStatisticInputDto, {
          tournamentRosterId: 88,
          pts: -1,
        }),
      ).resolves.toEqual(['pts']);
    });

    it('accepts only the persisted loss types as resultType', async () => {
      await expect(
        invalidProperties(SubmitMatchResultDto, {
          resultType: LossType.NORMAL,
        }),
      ).resolves.toEqual([]);
      await expect(
        invalidProperties(SubmitMatchResultDto, { resultType: 'OTHER' }),
      ).resolves.toEqual(['resultType']);
    });

    it('rejects null for non-nullable collection and discriminator fields', async () => {
      await expect(
        invalidProperties(SaveMatchDraftDto, { periods: null }),
      ).resolves.toEqual(['periods']);
      await expect(
        invalidProperties(SaveMatchDraftDto, { playerStats: null }),
      ).resolves.toEqual(['playerStats']);
      await expect(
        invalidProperties(SubmitMatchResultDto, { resultType: null }),
      ).resolves.toEqual(['resultType']);
    });

    it('transforms nested numeric strings at the HTTP boundary', () => {
      const dto = plainToInstance(SaveMatchDraftDto, {
        periods: [
          {
            periodNumber: '1',
            periodType: PeriodType.REGULAR,
            homePoints: '18',
            awayPoints: '22',
          },
        ],
        mvpTournamentRosterId: '88',
      });
      expect(dto.periods?.[0]).toEqual({
        periodNumber: 1,
        periodType: PeriodType.REGULAR,
        homePoints: 18,
        awayPoints: 22,
      });
      expect(dto.mvpTournamentRosterId).toBe(88);
    });

    it('rejects a body carrying derived result fields at the HTTP boundary', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      });
      const error = await captureApiException(
        pipe.transform(
          {
            periods: [],
            playerStats: [],
            finalScore: 99,
            isWinner: true,
            scoreSource: 'PERIODS',
            lossType: 'NORMAL',
            result: 'WIN',
          },
          { type: 'body', metatype: SaveMatchDraftDto },
        ),
      );
      expect(apiError(error).code).toBe('VALIDATION_ERROR');
    });
  });

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

    it('keeps scoresheet relations visible for a stale forfeit on a live match', async () => {
      mockPrisma.match.findFirst.mockResolvedValue({
        ...detailRow,
        status: MatchStatus.LIVE,
        teams: detailRow.teams.map((team, index) => ({
          ...team,
          lossType: index === 0 ? null : LossType.FORFEIT,
        })),
        periods: [
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
      });
      const result = await service.findOne(42, 501);
      expect(result.periods).toHaveLength(1);
      expect(result.scoreSource).toBeNull();
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

  function arrangeUpdate(
    overrides: Partial<typeof updateTargetRow> = {},
  ): void {
    mockTx.match.findFirst.mockResolvedValue({
      ...updateTargetRow,
      ...overrides,
    });
    mockTx.match.update.mockResolvedValue({ id: 501 });
    mockTx.matchTeam.updateMany.mockResolvedValue({ count: 2 });
    mockTx.matchTeam.update.mockResolvedValue({ id: 601 });
    mockPrisma.match.findFirst.mockResolvedValue(detailRow);
  }

  describe('patch body validation', () => {
    const validateBody = async (body: object): Promise<string[]> => {
      const errors = await validate(plainToInstance(UpdateMatchDto, body));
      return errors.map((error) => error.property);
    };

    it.each(['scheduledAt', 'homeTournamentTeamId', 'awayTournamentTeamId'])(
      'rejects an explicit null for %s',
      async (property) => {
        await expect(validateBody({ [property]: null })).resolves.toEqual([
          property,
        ]);
      },
    );

    it.each(['tournamentGroupId', 'matchNumber', 'venueName'])(
      'accepts an explicit null for %s',
      async (property) => {
        await expect(validateBody({ [property]: null })).resolves.toEqual([]);
      },
    );

    it('accepts a body that omits every key', async () => {
      await expect(validateBody({})).resolves.toEqual([]);
    });
  });

  describe('update', () => {
    it('returns detail for an empty patch without a transaction or write', async () => {
      mockPrisma.match.findFirst.mockResolvedValue(detailRow);
      await expect(
        service.update(42, 501, plainToInstance(UpdateMatchDto, {})),
      ).resolves.toBeDefined();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.match.update).not.toHaveBeenCalled();
    });

    it('reads the patch target with the tenant-scoped update selector', async () => {
      arrangeUpdate({});
      await service.update(42, 501, { venueName: 'New Arena' });
      expect(mockTx.match.findFirst).toHaveBeenCalledWith({
        where: {
          id: 501,
          organizationId: 42,
          isDeleted: false,
          tournament: { organizationId: 42, isDeleted: false },
        },
        select: matchUpdateTargetSelect,
      });
    });

    it('skips the side swap when a participant key repeats the stored id', async () => {
      arrangeUpdate({ tournamentGroupId: null });
      mockTx.tournamentTeam.findFirst
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
      await service.update(42, 501, { homeTournamentTeamId: 41 });
      expect(mockTx.matchTeam.updateMany).not.toHaveBeenCalled();
      expect(mockTx.matchTeam.update).not.toHaveBeenCalled();
    });

    it('skips the scoresheet guard for a scheduled participant edit', async () => {
      arrangeUpdate({
        status: MatchStatus.SCHEDULED,
        tournamentGroupId: null,
      });
      mockTx.tournamentTeam.findFirst
        .mockResolvedValueOnce({
          id: 63,
          tournamentId: 12,
          status: TournamentTeamStatus.ACTIVE,
        })
        .mockResolvedValueOnce({
          id: 52,
          tournamentId: 12,
          status: TournamentTeamStatus.ACTIVE,
        });
      await service.update(42, 501, { homeTournamentTeamId: 63 });
      expect(mockTx.matchPeriod.findFirst).not.toHaveBeenCalled();
      expect(mockTx.matchRoster.findFirst).not.toHaveBeenCalled();
      expect(mockTx.playerMatchStatistic.findFirst).not.toHaveBeenCalled();
      expect(mockTx.matchTeam.updateMany).toHaveBeenCalledTimes(2);
    });

    it.each([
      MatchStatus.SCHEDULED,
      MatchStatus.POSTPONED,
      MatchStatus.LIVE,
      MatchStatus.FINISHED,
      MatchStatus.CANCELLED,
    ])('allows matchNumber and venueName while %s', async (status) => {
      arrangeUpdate({ status });
      await service.update(42, 501, { matchNumber: null, venueName: null });
      expect(mockTx.match.update).toHaveBeenCalledWith({
        where: { id: 501 },
        data: { matchNumber: null, venueName: null },
      });
    });

    it.each([MatchStatus.SCHEDULED, MatchStatus.POSTPONED, MatchStatus.LIVE])(
      'allows scheduledAt while %s',
      async (status) => {
        arrangeUpdate({ status });
        await service.update(42, 501, {
          scheduledAt: '2026-08-18T20:00:00.000Z',
        });
        expect(mockTx.match.update).toHaveBeenCalledWith({
          where: { id: 501 },
          data: {
            scheduledAt: new Date('2026-08-18T20:00:00.000Z'),
            ...(status === MatchStatus.POSTPONED
              ? { status: MatchStatus.SCHEDULED }
              : {}),
          },
        });
      },
    );

    it.each([MatchStatus.FINISHED, MatchStatus.CANCELLED])(
      'rejects scheduledAt while %s',
      async (status) => {
        arrangeUpdate({ status });
        const error = await captureApiException(
          service.update(42, 501, {
            scheduledAt: '2026-08-18T20:00:00.000Z',
          }),
        );
        expect(apiError(error)).toEqual({
          code: 'INVALID_STATUS_TRANSITION',
          message:
            'scheduledAt cannot be changed for a finished or cancelled match.',
        });
      },
    );

    it.each(
      [MatchStatus.LIVE, MatchStatus.FINISHED, MatchStatus.CANCELLED].flatMap(
        (status) =>
          [{ homeTournamentTeamId: 63 }, { tournamentGroupId: null }].map(
            (patch) => ({ status, patch }),
          ),
      ),
    )('rejects $patch while $status', async ({ status, patch }) => {
      arrangeUpdate({ status });
      const error = await captureApiException(service.update(42, 501, patch));
      expect(apiError(error)).toEqual({
        code: 'INVALID_STATUS_TRANSITION',
        message:
          'Participants and tournamentGroupId can only be changed for scheduled or postponed matches.',
      });
    });

    it('reschedules POSTPONED when the scheduledAt key is present even unchanged', async () => {
      arrangeUpdate({ status: MatchStatus.POSTPONED });
      await service.update(42, 501, {
        scheduledAt: '2026-08-15T19:30:00.000Z',
      });
      expect(mockTx.match.update).toHaveBeenCalledWith({
        where: { id: 501 },
        data: { scheduledAt, status: MatchStatus.SCHEDULED },
      });
    });

    it('keeps POSTPONED when scheduledAt is absent', async () => {
      arrangeUpdate({ status: MatchStatus.POSTPONED });
      await service.update(42, 501, { venueName: 'New Arena' });
      expect(mockTx.match.update).toHaveBeenCalledWith({
        where: { id: 501 },
        data: { venueName: 'New Arena' },
      });
    });

    it('validates a one-side edit against the unchanged other side', async () => {
      arrangeUpdate();
      mockTx.tournamentTeam.findFirst
        .mockResolvedValueOnce({
          id: 63,
          tournamentId: 12,
          status: TournamentTeamStatus.ACTIVE,
        })
        .mockResolvedValueOnce({
          id: 52,
          tournamentId: 12,
          status: TournamentTeamStatus.ACTIVE,
        });
      mockTx.tournamentGroup.findFirst.mockResolvedValue({
        id: 7,
        tournamentId: 12,
      });
      mockTx.tournamentGroupTeam.findFirst.mockResolvedValue({ id: 801 });
      await service.update(42, 501, { homeTournamentTeamId: 63 });
      expect(mockTx.tournamentTeam.findFirst).toHaveBeenNthCalledWith(2, {
        where: { id: 52, organizationId: 42, isDeleted: false },
        select: { id: true, tournamentId: true, status: true },
      });
    });

    it('clears a group after validating the merged participants', async () => {
      arrangeUpdate();
      mockTx.tournamentTeam.findFirst
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
      await service.update(42, 501, { tournamentGroupId: null });
      expect(mockTx.match.update).toHaveBeenCalledWith({
        where: { id: 501 },
        data: { tournamentGroupId: null },
      });
    });

    it('allows a postponed participant edit when all scoresheet relations are empty', async () => {
      arrangeUpdate({ status: MatchStatus.POSTPONED, tournamentGroupId: null });
      mockTx.tournamentTeam.findFirst
        .mockResolvedValueOnce({
          id: 63,
          tournamentId: 12,
          status: TournamentTeamStatus.ACTIVE,
        })
        .mockResolvedValueOnce({
          id: 52,
          tournamentId: 12,
          status: TournamentTeamStatus.ACTIVE,
        });
      mockTx.matchPeriod.findFirst.mockResolvedValue(null);
      mockTx.matchRoster.findFirst.mockResolvedValue(null);
      mockTx.playerMatchStatistic.findFirst.mockResolvedValue(null);
      await expect(
        service.update(42, 501, { homeTournamentTeamId: 63 }),
      ).resolves.toBeDefined();
      expect(mockTx.matchTeam.updateMany).toHaveBeenCalledTimes(2);
    });

    it('returns 404 for a missing or cross-tenant patch target', async () => {
      mockTx.match.findFirst.mockResolvedValue(null);
      const error = await captureApiException(
        service.update(42, 501, { venueName: 'New Arena' }),
      );
      expect(apiError(error)).toEqual({
        code: 'RECORD_NOT_FOUND',
        message: 'Match not found',
      });
      expect(mockTx.match.update).not.toHaveBeenCalled();
    });

    it('preserves side row ids while swapping participants', async () => {
      arrangeUpdate({ tournamentGroupId: null });
      mockTx.tournamentTeam.findFirst
        .mockResolvedValueOnce({
          id: 52,
          tournamentId: 12,
          status: TournamentTeamStatus.ACTIVE,
        })
        .mockResolvedValueOnce({
          id: 41,
          tournamentId: 12,
          status: TournamentTeamStatus.ACTIVE,
        });
      await service.update(42, 501, {
        homeTournamentTeamId: 52,
        awayTournamentTeamId: 41,
      });
      expect(mockTx.matchTeam.updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: { in: [601, 602] },
          matchId: 501,
          organizationId: 42,
          isDeleted: false,
        },
        data: { isDeleted: true },
      });
      expect(mockTx.matchTeam.update).toHaveBeenNthCalledWith(1, {
        where: { id: 601 },
        data: { tournamentTeamId: 52 },
      });
      expect(mockTx.matchTeam.update).toHaveBeenNthCalledWith(2, {
        where: { id: 602 },
        data: { tournamentTeamId: 41 },
      });
      expect(mockTx.matchTeam.updateMany).toHaveBeenNthCalledWith(2, {
        where: {
          id: { in: [601, 602] },
          matchId: 501,
          organizationId: 42,
          isDeleted: true,
        },
        data: { isDeleted: false },
      });
    });

    it.each([
      ['period', 'matchPeriod'],
      ['roster', 'matchRoster'],
      ['statistic', 'playerMatchStatistic'],
    ] as const)(
      'rejects a postponed participant edit with an active %s',
      async (_label, delegate) => {
        arrangeUpdate({
          status: MatchStatus.POSTPONED,
          tournamentGroupId: null,
        });
        mockTx.tournamentTeam.findFirst
          .mockResolvedValueOnce({
            id: 63,
            tournamentId: 12,
            status: TournamentTeamStatus.ACTIVE,
          })
          .mockResolvedValueOnce({
            id: 52,
            tournamentId: 12,
            status: TournamentTeamStatus.ACTIVE,
          });
        mockTx[delegate].findFirst.mockResolvedValue({ id: 1 });
        const error = await captureApiException(
          service.update(42, 501, { homeTournamentTeamId: 63 }),
        );
        expect(apiError(error)).toEqual({
          code: 'MATCH_HAS_SCORESHEET',
          message:
            'Match participants cannot be changed after scoresheet data has been recorded.',
        });
        expect(mockTx.matchTeam.updateMany).not.toHaveBeenCalled();
      },
    );

    it('rejects a non-null group on a linked match', async () => {
      arrangeUpdate({
        tournamentGroupId: null,
        bracketSlots: [
          { id: 101, homeTournamentTeamId: 41, awayTournamentTeamId: 52 },
        ],
      });
      mockTx.tournamentGroup.findFirst.mockResolvedValue({
        id: 7,
        tournamentId: 12,
      });
      mockTx.tournamentTeam.findFirst
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
      mockTx.tournamentGroupTeam.findFirst.mockResolvedValue({ id: 801 });
      const error = await captureApiException(
        service.update(42, 501, { tournamentGroupId: 7 }),
      );
      expect(apiError(error)).toEqual({
        code: 'MATCH_IN_BRACKET',
        message:
          'A match linked to a bracket slot cannot belong to a tournament group.',
      });
    });

    it('accepts a reversed participant pair for a complete linked slot', async () => {
      arrangeUpdate({
        tournamentGroupId: null,
        bracketSlots: [
          { id: 101, homeTournamentTeamId: 41, awayTournamentTeamId: 52 },
        ],
      });
      mockTx.tournamentTeam.findFirst
        .mockResolvedValueOnce({
          id: 52,
          tournamentId: 12,
          status: TournamentTeamStatus.ACTIVE,
        })
        .mockResolvedValueOnce({
          id: 41,
          tournamentId: 12,
          status: TournamentTeamStatus.ACTIVE,
        });
      await expect(
        service.update(42, 501, {
          homeTournamentTeamId: 52,
          awayTournamentTeamId: 41,
        }),
      ).resolves.toBeDefined();
    });

    it('skips pair comparison for an incomplete linked slot', async () => {
      arrangeUpdate({
        tournamentGroupId: null,
        bracketSlots: [
          { id: 101, homeTournamentTeamId: 41, awayTournamentTeamId: null },
        ],
      });
      mockTx.tournamentTeam.findFirst
        .mockResolvedValueOnce({
          id: 63,
          tournamentId: 12,
          status: TournamentTeamStatus.ACTIVE,
        })
        .mockResolvedValueOnce({
          id: 52,
          tournamentId: 12,
          status: TournamentTeamStatus.ACTIVE,
        });
      await expect(
        service.update(42, 501, { homeTournamentTeamId: 63 }),
      ).resolves.toBeDefined();
    });

    it('rejects a complete linked participant mismatch', async () => {
      arrangeUpdate({
        tournamentGroupId: null,
        bracketSlots: [
          { id: 101, homeTournamentTeamId: 41, awayTournamentTeamId: 52 },
        ],
      });
      mockTx.tournamentTeam.findFirst
        .mockResolvedValueOnce({
          id: 63,
          tournamentId: 12,
          status: TournamentTeamStatus.ACTIVE,
        })
        .mockResolvedValueOnce({
          id: 52,
          tournamentId: 12,
          status: TournamentTeamStatus.ACTIVE,
        });
      const error = await captureApiException(
        service.update(42, 501, { homeTournamentTeamId: 63 }),
      );
      expect(apiError(error)).toEqual({
        code: 'MATCH_TEAMS_MISMATCH',
        message:
          'The match participants do not match the bracket slot participants.',
      });
    });

    it('uses Serializable and reloads detail after commit', async () => {
      arrangeUpdate();
      await service.update(42, 501, { venueName: 'New Arena' });
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
      expect(mockPrisma.match.findFirst).toHaveBeenCalledWith({
        where: {
          id: 501,
          organizationId: 42,
          isDeleted: false,
          tournament: { organizationId: 42, isDeleted: false },
        },
        select: matchDetailSelect,
      });
    });

    it('retries P2034 and succeeds on the fourth attempt', async () => {
      arrangeUpdate();
      mockPrisma.$transaction
        .mockRejectedValueOnce(p2034())
        .mockRejectedValueOnce(p2034())
        .mockRejectedValueOnce(p2034())
        .mockImplementationOnce((callback) =>
          Promise.resolve(callback(mockTx)),
        );
      await expect(
        service.update(42, 501, { venueName: 'New Arena' }),
      ).resolves.toBeDefined();
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(4);
    });

    it('returns CONCURRENT_MODIFICATION after four P2034 conflicts', async () => {
      mockPrisma.$transaction.mockRejectedValue(p2034());
      const error = await captureApiException(
        service.update(42, 501, { venueName: 'New Arena' }),
      );
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(4);
      expect(apiError(error)).toEqual({
        code: 'CONCURRENT_MODIFICATION',
        message:
          'The resource changed during this operation. Retry the request.',
      });
    });
  });

  describe('status actions', () => {
    type ActionCase = {
      name: string;
      invoke: (target: MatchesService) => Promise<MatchDetailResponseDto>;
      allowed: MatchStatus[];
      rejected: MatchStatus[];
      next: MatchStatus;
      message: string;
    };

    const actionCases: ActionCase[] = [
      {
        name: 'postpone',
        invoke: (target: MatchesService) => target.postpone(42, 501),
        allowed: [MatchStatus.SCHEDULED, MatchStatus.LIVE],
        rejected: [
          MatchStatus.POSTPONED,
          MatchStatus.FINISHED,
          MatchStatus.CANCELLED,
        ],
        next: MatchStatus.POSTPONED,
        message: 'Only a scheduled or live match can be postponed.',
      },
      {
        name: 'cancel',
        invoke: (target: MatchesService) => target.cancel(42, 501),
        allowed: [
          MatchStatus.SCHEDULED,
          MatchStatus.LIVE,
          MatchStatus.POSTPONED,
        ],
        rejected: [MatchStatus.FINISHED, MatchStatus.CANCELLED],
        next: MatchStatus.CANCELLED,
        message: 'Only a scheduled, live, or postponed match can be cancelled.',
      },
    ];

    it.each(
      actionCases.flatMap((action) =>
        action.allowed.map((status) => ({ action, status })),
      ),
    )(
      '$action.name transitions $status',
      async ({
        action,
        status,
      }: {
        action: ActionCase;
        status: MatchStatus;
      }) => {
        mockPrisma.match.findFirst
          .mockResolvedValueOnce({ ...updateTargetRow, status })
          .mockResolvedValueOnce({ ...detailRow, status: action.next });
        mockPrisma.match.updateMany.mockResolvedValue({ count: 1 });
        const result = await action.invoke(service);
        expect(mockPrisma.match.updateMany).toHaveBeenCalledWith({
          where: {
            id: 501,
            organizationId: 42,
            isDeleted: false,
            status: { in: action.allowed },
          },
          data: { status: action.next },
        });
        expect(mockPrisma.tournamentBracketSlot.update).not.toHaveBeenCalled();
        expect(
          mockPrisma.tournamentBracketSlot.updateMany,
        ).not.toHaveBeenCalled();
        expect(result.status).toBe(action.next);
      },
    );

    it.each(
      actionCases.flatMap((action) =>
        action.rejected.map((status) => ({ action, status })),
      ),
    )(
      '$action.name rejects $status',
      async ({
        action,
        status,
      }: {
        action: ActionCase;
        status: MatchStatus;
      }) => {
        mockPrisma.match.findFirst.mockResolvedValue({
          ...updateTargetRow,
          status,
        });
        const error = await captureApiException(action.invoke(service));
        expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
        expect(apiError(error)).toEqual({
          code: 'INVALID_STATUS_TRANSITION',
          message: action.message,
        });
        expect(mockPrisma.match.updateMany).not.toHaveBeenCalled();
      },
    );

    it.each(actionCases)(
      '$name is not idempotent after a conditional-write race',
      async (action) => {
        mockPrisma.match.findFirst
          .mockResolvedValueOnce({
            ...updateTargetRow,
            status: action.allowed[0],
          })
          .mockResolvedValueOnce({
            ...updateTargetRow,
            status: action.next,
          });
        mockPrisma.match.updateMany.mockResolvedValue({ count: 0 });
        const error = await captureApiException(action.invoke(service));
        expect(apiError(error)).toEqual({
          code: 'INVALID_STATUS_TRANSITION',
          message: action.message,
        });
      },
    );

    it.each(actionCases)(
      '$name returns 404 before writing for a missing match',
      async (action) => {
        mockPrisma.match.findFirst.mockResolvedValue(null);
        const error = await captureApiException(action.invoke(service));
        expect(apiError(error)).toEqual({
          code: 'RECORD_NOT_FOUND',
          message: 'Match not found',
        });
        expect(mockPrisma.match.updateMany).not.toHaveBeenCalled();
      },
    );

    it.each(actionCases)(
      '$name reports a still-allowed zero-count race as concurrent modification',
      async (action) => {
        mockPrisma.match.findFirst
          .mockResolvedValueOnce({
            ...updateTargetRow,
            status: action.allowed[0],
          })
          .mockResolvedValueOnce({
            ...updateTargetRow,
            status: action.allowed[0],
          });
        mockPrisma.match.updateMany.mockResolvedValue({ count: 0 });
        const error = await captureApiException(action.invoke(service));
        expect(apiError(error)).toEqual({
          code: 'CONCURRENT_MODIFICATION',
          message:
            'The resource changed during this operation. Retry the request.',
        });
      },
    );
  });
});
