import { HttpStatus } from '@nestjs/common';
import { expect, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  LossType,
  MatchResult,
  MatchStatus,
  TournamentFormat,
  TournamentStatus,
} from '@prisma/client';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { StandingsService } from './standings.service';

type AsyncMock = jest.Mock<(input?: unknown) => Promise<unknown>>;

type MockPrisma = {
  tournament: { findFirst: AsyncMock };
  tournamentTeam: {
    findMany: AsyncMock;
    update: AsyncMock;
    updateMany: AsyncMock;
  };
  tournamentGroup: { findMany: AsyncMock };
  tournamentGroupTeam: { findMany: AsyncMock };
  match: { findMany: AsyncMock };
  $transaction: AsyncMock;
};

const createAsyncMock = (): AsyncMock =>
  jest.fn<(input?: unknown) => Promise<unknown>>();

const mockPrisma: MockPrisma = {
  tournament: { findFirst: createAsyncMock() },
  tournamentTeam: {
    findMany: createAsyncMock(),
    update: createAsyncMock(),
    updateMany: createAsyncMock(),
  },
  tournamentGroup: { findMany: createAsyncMock() },
  tournamentGroupTeam: { findMany: createAsyncMock() },
  match: { findMany: createAsyncMock() },
  $transaction: createAsyncMock(),
};

// Registration row as `standingsTeamSelect` returns it.
const team = (
  id: number,
  displayNameSnapshot: string,
  tiebreak: {
    tiebreakOrder?: number | null;
    tiebreakBlockKey?: string | null;
  } = {},
) => ({
  id,
  teamId: id * 10,
  displayNameSnapshot,
  tiebreakOrder: tiebreak.tiebreakOrder ?? null,
  tiebreakBlockKey: tiebreak.tiebreakBlockKey ?? null,
});

let matchId = 0;

// A finished match. `lossType` applies to whichever side lost.
const finished = (
  homeId: number,
  homeScore: number,
  awayId: number,
  awayScore: number,
  options: { groupId?: number | null; lossType?: LossType } = {},
) => {
  const homeWon = homeScore > awayScore;
  const loss = options.lossType ?? LossType.NORMAL;
  matchId += 1;
  return {
    id: matchId,
    status: MatchStatus.FINISHED,
    tournamentGroupId: options.groupId ?? null,
    teams: [
      {
        tournamentTeamId: homeId,
        finalScore: homeScore,
        result: homeWon ? MatchResult.WIN : MatchResult.LOSS,
        lossType: homeWon ? null : loss,
      },
      {
        tournamentTeamId: awayId,
        finalScore: awayScore,
        result: homeWon ? MatchResult.LOSS : MatchResult.WIN,
        lossType: homeWon ? loss : null,
      },
    ],
  };
};

const unplayed = (
  homeId: number,
  awayId: number,
  status: MatchStatus = MatchStatus.SCHEDULED,
  groupId: number | null = null,
) => {
  matchId += 1;
  return {
    id: matchId,
    status,
    tournamentGroupId: groupId,
    teams: [
      {
        tournamentTeamId: homeId,
        finalScore: null,
        result: null,
        lossType: null,
      },
      {
        tournamentTeamId: awayId,
        finalScore: null,
        result: null,
        lossType: null,
      },
    ],
  };
};

function arrangeLeague(
  teams: ReturnType<typeof team>[],
  matches: unknown[],
  status: TournamentStatus = TournamentStatus.IN_PROGRESS,
): void {
  mockPrisma.tournament.findFirst.mockResolvedValue({
    id: 12,
    status,
    format: TournamentFormat.LEAGUE,
  });
  mockPrisma.tournamentTeam.findMany.mockResolvedValue(teams);
  mockPrisma.match.findMany.mockResolvedValue(matches);
}

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

function getApiErrorCode(error: ApiException): string {
  const response = error.getResponse();
  if (
    typeof response !== 'object' ||
    response === null ||
    !('error' in response) ||
    typeof response.error !== 'object' ||
    response.error === null ||
    !('code' in response.error) ||
    typeof response.error.code !== 'string'
  ) {
    throw new Error('Expected ApiException error response');
  }
  return response.error.code;
}

describe('StandingsService', () => {
  let service: StandingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    matchId = 0;
    const module = await Test.createTestingModule({
      providers: [
        StandingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(StandingsService);
  });

  it('ranks a league by classification points', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo'), team(3, 'Charlie')],
      [finished(1, 80, 2, 70), finished(1, 90, 3, 60), finished(2, 85, 3, 70)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.map((row) => row.tournamentTeamId)).toEqual([1, 2, 3]);
  });

  it('exposes a league table with no group', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 80, 2, 70)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.group).toBeNull();
  });

  it('scores a normal loss as one classification point', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 80, 2, 70)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(
      table.rows.find((row) => row.tournamentTeamId === 2)
        ?.classificationPoints,
    ).toBe(1);
  });

  it('scores a loss by forfeit as zero classification points', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo'), team(3, 'Charlie')],
      [
        finished(1, 20, 2, 0, { lossType: LossType.FORFEIT }),
        finished(3, 80, 2, 70),
      ],
    );

    const [table] = await service.findStandings(42, 12);

    expect(
      table.rows.find((row) => row.tournamentTeamId === 2)
        ?.classificationPoints,
    ).toBe(1);
  });

  it('counts a forfeit loss as a loss even though it scores nothing', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 20, 2, 0, { lossType: LossType.FORFEIT })],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.find((row) => row.tournamentTeamId === 2)?.losses).toBe(
      1,
    );
  });

  it('reports pointDiff as pointsFor minus pointsAgainst', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 80, 2, 70)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(
      table.rows.find((row) => row.tournamentTeamId === 1)?.pointDiff,
    ).toBe(10);
  });

  it('reports a null winPct for a team that has not played', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo'), team(3, 'Charlie')],
      [finished(1, 80, 2, 70)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(
      table.rows.find((row) => row.tournamentTeamId === 3)?.winPct,
    ).toBeNull();
  });

  it('skips a finished match whose result is not recorded on both sides', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [{ ...unplayed(1, 2), status: MatchStatus.FINISHED }],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.every((row) => row.played === 0)).toBe(true);
  });

  it('marks a table with no counted match as EMPTY', async () => {
    arrangeLeague([team(1, 'Alpha'), team(2, 'Bravo')], [unplayed(1, 2)]);

    const [table] = await service.findStandings(42, 12);

    expect(table.standingsState).toBe('EMPTY');
  });

  it('leaves every position null while the table is EMPTY', async () => {
    arrangeLeague([team(1, 'Alpha'), team(2, 'Bravo')], [unplayed(1, 2)]);

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.every((row) => row.position === null)).toBe(true);
  });

  it('orders an EMPTY table by team name', async () => {
    arrangeLeague([team(2, 'Zulu'), team(1, 'Alpha')], [unplayed(1, 2)]);

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.map((row) => row.tournamentTeamId)).toEqual([1, 2]);
  });

  it('marks a table with a counted and a pending match as PARTIAL', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 80, 2, 70), unplayed(1, 2)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.standingsState).toBe('PARTIAL');
  });

  it('marks a fully played table as FINAL', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 80, 2, 70)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.standingsState).toBe('FINAL');
  });

  it('counts scheduled, live, and postponed matches as pending', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [
        finished(1, 80, 2, 70),
        unplayed(1, 2, MatchStatus.SCHEDULED),
        unplayed(1, 2, MatchStatus.LIVE),
        unplayed(1, 2, MatchStatus.POSTPONED),
      ],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.pendingMatches).toBe(3);
  });

  it('does not hold a table in PARTIAL because of a cancelled match', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 80, 2, 70), unplayed(1, 2, MatchStatus.CANCELLED)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.standingsState).toBe('FINAL');
  });

  it('returns 404 for a missing or cross-tenant tournament', async () => {
    mockPrisma.tournament.findFirst.mockResolvedValue(null);

    const error = await captureApiException(service.findStandings(42, 999));

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });
});
